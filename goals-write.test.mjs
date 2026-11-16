// P4.3 tests: the goals WRITE client (marg-goals-write.js). Run: node goals-write.test.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const W = require('./marg-goals-write.js');

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, detail || ''); } }
const G1 = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const D1 = 'dddddddd-1111-4111-8111-dddddddddddd';
const D2 = 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee';
const res = (status, body, text) => ({ ok: status < 300, status, json: async () => body, text: async () => text || '' });

function mk(opts) {
  opts = opts || {};
  const calls = [];
  let user = opts.user === undefined ? 'user-a' : opts.user;
  const client = W.createClient({
    baseUrl: 'https://stg.example', getUserId: () => user, isEnabled: () => opts.enabled !== false,
    random: () => 'r' + calls.length,
    fetch: async (url, o) => { calls.push({ m: (o && o.method) || 'GET', url, body: o && o.body ? JSON.parse(o.body) : null }); return opts.onFetch ? opts.onFetch(url, o, calls, (u) => { user = u; }) : res(200, [{ id: G1, title: 'T' }]); }
  });
  return { client, calls };
}

// validation
check('V1 empty title refused', !W.validateGoalInput({ title: '  ', kind: 'exam' }).ok);
check('V2 over-long title refused', !W.validateGoalInput({ title: 'x'.repeat(121), kind: 'exam' }).ok);
check('V3 missing kind refused', !W.validateGoalInput({ title: 'ok', kind: '' }).ok);
check('V4 over-long description and outcome refused', !W.validateGoalInput({ title: 'ok', kind: 'k', description: 'x'.repeat(1001) }).ok && !W.validateGoalInput({ title: 'ok', kind: 'k', desiredOutcome: 'x'.repeat(501) }).ok);
check('V5 valid input is trimmed and blanks become null', JSON.stringify(W.validateGoalInput({ title: ' Plan ', kind: 'career', description: ' ' }).value) === JSON.stringify({ kind: 'career', title: 'Plan', description: null, desired_outcome: null }));
check('V6 selection keeps only well-formed ids and counts them', W.cleanSelection({ diagnosisIds: [D1, 'bad', 5], taskIds: [D2.toUpperCase()] }).total === 2);

// off / signed out: no network
const off = mk({ enabled: false });
check('F1 flag off: every write is refused with no network call', (await off.client.createGoal({ title: 't', kind: 'k' })).state === 'off' && (await off.client.adoptWorkspace({ title: 't', kind: 'k' }, { diagnosisIds: [D1] })).state === 'off' && (await off.client.createGoalThread(G1, 'thread-12345', 'x')).state === 'off' && off.calls.length === 0);
const so = mk({ user: null });
check('F2 signed out: every write is refused with no network call', (await so.client.createGoal({ title: 't', kind: 'k' })).state === 'off' && so.calls.length === 0);

// create goal
const c1 = mk({ onFetch: async () => res(201, [{ id: G1, title: 'My goal' }]) });
const r1 = await c1.client.createGoal({ title: 'My goal', kind: 'career' });
check('C1 creates one goal with the signed-in user as owner', r1.state === 'ok' && r1.goalId === G1 && c1.calls.length === 1 && c1.calls[0].m === 'POST' && /\/rest\/v1\/goals$/.test(c1.calls[0].url) && c1.calls[0].body.user_id === 'user-a');
check('C2 invalid input makes no request', (await c1.client.createGoal({ title: '', kind: 'x' })).state === 'invalid' && c1.calls.length === 1);
let release; const gate = new Promise((r) => { release = r; });
const slow = mk({ onFetch: async () => { await gate; return res(201, [{ id: G1, title: 'T' }]); } });
const first = slow.client.createGoal({ title: 'T', kind: 'k' });
const second = await slow.client.createGoal({ title: 'T', kind: 'k' });
release(); await first;
check('C3 a double click while saving makes one request, not two goals', second.state === 'busy' && slow.calls.length === 1);
const cap = mk({ onFetch: async () => res(400, null, 'goal limit: at most 10 live goals') });
check('C4 hitting the goal cap says so in plain words', /most goals allowed/.test((await cap.client.createGoal({ title: 'T', kind: 'k' })).error));
const boom = mk({ onFetch: async () => { throw new Error('offline'); } });
const rb = await boom.client.createGoal({ title: 'T', kind: 'k' });
check('C5 a network failure is an error that says nothing was changed', rb.state === 'error' && /Nothing on your account was changed/.test(rb.error));
const sw = mk({ onFetch: async (u, o, c, setUser) => { setUser('user-b'); return res(201, [{ id: G1, title: 'T' }]); } });
check('C6 account switched mid-save: result is discarded', (await sw.client.createGoal({ title: 'T', kind: 'k' })).state === 'stale');

// adopt
const none = mk();
check('A1 nothing ticked: refused, no request (nothing is pre-selected for the student)', (await none.client.adoptWorkspace({ title: 'T', kind: 'k' }, { diagnosisIds: [] })).state === 'invalid' && none.calls.length === 0);
const ad = mk({ onFetch: async () => res(200, { repeat: false, goal_id: G1, adoption_id: D2, moved: { diagnoses: 1, tasks: 2, attempts: 0, evidence: 3 } }) });
const ra = await ad.client.adoptWorkspace({ title: 'CAT', kind: 'exam' }, { diagnosisIds: [D1] });
check('A2 adopts through the one database function, sending only the ticked ids', ra.state === 'ok' && ad.calls.length === 1 && /\/rpc\/adopt_workspace$/.test(ad.calls[0].url) && JSON.stringify(ad.calls[0].body.p_diagnosis_ids) === JSON.stringify([D1]) && ad.calls[0].body.p_task_ids.length === 0);
check('A3 the answer reports what moved', ra.moved.tasks === 2 && ra.moved.evidence === 3 && ra.goalId === G1);
let n = 0;
const flaky = mk({ onFetch: async () => (++n === 1 ? res(500, null, 'timeout') : res(200, { repeat: n > 2, goal_id: G1, moved: {} })) });
await flaky.client.adoptWorkspace({ title: 'T', kind: 'k' }, { diagnosisIds: [D1] });
await flaky.client.adoptWorkspace({ title: 'T', kind: 'k' }, { diagnosisIds: [D1] });
check('A4 a retry after a failure reuses the same idempotency key (cannot adopt twice)', flaky.calls.length === 2 && flaky.calls[0].body.p_idempotency_key === flaky.calls[1].body.p_idempotency_key);
await flaky.client.adoptWorkspace({ title: 'T', kind: 'k' }, { diagnosisIds: [D1] });
check('A5 after a success the next adoption gets a new key', flaky.calls[2].body.p_idempotency_key !== flaky.calls[1].body.p_idempotency_key);
check('A6 an adoption answer without a goal id is an error, not success', (await mk({ onFetch: async () => res(200, {}) }).client.adoptWorkspace({ title: 'T', kind: 'k' }, { diagnosisIds: [D1] })).state === 'error');
const und = mk({ onFetch: async () => res(400, null, 'newer activity in this goal depends on the adopted items') });
check('A7 undo refusal is explained in plain words', /cannot be undone now/.test((await und.client.undoAdoption(D2)).error));
check('A8 undo with a malformed id makes no request', (await und.client.undoAdoption('x')).state === 'invalid' && und.calls.length === 1);

// threads
const th = mk({ onFetch: async () => res(201, []) });
const rt = await th.client.createGoalThread(G1, 'thread-0001-abcd', 'New chat in goal');
check('T1 a conversation is created inside one goal, with the goal set at creation', rt.state === 'ok' && th.calls[0].body.goal_id === G1 && th.calls[0].body.client_thread_id === 'thread-0001-abcd' && th.calls[0].body.user_id === 'user-a');
check('T2 bad goal id or thread id makes no request', (await th.client.createGoalThread('x', 'thread-0001-abcd', 't')).state === 'invalid' && (await th.client.createGoalThread(G1, 'short', 't')).state === 'invalid' && th.calls.length === 1);
const map = mk({ onFetch: async () => res(200, [{ client_thread_id: 't1', goal_id: G1 }, { client_thread_id: 't2', goal_id: 'bad' }, null]) });
const lm = await map.client.loadThreadScopes();
check('T3 thread scopes load as a map and malformed rows are dropped', lm.state === 'ok' && lm.map.t1 === G1 && !('t2' in lm.map));
check('T4 a failed thread load is "unavailable", never an empty map', (await mk({ onFetch: async () => res(500) }).client.loadThreadScopes()).state === 'unavailable');
check('T5 the client has no function that changes a conversation\'s goal', Object.keys(th.client).sort().join() === 'adoptWorkspace,createGoal,createGoalThread,listUnassigned,loadThreadScopes,undoAdoption');
const un = mk({ onFetch: async () => res(200, [{ id: D1, section: 'qa', topic: 'percentages', mechanism: 'm', created_at: '2026-01-01' }, { id: 'bad' }]) });
const lu = await un.client.listUnassigned();
check('T6 the list of earlier work reads unassigned diagnoses only and drops malformed rows', lu.state === 'ok' && lu.items.length === 1 && /goal_id=is\.null/.test(un.calls[0].url) && un.calls[0].m === 'GET');

// rendered forms
const html = W.actionsHtml([{ id: G1, title: 'A <b>goal</b>' }], { state: 'ok', items: [{ id: D1, topic: 'perc<script>', section: 'qa', summary: 's' }] });
check('R1 no checkbox is pre-ticked (nothing is selected for the student)', !/checked/i.test(html) && (html.match(/type="checkbox"/g) || []).length === 1);
check('R2 titles and topics are escaped', !/<script>/.test(html) && !/<b>goal/.test(html));
check('R3 every button, field and tick box row is at least 44px tall and text is at least 16px', (html.match(/<button[^>]*>/g) || []).length >= 3 && (html.match(/<button[^>]*>/g) || []).every((b) => /min-height:44px/.test(b)) && (html.match(/<(input|select|textarea)(?![^>]*checkbox)[^>]*>/g) || []).every((f) => /min-height:44px/.test(f)) && /<label style="[^"]*min-height:44px/.test(html) && !/font-size:1[0-5]px/.test(html));
check('R4 the adoption form says nothing is selected and nothing is deleted', /Nothing is selected for you/.test(html) && /nothing is deleted/.test(html));
check('R5 with nothing unassigned the adoption form is absent', !/Save my earlier work/.test(W.actionsHtml([], { state: 'ok', items: [] })) && !/Save my earlier work/.test(W.actionsHtml([], null)));
check('R6 the conversation section says a conversation stays in its goal', /stays in the goal it starts in/.test(html));

// source rules
const src = fs.readFileSync('marg-goals-write.js', 'utf8');
const endpoints = [...new Set((src.match(/\/rest\/v1\/[a-z_\/]+/g) || []))].sort().join();
check('X1 the write module touches exactly these endpoints', endpoints === ['/rest/v1/chat_threads', '/rest/v1/goals', '/rest/v1/mentor_diagnoses', '/rest/v1/rpc/adopt_workspace', '/rest/v1/rpc/undo_adoption'].sort().join(), endpoints);
check('X2 it has no PATCH, PUT or DELETE', !/(PATCH|PUT|DELETE)/.test(src));
check('X3 it never names an exam or section', !/\b(CAT|VARC|DILR|QA)\b/.test(src));
check('X4 plain ASCII', !/[^\x00-\x7F]/.test(src));
const idx = fs.readFileSync('index.html', 'utf8');
check('X5 index.html loads it after the read client and before the app', idx.indexOf('/marg-goals.js') < idx.indexOf('/marg-goals-write.js') && idx.indexOf('/marg-goals-write.js') < idx.indexOf('/chat-topics.js'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
