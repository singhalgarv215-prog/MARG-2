// Two browser tabs, one account: tab 1 has goal A open, tab 2 has goal B open, tab 3 is General.
// Each tab is a separate copy of the app (its own memory) sharing one browser storage and one fake database,
// exactly like real tabs. The fake database enforces the real rules: unique (user, reference), a row's goal can never
// change, and a task must be in the same goal as its diagnosis. Run: node scripts/two-tab-goals.test.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');

// Reuse the harness's page stand-in (document, storage, timers) without running its suites.
const harnessSource = fs.readFileSync(path.join(__dirname, 'run-marg-tests.cjs'), 'utf8');
const head = harnessSource.slice(0, harnessSource.indexOf('const files = ('));
const makeSandbox = new Function('require', '__dirname', head.replace("const root = path.resolve(__dirname, '..');", "const root = path.resolve(__dirname, '..');") + '\nreturn sandbox;');

const A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', B = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', UID = 'two-tab-user';
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, detail || ''); } }

// ---- shared browser storage
const store = Object.create(null);
const sharedStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, clear() {}, key: (i) => Object.keys(store)[i] || null, get length() { return Object.keys(store).length; } };

// ---- shared fake database (PostgREST-like, with the real constraints)
const db = { mentor_diagnoses: [], mentor_tasks: [], mentor_task_attempts: [], mentor_diagnosis_evidence: [] };
let nextId = 0;
const requests = [];
const hooks = {};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function fakeFetch(url, opts) {
  url = String(url); opts = opts || {};
  const u = new URL(url), method = (opts.method || 'GET').toUpperCase();
  requests.push({ method, path: u.pathname + u.search, body: opts.body ? JSON.parse(opts.body) : null });
  if (u.pathname.startsWith('/auth/v1/')) return Promise.resolve(json(200, { id: UID }));
  if (u.pathname === '/rest/v1/chat_threads') { if (hooks.onChatThreads) hooks.onChatThreads(); return Promise.resolve(json(200, [])); }
  const m = /\/rest\/v1\/(mentor_[a-z_]+)$/.exec(u.pathname);
  if (!m || !db[m[1]]) return Promise.resolve(json(200, []));
  const table = db[m[1]];
  if (method === 'GET') {
    const f = u.searchParams.get('goal_id');
    let rows = table.filter((r) => r.user_id === UID);
    if (f === 'is.null') rows = rows.filter((r) => !r.goal_id);
    else if (f && f.startsWith('eq.')) rows = rows.filter((r) => r.goal_id === f.slice(3));
    return Promise.resolve(json(200, JSON.parse(JSON.stringify(rows))));
  }
  const bodies = [].concat(JSON.parse(opts.body));
  const out = [];
  for (const b of bodies) {
    let row = table.find((r) => r.user_id === b.user_id && r.client_ref === b.client_ref);
    if (row && 'goal_id' in b && (b.goal_id || null) !== (row.goal_id || null)) return Promise.resolve(json(400, { message: 'goal_id is fixed once set' }));
    const parentTable = m[1] === 'mentor_tasks' || m[1] === 'mentor_diagnosis_evidence' ? 'mentor_diagnoses' : m[1] === 'mentor_task_attempts' ? 'mentor_tasks' : null;
    const parentId = b.diagnosis_id || b.task_id;
    if (parentTable && parentId) {
      const parent = db[parentTable].find((r) => r.id === parentId);
      if (parent && (parent.goal_id || null) !== (b.goal_id || null)) return Promise.resolve(json(400, { message: 'row and its parent must belong to the same goal' }));
    }
    if (row) Object.assign(row, b); else { row = Object.assign({ id: 'cccccccc-0000-4000-8000-' + String(++nextId).padStart(12, '0') }, b); table.push(row); }
    out.push(JSON.parse(JSON.stringify(row)));
  }
  return Promise.resolve(json(201, out));
}

// ---- one tab = one copy of the app
function openTab(name) {
  const sb = makeSandbox(require, __dirname);
  sb.localStorage = sharedStorage;
  sb.fetch = fakeFetch;
  sb.Headers = Headers; sb.Response = Response; sb.Request = Request;
  sb.MARG_ENV = { name: 'staging', supabaseUrl: 'https://hmgdzkszzuaivyqeeitu.supabase.co', anonKey: 'anon-for-test', workerUrl: 'https://staging-model-stub.invalid/' };
  vm.createContext(sb);
  sb.window = sb; sb.self = sb; sb.globalThis = sb;
  for (const f of ['marg-goals.js', 'marg-goals-write.js', 'chat-topics.js', 'study-context.js', 'question-library.js', 'marg-training.js', 'slash-tools.js', 'time-mock-blueprints.js', 'qa-engine.js', 'dilr-engine.js', 'cat-bank-verification.js', 'marg-vision.js', 'marg-app.js']) {
    const full = path.join(root, f);
    if (fs.existsSync(full)) vm.runInContext(fs.readFileSync(full, 'utf8'), sb, { filename: f });
  }
  const run = (code) => vm.runInContext(code, sb);
  run(`currentUser = { id: '${UID}' }; SUPABASE_TOKEN = 'tok'; isGuestMode = false; mentorExecutionLoop = { diagnoses:[], tasks:[], attempts:[], evidence:[], loaded:true, unavailable:false, evidenceUnavailable:false }; conversationHistory = [];
    margGoalCache['${A}'] = { id:'${A}', title:'Goal A title', description:'', desiredOutcome:'', origin:'created' };
    margGoalCache['${B}'] = { id:'${B}', title:'Goal B title', description:'', desiredOutcome:'', origin:'created' };`);
  return { name, run, sb };
}

(async () => {
  sharedStorage.setItem('marg_persistent_goals_v1', 'on');
  const t1 = openTab('tab1'), t2 = openTab('tab2'), t3 = openTab('tab3');
  t1.run(`margSetActiveScope(MargGoals.goalScope('${A}'))`);
  t2.run(`margSetActiveScope(MargGoals.goalScope('${B}'))`);
  // tab 3 stays General
  check('T1 each tab has its own scope: tab 1 is goal A, tab 2 is goal B, tab 3 is General', t1.run('margActiveScope && margActiveScope.goalId') === A && t2.run('margActiveScope && margActiveScope.goalId') === B && t3.run('margActiveScope') === null);

  // Both tabs save the SAME pattern at the same time, then a task and an attempt for it, interleaved.
  const entry = "{ topic:'qa', patternId:'slow_method', confirmedDiagnosis:'Works the method too slowly', confidence:0.6 }";
  const dxs = await Promise.all([t1.run(`persistMentorDiagnosis(${entry})`), t2.run(`persistMentorDiagnosis(${entry})`), t3.run(`persistMentorDiagnosis(${entry})`)]);
  check('T2 three saves of the same pattern at once make three separate rows, none overwriting another', db.mentor_diagnoses.length === 3 && new Set(db.mentor_diagnoses.map((r) => r.client_ref)).size === 3, JSON.stringify(db.mentor_diagnoses.map((r) => [r.client_ref, r.goal_id])));
  const dxA = db.mentor_diagnoses.find((r) => r.goal_id === A), dxB = db.mentor_diagnoses.find((r) => r.goal_id === B), dxG = db.mentor_diagnoses.find((r) => !r.goal_id);
  check('T3 each row carries the goal of the tab that saved it (A, B and none)', !!dxA && !!dxB && !!dxG && dxA.client_ref.startsWith('gaaaaaaaa~') && dxB.client_ref.startsWith('gbbbbbbbb~') && dxG.client_ref === 'diagnosis:qa:slow_method');
  check('T4 every tab got the original reference back from its own save', dxs.every((d) => d && d.client_ref === 'diagnosis:qa:slow_method'));

  const task = (dxId) => `authenticatedSupabaseFetch('https://stg.example/rest/v1/mentor_tasks?on_conflict=user_id,client_ref', { method:'POST', headers:{}, body:JSON.stringify({ user_id:'${UID}', client_ref:'validation:diagnosis:qa:slow_method', diagnosis_id:'${dxId}', section:'qa' }) })`;
  const [r1, r2, r3] = await Promise.all([t1.run(task(dxA.id)), t2.run(task(dxB.id)), t3.run(task(dxG.id))]);
  check('T5 all three tasks saved (the database accepted each, parents are in the same goal)', r1.ok && r2.ok && r3.ok && db.mentor_tasks.length === 3);
  check('T6 each task is in its tab\'s goal and hangs off that goal\'s diagnosis', db.mentor_tasks.every((t) => { const p = db.mentor_diagnoses.find((d) => d.id === t.diagnosis_id); return p && (p.goal_id || null) === (t.goal_id || null); }) && db.mentor_tasks.filter((t) => t.goal_id).length === 2);

  // Tab 2 tries to save a task for goal A's diagnosis (as if it carried stale state): the app must not link across goals.
  const crossBefore = db.mentor_tasks.length;
  await t2.run(`authenticatedSupabaseFetch('https://stg.example/rest/v1/mentor_tasks?on_conflict=user_id,client_ref', { method:'POST', headers:{}, body:JSON.stringify({ user_id:'${UID}', client_ref:'stale-link', diagnosis_id:'${dxA.id}', section:'qa' }) })`);
  const stale = db.mentor_tasks.find((t) => /stale-link$/.test(t.client_ref));
  check('T7 a task in tab 2 carrying goal A\'s diagnosis id is saved in goal B without that link (never across goals)', !!stale && stale.goal_id === B && !stale.diagnosis_id && db.mentor_tasks.length === crossBefore + 1);

  // Reads: each tab sees only its own goal's rows, with original references.
  await Promise.all([t1.run('loadMentorExecutionLoop()'), t2.run('loadMentorExecutionLoop()'), t3.run('loadMentorExecutionLoop()')]);
  const refs = (t) => JSON.parse(t.run("JSON.stringify(mentorExecutionLoop.diagnoses.map(function(r){return [r.id, r.client_ref];}))"));
  const loopIds = (t) => refs(t).map((x) => x[0]);
  check('T8 tab 1 reads only goal A\'s diagnosis, tab 2 only goal B\'s, tab 3 only the General one', JSON.stringify(loopIds(t1)) === JSON.stringify([dxA.id]) && JSON.stringify(loopIds(t2)) === JSON.stringify([dxB.id]) && JSON.stringify(loopIds(t3)) === JSON.stringify([dxG.id]));
  check('T9 every tab sees the original reference, never the prefix', [t1, t2, t3].every((t) => refs(t).every((x) => x[1] === 'diagnosis:qa:slow_method')));

  // Local memory: each tab writes under its own goal's keys in the shared storage.
  const keys = Object.keys(store);
  check('T10 shared storage holds a separate diagnostic memory per goal and the General one, no mixing', keys.includes(`marg_diagnostic_memory_${UID}__g_${A}`) && keys.includes(`marg_diagnostic_memory_${UID}__g_${B}`) && keys.includes(`marg_diagnostic_memory_${UID}`));
  const memA = JSON.parse(store[`marg_diagnostic_memory_${UID}__g_${A}`]), memB = JSON.parse(store[`marg_diagnostic_memory_${UID}__g_${B}`]);
  check('T11 each stored memory points at its own goal\'s database row', JSON.stringify(memA).includes(dxA.id) && !JSON.stringify(memA).includes(dxB.id) && JSON.stringify(memB).includes(dxB.id) && !JSON.stringify(memB).includes(dxA.id));

  // Prompt context: seed a marker in each goal's behavioural memory, then ask each tab "what do you remember about me".
  store[`marg_behavioral_memory_${UID}__g_${A}`] = JSON.stringify({ patterns: [{ key: 'ma', label: 'MARKER-A pattern', count: 3 }] });
  store[`marg_behavioral_memory_${UID}__g_${B}`] = JSON.stringify({ patterns: [{ key: 'mb', label: 'MARKER-B pattern', count: 3 }] });
  [t1, t2, t3].forEach((t) => t.run('margReloadScopedMemory()'));
  await new Promise((r) => setTimeout(r, 50));
  const ask = (t, scopeExpr) => t.run(`buildMentorTurnContext('What do you remember about me? Use my full account history.', { diagnosis:{ intent:'returning_memory' } }, { surface:'chat', scope:${scopeExpr} })`);
  const c1 = ask(t1, `MargGoals.goalScope('${A}')`), c2 = ask(t2, `MargGoals.goalScope('${B}')`), c3 = ask(t3, 'MargGoals.generalScope()');
  check('T12 control: tab 1\'s prompt carries goal A\'s memory and goal A\'s title', /MARKER-A/.test(c1) && /Goal A title/.test(c1));
  check('T13 tab 1\'s prompt carries nothing of goal B', !/MARKER-B|Goal B title/.test(c1));
  check('T14 tab 2\'s prompt carries goal B only', /MARKER-B/.test(c2) && /Goal B title/.test(c2) && !/MARKER-A|Goal A title/.test(c2));
  check('T15 tab 3 (General) carries no goal memory and no goal title', !/MARKER|Goal A title|Goal B title/.test(c3));
  const wrong = (() => { try { ask(t1, `MargGoals.goalScope('${B}')`); return false; } catch (e) { return true; } })();
  check('T16 asking tab 1 to build a goal B prompt is refused (scope must match the open conversation)', wrong);

  // A goal conversation created in tab 2 is found by tab 1 through the shared registry, and gets goal B.
  t2.run(`margGoalScopes['thread-from-tab2'] = '${B}'; localStorage.setItem(margGoalThreadsKey(), JSON.stringify(Object.assign(margReadLocalGoalThreads(), { 'thread-from-tab2': '${B}' })))`);
  t1.run("margApplyThreadScope('thread-from-tab2')");
  check('T17 a goal conversation created in another tab opens in its own goal, not General and not the open goal', t1.run('margActiveScope && margActiveScope.goalId') === B);
  t1.run(`margSetActiveScope(MargGoals.goalScope('${A}'))`);

  // Tab 2 creates another goal conversation while tab 1 is still loading its list: tab 1 must not erase it from the shared registry.
  hooks.onChatThreads = () => { hooks.onChatThreads = null; t2.run(`localStorage.setItem(margGoalThreadsKey(), JSON.stringify(Object.assign(margReadLocalGoalThreads(), { 'thread-added-during-load': '${B}' })))`); };
  await t1.run('margLoadGoalThreads()');
  const registry = JSON.parse(store[`marg_goal_threads_${UID}`] || '{}');
  check('T17b a goal conversation another tab added while this tab was loading survives in the shared registry and is known to this tab', registry['thread-added-during-load'] === B && t1.run("margGoalScopes['thread-added-during-load']") === B, JSON.stringify(registry));
  t1.run(`margSetActiveScope(MargGoals.goalScope('${A}'))`);

  // Interleaved: tab 1's save waits for a parent while tab 1 switches to goal B; tab 2 keeps saving in B at the same time.
  const before = requests.length;
  const heldAttempt = t1.run(`authenticatedSupabaseFetch('https://stg.example/rest/v1/mentor_task_attempts?on_conflict=user_id,client_ref', { method:'POST', headers:{}, body:JSON.stringify({ user_id:'${UID}', client_ref:'ex:9:attempt:1', task_id:'cccccccc-0000-4000-8000-000000009999' }) })`);
  t1.run(`margSetActiveScope(MargGoals.goalScope('${B}'))`);
  await heldAttempt;
  check('T18 a save waiting for its parent in goal A is not sent into goal B when the tab switches', !db.mentor_task_attempts.length);
  check('T19 it is kept in goal A\'s queue, not goal B\'s', t1.run(`margGoalSaveStatus('${A}').waiting`) === 1 && t1.run(`margGoalSaveStatus('${B}').waiting`) === 0);
  // Back in goal A with the parent present: the held save is sent, stamped A.
  db.mentor_tasks.push({ id: 'cccccccc-0000-4000-8000-000000009999', user_id: UID, client_ref: 'gaaaaaaaa~late', goal_id: A });
  t1.run(`margSetActiveScope(MargGoals.goalScope('${A}'))`);
  await new Promise((r) => setTimeout(r, 120)); // the goal reloads its rows; anything kept for later is retried automatically afterwards
  const sentNow = await t1.run('margFlushGoalQueue()'); // a manual flush is harmless: nothing is left to send twice
  const heldRow = db.mentor_task_attempts[0];
  check('T20 back in goal A the held attempt is sent, stamped goal A, with the goal reference', !!heldRow && heldRow.goal_id === A && heldRow.client_ref === 'gaaaaaaaa~ex:9:attempt:1');
  check('T21 General Chat saves stayed unchanged throughout (no goal, original references only)', db.mentor_diagnoses.filter((r) => !r.goal_id).every((r) => !/^g[0-9a-f]{8}~/.test(r.client_ref)) && requests.filter((q) => q.method === 'POST' && q.body && !q.body.goal_id).every((q) => !/^g[0-9a-f]{8}~/.test(q.body.client_ref || '')));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERROR', e && e.stack || e); process.exit(1); });
