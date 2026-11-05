// P4.2 tests: read-only persistent-goals client (marg-goals.js) and its wiring. Run: node goals-client.test.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const G = require('./marg-goals.js');

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, detail || ''); } }
const GOAL = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const store = (v) => ({ getItem: (k) => (k === G.FLAG_KEY ? v : null) });
const win = (name, v) => ({ MARG_ENV: name ? { name } : undefined, localStorage: store(v) });

// ---- flag
check('C1 flag off with no environment object', G.isEnabled({ localStorage: store('on') }) === false);
check('C2 flag off in production even if storage says on', G.isEnabled(win('production', 'on')) === false);
check('C3 flag off on staging without opt-in', G.isEnabled(win('staging', null)) === false && G.isEnabled(win('staging', 'yes')) === false);
check('C4 flag on only for staging plus explicit opt-in', G.isEnabled(win('staging', 'on')) === true);
check('C5 storage that throws means off', G.isEnabled({ MARG_ENV: { name: 'staging' }, localStorage: { getItem() { throw new Error('blocked'); } } }) === false);

// ---- scope
check('S1 general scope filters to rows with no goal', G.scopeFilter(G.generalScope()) === '&goal_id=is.null');
check('S2 goal scope filters to that goal', G.scopeFilter(G.goalScope(GOAL)) === '&goal_id=eq.' + GOAL);
check('S3 a non-uuid goal id is refused', (() => { try { G.goalScope('1;drop'); return false; } catch (e) { return true; } })());
check('S4 unknown or missing scope fails closed (matches nothing, never everything)', G.scopeFilter(null).includes('is.null') && G.scopeFilter(null).includes('not.is.null') && G.scopeFilter({ kind: 'goal', goalId: 'x' }).includes('not.is.null') && G.scopeFilter({ kind: 'all' }).includes('not.is.null'));
check('S5 uppercase uuid is normalised, injection in goal id impossible', G.scopeFilter(G.goalScope(GOAL.toUpperCase())) === '&goal_id=eq.' + GOAL);

// ---- shape cleaning
check('P1 preview keeps counts only and drops unknown fields', JSON.stringify(G.cleanPreview({ diagnoses: 1, tasks: 2, attempts: 3, evidence: 4, secret: 'x', first_activity: '2026-01-01T00:00:00Z', last_activity: null })) === JSON.stringify({ diagnoses: 1, tasks: 2, attempts: 3, evidence: 4, firstActivity: '2026-01-01T00:00:00Z', lastActivity: null }));
check('P2 preview with a negative, fractional, string or missing count is rejected', [{ diagnoses: -1, tasks: 0, attempts: 0, evidence: 0 }, { diagnoses: 1.5, tasks: 0, attempts: 0, evidence: 0 }, { diagnoses: '1', tasks: 0, attempts: 0, evidence: 0 }, { diagnoses: 1, tasks: 0, attempts: 0 }, null, 'x'].every((x) => G.cleanPreview(x) === null));
check('P3 goal rows with a bad id are dropped and unknown status is normalised', G.cleanGoal({ id: 'nope', title: 't' }) === null && G.cleanGoal({ id: GOAL, title: 't', kind: 'k', status: 'weird' }).status === 'active');

// ---- client
function mkClient(opts) {
  opts = opts || {};
  const calls = [];
  let user = opts.user === undefined ? 'user-a' : opts.user;
  const client = G.createClient({
    baseUrl: 'https://stg.example',
    getUserId: () => user,
    isEnabled: () => opts.enabled !== false,
    fetch: async (url, o) => {
      calls.push([(o && o.method) || 'GET', url, o && o.body]);
      if (opts.onFetch) return opts.onFetch(url, o, { setUser: (u) => { user = u; } });
      if (url.includes('/rest/v1/goals')) return { ok: true, status: 200, json: async () => [{ id: GOAL, kind: 'career', title: 'My goal <b>x</b>', status: 'active', origin: 'created', archived_at: null, extra: 'drop' }] };
      return { ok: true, status: 200, json: async () => ({ diagnoses: 2, tasks: 3, attempts: 1, evidence: 4, first_activity: null, last_activity: null }) };
    }
  });
  return { client, calls, setUser: (u) => { user = u; } };
}
const off = mkClient({ enabled: false });
check('L1 flag off: no network call at all', (await off.client.load()).state === 'off' && off.calls.length === 0);
const signedOut = mkClient({ user: null });
check('L2 signed out: no network call', (await signedOut.client.load()).state === 'off' && signedOut.calls.length === 0);

const ok = mkClient();
const res = await ok.client.load();
check('L3 loads goals and counts', res.state === 'ok' && res.goals.length === 1 && res.preview.tasks === 3);
check('L4 read-only: exactly one GET of goals and one POST of the preview function, nothing else', ok.calls.length === 2 && ok.calls[0][0] === 'GET' && /\/rest\/v1\/goals\?/.test(ok.calls[0][1]) && ok.calls[1][0] === 'POST' && /\/rpc\/preview_workspace_adoption$/.test(ok.calls[1][1]) && ok.calls[1][2] === '{}', JSON.stringify(ok.calls));
check('L5 archived goals are not requested', /archived_at=is\.null/.test(ok.calls[0][1]));
check('L6 returned goal has only whitelisted fields', !('extra' in res.goals[0]));

const httpErr = mkClient({ onFetch: async () => ({ ok: false, status: 401 }) });
check('L7 an HTTP error gives "unavailable", not an exception', (await httpErr.client.load()).state === 'unavailable');
const netErr = mkClient({ onFetch: async () => { throw new Error('offline'); } });
check('L8 a network failure gives "unavailable", not an exception', (await netErr.client.load()).state === 'unavailable');
const badShape = mkClient({ onFetch: async (url) => (url.includes('/goals') ? { ok: true, json: async () => ({ not: 'an array' }) } : { ok: true, json: async () => ({}) }) });
check('L9 a malformed goals answer is unavailable', (await badShape.client.load()).state === 'unavailable');
const switching = mkClient({ onFetch: async (url, o, h) => { if (url.includes('/rpc/')) h.setUser('user-b'); return url.includes('/goals') ? { ok: true, json: async () => [{ id: GOAL, title: 'A only', kind: 'k' }] } : { ok: true, json: async () => ({ diagnoses: 9, tasks: 9, attempts: 9, evidence: 9 }) }; } });
const sw = await switching.client.load();
check('L10 account switched while loading: the answer is discarded (account A data never shown to B)', sw.state === 'stale' && !sw.goals && !sw.preview, JSON.stringify(sw));

// ---- panel
const panel = G.panelHtml({ state: 'ok', goals: [{ title: 'x<script>alert(1)</script>', status: 'active', origin: 'created' }], preview: { diagnoses: 1, tasks: 2, attempts: 0, evidence: 0 } });
check('R1 goal titles are escaped', !/<script>/.test(panel) && /&lt;script&gt;/.test(panel));
check('R2 the panel has no buttons, links or handlers (nothing it shows can change data)', !/<button|<a |onclick|<form|<input/i.test(panel));
check('R3 the panel says counts only, nothing moved', /Counts only; nothing has been moved or changed/.test(panel) && /1 diagnoses, 2 tasks/.test(panel));
check('R4 empty state is honest', /no saved goals yet/i.test(G.panelHtml({ state: 'ok', goals: [], preview: { diagnoses: 0, tasks: 0, attempts: 0, evidence: 0 } })));
check('R5 unavailable state does not claim an empty account', !/no saved goals/i.test(G.panelHtml({ state: 'unavailable' })) && /could not be loaded/.test(G.panelHtml({ state: 'unavailable' })));
check('R6 off and stale render nothing', G.panelHtml({ state: 'off' }) === '' && G.panelHtml({ state: 'stale' }) === '');

// ---- source rules
const src = fs.readFileSync('marg-goals.js', 'utf8');
const app = fs.readFileSync('marg-app.js', 'utf8');
const idx = fs.readFileSync('index.html', 'utf8');
check('X1 module never names an exam or section (shared logic stays goal-agnostic)', !/\b(CAT|VARC|DILR|QA)\b/.test(src));
check('X2 module has no write verb and calls only two endpoints', !/(PATCH|DELETE|PUT)/.test(src) && (src.match(/\/rest\/v1\/[a-z_\/]+/g) || []).sort().join() === ['/rest/v1/goals', '/rest/v1/rpc/preview_workspace_adoption'].join());
const reads = ['mentor_diagnoses?select', 'mentor_tasks?select', 'mentor_task_attempts?select', 'mentor_diagnosis_evidence?select'];
check('X3 all four mentor reads carry the scope filter', reads.every((r) => { const i = app.indexOf("/rest/v1/" + r); return i > 0 && app.slice(i, i + 260).includes('margReadScopeFilter()'); }));
const fnSrc = app.slice(app.indexOf('var margActiveScope = null;'), app.indexOf('var margGoalsClient = null;'));
const make = (w) => new Function('window', fnSrc + '; return margReadScopeFilter;')(w);
check('X4 with the flag off the scope filter is exactly an empty string', make({ MargGoals: G, MARG_ENV: { name: 'production' }, localStorage: store('on') })() === '' && make({})() === '');
check('X5 with the flag on and no goal chosen, reads are General-only', make({ MargGoals: G, MARG_ENV: { name: 'staging' }, localStorage: store('on') })() === '&goal_id=is.null');
check('X6 index.html loads marg-goals.js before the app code', idx.indexOf('/marg-goals.js') > 0 && idx.indexOf('/marg-goals.js') < idx.indexOf('/chat-topics.js'));
check('X7 the panel call is guarded by the flag and cannot break the goals tab', /renderPersistentGoalsPanel\(\)\.catch\(function\(\) \{\}\)/.test(app) && /async function renderPersistentGoalsPanel\(\) \{\n  if \(typeof window === 'undefined' \|\| !window\.MargGoals \|\| !window\.MargGoals\.isEnabled\(window\)\) return;/.test(app));

check('X8 when saved goals show (or could not be loaded), the old "goals are not saved yet / no saved goal" lines are removed', /result\.state === 'ok' \|\| result\.state === 'unavailable'\) \{[\s\S]{0,300}not \(available\|saved\) yet/.test(app));
check('X10 the empty state is one message, not two: the panel carries it and the older line is removed', (G.panelHtml({ state: 'ok', goals: [], preview: { diagnoses: 0, tasks: 0, attempts: 0, evidence: 0 } }).match(/no saved goals yet/gi) || []).length === 1 && /ok'/.test(app.slice(app.indexOf('When saved goals are shown'), app.indexOf('When saved goals are shown') + 400)));
check('X9 the two new-in-this-phase files are plain ASCII (no encoding damage on any server)', !/[^\x00-\x7F]/.test(src) && !/[^\x00-\x7F]/.test(fs.readFileSync('marg-env.js', 'utf8')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
