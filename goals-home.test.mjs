// P4.4 tests: Home goal cards, Daily Loop focus and Journey picker (marg-goals-home.js). Run: node goals-home.test.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const H = require('./marg-goals-home.js');

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, detail || ''); } }
const A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', B = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';
const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => '' });

function mk(opts) {
  opts = opts || {};
  const calls = [];
  let user = opts.user === undefined ? 'user-a' : opts.user;
  const client = H.createClient({
    baseUrl: 'https://stg.example', getUserId: () => user, isEnabled: () => opts.enabled !== false,
    fetch: async (url, o) => { calls.push({ m: (o && o.method) || 'GET', url, body: o && o.body ? JSON.parse(o.body) : null }); return opts.onFetch ? opts.onFetch(url, o, (u) => { user = u; }) : res(200, []); }
  });
  return { client, calls };
}

// ---- pure helpers
const act = H.pickActivity([
  { goal_id: A, title: 'Newest done task', status: 'completed', updated_at: '2026-11-03T10:00:00Z' },
  { goal_id: A, title: 'Open check', status: 'ready', updated_at: '2026-11-02T10:00:00Z' },
  { goal_id: A, title: 'Older open', status: 'in_progress', updated_at: '2026-11-01T10:00:00Z' },
  { goal_id: B, title: 'Only done', status: 'completed', updated_at: '2026-10-01T10:00:00Z' },
  { goal_id: 'bad', title: 'x', status: 'ready', updated_at: '2026-10-01T10:00:00Z' }, null
]);
check('H1 last activity is the newest saved update per goal', act[A].lastAt.startsWith('2026-11-03') && act[B].lastAt.startsWith('2026-10-01'));
check('H2 the next step is the newest open task, never a finished one', act[A].next.title === 'Open check' && act[B].next === null);
check('H3 rows with a bad goal id are ignored and a goal with no rows has no entry (nothing is invented)', !('bad' in act) && Object.keys(act).length === 2 && H.pickActivity([]) && Object.keys(H.pickActivity([])).length === 0);
check('H4 the goal prefix is removed from references', H.stripRefs([{ client_ref: 'gaaaaaaaa~diagnosis:qa:slow' }, { client_ref: 'plain' }, null]).map((r) => r.client_ref).join() === 'diagnosis:qa:slow,plain');

// ---- client: no network when off
const off = mk({ enabled: false }), so = mk({ user: null });
check('C1 flag off or signed out: no network call for any method', (await off.client.loadFocus()).state === 'off' && (await off.client.loadActivity()).state === 'off' && (await off.client.loadGoalLoop(A)).state === 'off' && (await off.client.setFocus(null, [])).state === 'off' && (await so.client.loadFocus()).state === 'off' && off.calls.length === 0 && so.calls.length === 0);

// ---- journey rows for one goal
const loop = mk({ onFetch: async (url) => res(200, [{ id: 'r', client_ref: 'gaaaaaaaa~x' }]) });
const lr = await loop.client.loadGoalLoop(A);
check('J1 a goal journey reads the four tables with that goal only, read-only', lr.state === 'ok' && loop.calls.length === 4 && loop.calls.every((c) => c.m === 'GET' && c.url.includes('goal_id=eq.' + A)) && ['mentor_diagnoses', 'mentor_tasks', 'mentor_task_attempts', 'mentor_diagnosis_evidence'].every((t) => loop.calls.some((c) => c.url.includes('/' + t + '?'))));
check('J2 the General workspace reads rows with no goal', (await (async () => { const g = mk({ onFetch: async () => res(200, []) }); await g.client.loadGoalLoop(null); return g.calls.length === 4 && g.calls.every((c) => c.url.includes('goal_id=is.null')); })()));
check('J3 references come back without the prefix', lr.loop.diagnoses[0].client_ref === 'x');
check('J4 a bad goal id makes no request', (await loop.client.loadGoalLoop('1;drop')).state === 'invalid' && loop.calls.length === 4);
let n = 0;
const partial = mk({ onFetch: async () => (++n === 3 ? res(500, null) : res(200, [])) });
check('J5 if any of the four reads fails the whole journey is "unavailable", never an empty journey', (await partial.client.loadGoalLoop(A)).state === 'unavailable');
check('J6 a malformed answer is unavailable', (await mk({ onFetch: async () => res(200, { not: 'array' }) }).client.loadGoalLoop(A)).state === 'unavailable');
check('J7 account switched while loading: discarded', (await mk({ onFetch: async (u, o, setUser) => { setUser('user-b'); return res(200, []); } }).client.loadGoalLoop(A)).state === 'stale');

// ---- focus
check('F1 no row means nothing has been chosen (the screen must ask, not assume)', (await mk({ onFetch: async () => res(200, []) }).client.loadFocus()).chosen === false);
const fn = await mk({ onFetch: async () => res(200, [{ goal_id: null }]) }).client.loadFocus();
check('F2 a saved "no goal" is a choice, different from no choice', fn.state === 'ok' && fn.chosen === true && fn.goalId === null);
check('F3 a saved goal comes back', (await mk({ onFetch: async () => res(200, [{ goal_id: A.toUpperCase() }]) }).client.loadFocus()).goalId === A);
check('F4 a failed read is "unavailable", not "nothing chosen"', (await mk({ onFetch: async () => res(401) }).client.loadFocus()).state === 'unavailable' && (await mk({ onFetch: async () => { throw new Error('x'); } }).client.loadFocus()).state === 'unavailable');
const sf = mk({ onFetch: async () => res(201, null) });
check('F5 choosing a known goal is one upsert of the student\'s own row', (await sf.client.setFocus(A, [A, B])).state === 'ok' && sf.calls.length === 1 && sf.calls[0].m === 'POST' && /daily_loop_focus\?on_conflict=user_id$/.test(sf.calls[0].url) && sf.calls[0].body.goal_id === A && sf.calls[0].body.user_id === 'user-a');
check('F6 choosing "no goal" saves null', (await sf.client.setFocus(null, [A])).state === 'ok' && sf.calls[1].body.goal_id === null);
check('F7 a goal that is not on screen (or malformed) is refused with no request', (await sf.client.setFocus(B, [A])).state === 'invalid' && (await sf.client.setFocus('x', [A])).state === 'invalid' && sf.calls.length === 2);
let release; const gate = new Promise((r) => { release = r; });
const slow = mk({ onFetch: async () => { await gate; return res(201, null); } });
const p1 = slow.client.setFocus(A, [A]); const p2 = await slow.client.setFocus(A, [A]); release(); await p1;
check('F8 a double press makes one request', p2.state === 'busy' && slow.calls.length === 1);
check('F9 a failed save says error and the caller keeps the old focus', (await mk({ onFetch: async () => res(500) }).client.setFocus(A, [A])).state === 'error');

// ---- activity
const ac = mk({ onFetch: async () => res(200, [{ goal_id: A, title: 't', status: 'ready', updated_at: '2026-11-01' }]) });
check('A1 card data is one read of saved tasks that belong to a goal', (await ac.client.loadActivity()).byGoal[A].next.title === 't' && ac.calls.length === 1 && ac.calls[0].m === 'GET' && /goal_id=not\.is\.null/.test(ac.calls[0].url));
check('A2 a failed activity read is unavailable', (await mk({ onFetch: async () => res(500) }).client.loadActivity()).state === 'unavailable');

// ---- cards
const goals = [{ id: A, title: 'Goal <b>A</b>', status: 'active' }, { id: B, title: 'Goal B', status: 'paused' }];
const act2 = { state: 'ok', byGoal: { [A]: { lastAt: '2026-11-03T10:00:00Z', next: { title: 'Open check', status: 'ready' } } } };
const unchosen = H.cardsHtml({ goals, activity: act2, focus: { state: 'ok', chosen: false, goalId: null } });
check('K1 with no choice made the screen asks which goal and marks none as the focus', /Which goal is your Daily Loop for\?/.test(unchosen) && !/Daily Loop focus<\/strong>/.test(unchosen) && !/aria-pressed="true"/.test(unchosen) && !/disabled/.test(unchosen));
const chosen = H.cardsHtml({ goals, activity: act2, focus: { state: 'ok', chosen: true, goalId: A } });
check('K2 the chosen goal is marked and its button is the pressed one; the other goal is not', (chosen.match(/aria-pressed="true"/g) || []).length === 1 && /<strong>Daily Loop focus<\/strong>/.test(chosen) && (chosen.match(/Use for my Daily Loop/g) || []).length === 1);
const general = H.cardsHtml({ goals, activity: act2, focus: { state: 'ok', chosen: true, goalId: null } });
check('K3 a chosen "no goal" is shown as such, and no goal is marked', /<strong>no goal<\/strong>/.test(general) && /Daily Loop: no goal/.test(general) && !/<strong>Daily Loop focus<\/strong>/.test(general));
check('K4 each card shows last activity and next step from saved data', /Last saved activity: /.test(chosen) && /Next step: Open check/.test(chosen) && /No saved activity yet\./.test(chosen) && /No next step saved yet/.test(chosen));
const noActivity = H.cardsHtml({ goals, activity: { state: 'unavailable' }, focus: { state: 'ok', chosen: false } });
check('K5 if activity could not be loaded the cards do not claim "no activity" or "no next step"', !/No saved activity yet|No next step saved yet/.test(noActivity));
check('K6 if the focus could not be loaded it says so and does not ask as if nothing were chosen', /Could not load your Daily Loop focus/.test(H.cardsHtml({ goals, activity: act2, focus: { state: 'unavailable' } })) && !/Which goal is your Daily Loop for/.test(H.cardsHtml({ goals, activity: act2, focus: { state: 'unavailable' } })));
check('K7 no goals: says so plainly and offers nothing to choose', /no saved goals yet/i.test(H.cardsHtml({ goals: [], focus: { state: 'ok', chosen: false } })) && !/<button/.test(H.cardsHtml({ goals: [], focus: { state: 'ok', chosen: false } })));
check('K8 titles are escaped', !/<b>A/.test(unchosen) && /Goal &lt;b&gt;A&lt;\/b&gt;/.test(unchosen));
check('K9 every button is at least 44px tall with 16px text', (unchosen.match(/<button[^>]*>/g) || []).length === 7 && (unchosen.match(/<button[^>]*>/g) || []).every((b) => /min-height:44px/.test(b) && /font-size:16px/.test(b)));
check('K11 the notes use their own visible styling, not the Home header note class that is hidden on small screens', !/home-section-note/.test(unchosen) && (unchosen.match(/class="home-goal-note" style="display:block;font-size:15px/g) || []).length >= 3);
check('K12 a focus on an archived or deleted goal is not shown as chosen: the student is asked again', (function() { var h = H.cardsHtml({ goals, activity: act2, focus: { state: 'ok', chosen: true, goalId: 'ffffffff-1111-4111-8111-ffffffffffff' } }); return /archived or no longer available/.test(h) && /Which goal is your Daily Loop for\?/.test(h) && !/aria-pressed="true"/.test(h); })());
check('K10 each card has open journey, new chat in this goal and use for my Daily Loop; plus one no-goal button', (unchosen.match(/Open journey/g) || []).length === 2 && (unchosen.match(/New chat in this goal/g) || []).length === 2 && (unchosen.match(/Use no goal for my Daily Loop/g) || []).length === 1);

// ---- journey picker
const pk = H.pickerHtml(goals, A);
check('P1 the picker offers General plus each goal and marks the one on screen', (pk.match(/<button/g) || []).length === 3 && (pk.match(/aria-pressed="true"/g) || []).length === 1 && new RegExp('aria-pressed="true"[^>]*onclick="margJourneyShow\\(\'' + A + '\'\\)"').test(pk));
check('P2 General is marked when no goal is on screen', /aria-pressed="true"[^>]*onclick="margJourneyShow\(''\)"/.test(H.pickerHtml(goals, '')));
check('P3 picker buttons are at least 44px', (pk.match(/<button[^>]*>/g) || []).every((b) => /min-height:44px/.test(b)));

// ---- source rules
const src = fs.readFileSync('marg-goals-home.js', 'utf8');
const endpoints = [...new Set(src.match(/(mentor_[a-z_]+|daily_loop_focus)\?/g) || [])].sort().join();
check('X1 the module touches exactly these tables', endpoints === ['daily_loop_focus?', 'mentor_diagnoses?', 'mentor_diagnosis_evidence?', 'mentor_task_attempts?', 'mentor_tasks?'].sort().join(), endpoints);
check('X2 the only write is the student\'s own focus row (no PATCH, PUT or DELETE; one POST)', !/(PATCH|PUT|DELETE)/.test(src) && (src.match(/method: 'POST'/g) || []).length === 1 && /daily_loop_focus\?on_conflict=user_id', \{ method: 'POST'/.test(src));
check('X3 no exam or section names', !/\b(CAT|VARC|DILR|QA)\b/.test(src));
check('X4 plain ASCII', !/[^\x00-\x7F]/.test(src));
const idx = fs.readFileSync('index.html', 'utf8');
check('X5 index.html loads it before the app code', idx.indexOf('/marg-goals-home.js') > idx.indexOf('/marg-goals-write.js') && idx.indexOf('/marg-goals-home.js') < idx.indexOf('/chat-topics.js'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
