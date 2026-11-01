import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createMemoryUsageLedger } from './worker-ledger-memory.mjs';

// Batch 2 checks: day-roll cleanup queue, paused-service scope, account-scoped
// handoff helpers, writer contract and privacy disclosure. Real Cloudflare
// behaviour is not exercised here (see the configuration report).
const ROOT = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const read = (name) => readFileSync(join(ROOT, name), 'utf8');
const directory = mkdtempSync(join(tmpdir(), 'marg-batch2-'));
const file = join(directory, 'worker.mjs');
writeFileSync(file, read('cloudflare-worker.js'));
const worker = await import(pathToFileURL(file).href);

let failed = 0;
let checks = 0;
async function check(name, fn) {
  checks += 1;
  let ok = false;
  let detail = '';
  try {
    const result = await fn((text) => { detail = text; });
    ok = result === true;
  } catch (error) { detail = String(error && error.stack || error); }
  if (!ok) failed += 1;
  process.stdout.write((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' :: ' + detail) + '\n');
}

const makeLedger = () => createMemoryUsageLedger(worker.UsageLedger, { maxValueBytes: 2 * 1024 * 1024, strict: true });
async function ledgerOp(ledger, body) {
  const response = await ledger.fetch(new Request('https://ledger.internal/', { method: 'POST', body: JSON.stringify(body) }));
  return response.json();
}
const caps = {
  pricing: true,
  ipMinute: 100000,
  subject: { minute: 100000, calls: 100000, tokens: 50000000, micros: 50000000 },
  global: { tokens: 50000000, micros: 50000000 }
};
const hasDay = (ledger, day) => ledger.storage.keys().some((key) => key.indexOf('bal:' + day + ':') === 0 || key.indexOf('min:' + day + ':') === 0);
let seq = 0;
const begin = (ledger, day, subject, at) => ledgerOp(ledger, { action: 'begin', now: at, day, ttl: 180000, subject, network: '203.0.113.' + (10 + (seq % 200)), caps, add: { calls: 1, tokens: 20, micros: 8 }, reservationId: 'r-' + (seq += 1), bodyHash: 'h' + seq });

// B2-3: consecutive cleanup failures used to remember only one day.
await check('B2-3 consecutive failed cleanups leave no orphaned day after recovery', async (note) => {
  const ledger = makeLedger();
  const t = Date.parse('2026-10-31T10:00:00+05:30');
  await begin(ledger, '2026-10-31', 'user:a', t);
  ledger.failNextList(100000);
  const second = await begin(ledger, '2026-11-01', 'user:b', t + 86400000);
  const third = await begin(ledger, '2026-11-02', 'user:c', t + 2 * 86400000);
  const during = await ledger.storage.get('day');
  const keptWhileFailing = hasDay(ledger, '2026-10-31') && hasDay(ledger, '2026-11-01');
  ledger.failNextList(0);
  let served = second.mode === 'owner' && third.mode === 'owner';
  for (let i = 0; i < 60 && (hasDay(ledger, '2026-10-31') || hasDay(ledger, '2026-11-01')); i += 1) {
    const step = await begin(ledger, '2026-11-02', 'user:d' + i, t + 2 * 86400000 + 1000 + i);
    if (!step || step.mode !== 'owner') served = false;
  }
  const after = await ledger.storage.get('day');
  note('served=' + served + ' kept=' + keptWhileFailing + ' during=' + JSON.stringify([during.cleanupPending, during.cleanupQueue]) + ' d1=' + hasDay(ledger, '2026-10-31') + ' d2=' + hasDay(ledger, '2026-11-01') + ' after=' + JSON.stringify([after.cleanupPending, after.cleanupQueue]));
  return served && keptWhileFailing && !hasDay(ledger, '2026-10-31') && !hasDay(ledger, '2026-11-01') && after.cleanupPending === '' && !(after.cleanupQueue && after.cleanupQueue.length) && after.day === '2026-11-02';
});


// B2-3 follow-up: the queue drains in order and is idempotent.
await check('B2-3 three failed cleanups drain oldest first and every day is removed', async (note) => {
  const ledger = makeLedger();
  const t = Date.parse('2026-10-29T10:00:00+05:30');
  await begin(ledger, '2026-10-29', 'user:a', t);
  ledger.failNextList(100000);
  await begin(ledger, '2026-10-30', 'user:b', t + 86400000);
  await begin(ledger, '2026-10-31', 'user:c', t + 2 * 86400000);
  await begin(ledger, '2026-11-01', 'user:d', t + 3 * 86400000);
  const during = await ledger.storage.get('day');
  const queued = [during.cleanupPending].concat(during.cleanupQueue || []);
  ledger.failNextList(0);
  for (let i = 0; i < 80 && ['2026-10-29', '2026-10-30', '2026-10-31'].some((d) => hasDay(ledger, d)); i += 1) await begin(ledger, '2026-11-01', 'user:e' + i, t + 3 * 86400000 + 1000 + i);
  const after = await ledger.storage.get('day');
  note('queued=' + JSON.stringify(queued) + ' after=' + JSON.stringify([after.cleanupPending, after.cleanupQueue]));
  return queued.join(',') === '2026-10-29,2026-10-30,2026-10-31' && !['2026-10-29', '2026-10-30', '2026-10-31'].some((d) => hasDay(ledger, d)) && after.cleanupPending === '' && !after.cleanupQueue && hasDay(ledger, '2026-11-01');
});
await check('B2-3 a single failed cleanup still behaves as before (no queue field)', async () => {
  const ledger = makeLedger();
  const t = Date.parse('2026-10-31T10:00:00+05:30');
  await begin(ledger, '2026-10-31', 'user:a', t);
  ledger.failNextList(1);
  await begin(ledger, '2026-11-01', 'user:b', t + 86400000);
  const during = await ledger.storage.get('day');
  return during.cleanupPending === '2026-10-31' && !('cleanupQueue' in during);
});

// B2-5 retention: expired idempotency rows are removed by later operations.
await check('B2-5 an expired stored reply is removed by the next ledger operation, not only when its key returns', async (note) => {
  const ledger = makeLedger();
  const t = Date.parse('2026-11-01T10:00:00+05:30');
  const open = await ledgerOp(ledger, { action: 'begin', now: t, day: '2026-11-01', ttl: 180000, idemTtl: 600000, subject: 'user:r', network: '203.0.113.9', caps, add: { calls: 1, tokens: 20, micros: 8 }, reservationId: 'idem-1', bodyHash: 'same', idempotencyKey: 'key-expiry-0001' });
  await ledgerOp(ledger, { action: 'settle', now: t + 1000, day: '2026-11-01', ttl: 180000, idemTtl: 600000, reservationId: 'idem-1', billedTokens: 10, billedMicros: 4 });
  await ledgerOp(ledger, { action: 'complete', now: t + 1500, day: '2026-11-01', ttl: 180000, idemTtl: 600000, reservationId: 'idem-1', idempotencyKey: 'key-expiry-0001', subject: 'user:r', httpStatus: 200, response: '{"answer":"private text"}' });
  const replayed = await ledgerOp(ledger, { action: 'begin', now: t + 2000, day: '2026-11-01', ttl: 180000, idemTtl: 600000, subject: 'user:r', network: '203.0.113.9', caps, add: { calls: 1, tokens: 20, micros: 8 }, reservationId: 'idem-1b', bodyHash: 'same', idempotencyKey: 'key-expiry-0001' });
  const stored = () => ledger.storage.keys().filter((key) => key.indexOf('idem:') === 0).length;
  const before = stored();
  await ledgerOp(ledger, { action: 'begin', now: t + 300000, day: '2026-11-01', ttl: 180000, idemTtl: 600000, subject: 'user:s', network: '203.0.113.8', caps, add: { calls: 1, tokens: 20, micros: 8 }, reservationId: 'idem-2', bodyHash: 'other' });
  const stillInside = stored();
  await ledgerOp(ledger, { action: 'begin', now: t + 700000, day: '2026-11-01', ttl: 180000, idemTtl: 600000, subject: 'user:s', network: '203.0.113.8', caps, add: { calls: 1, tokens: 20, micros: 8 }, reservationId: 'idem-3', bodyHash: 'other2' });
  const after = stored();
  const text = (await Promise.all(ledger.storage.keys().map(async (key) => JSON.stringify(await ledger.storage.get(key))))).join('\n');
  note('open=' + JSON.stringify(open) + ' before=' + before + ' inside=' + stillInside + ' after=' + after);
  return open.mode === 'owner' && replayed.mode === 'replay' && before === 1 && stillInside === 1 && after === 0 && text.indexOf('private text') === -1;
});


// B2-4 / B2-1: paused-service scope and fail-safe behaviour at the Worker.
const originalFetch = globalThis.fetch;
const originalLog = console.log;
console.log = () => {};
let geminiCalls = 0;
globalThis.fetch = async (url, options) => {
  const target = String(url);
  if (target.includes('/auth/v1/user')) {
    const auth = options && options.headers && (typeof options.headers.get === 'function' ? options.headers.get('Authorization') : options.headers.Authorization);
    if (auth === 'Bearer good-token') return new Response(JSON.stringify({ id: 'user-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ message: 'invalid' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  if (target.includes(':generateContent')) { geminiCalls += 1; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] }), { status: 200 }); }
  throw new Error('unexpected upstream ' + target);
};
async function post(env, headers) {
  const response = await worker.default.fetch(new Request('https://worker.test/', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json', 'X-Marg-Client-Id': 'client-a', 'CF-Connecting-IP': '203.0.113.60' }, headers || {}),
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'How should I start QA?' }] }], generationConfig: { maxOutputTokens: 1024 } })
  }), Object.assign({ GEMINI_API_KEY: 'TEST_NOT_REAL' }, env));
  let body = null;
  try { body = await response.json(); } catch (_error) {}
  return { status: response.status, error: body && body.error || {} };
}
const pausedAll = await post({ MARG_GEMINI_PAUSED: '1' });
const pausedAllUser = await post({ MARG_GEMINI_PAUSED: '1' }, { Authorization: 'Bearer good-token' });
const pausedGuests = await post({ MARG_GUESTS_PAUSED: '1' });
const guestsPausedUser = await post({ MARG_GUESTS_PAUSED: '1' }, { Authorization: 'Bearer good-token' });
const noBinding = await post({});
const badSession = await post({}, { Authorization: 'Bearer expired' });
const notPaused = await post({ MARG_GEMINI_PAUSED: 'yes', MARG_GUESTS_PAUSED: 'true' });
console.log = originalLog;
await check('B2-4 an all-services pause carries scope "all" for guests and for signed-in students', async (note) => {
  note(JSON.stringify([pausedAll, pausedAllUser]));
  return pausedAll.status === 503 && pausedAll.error.status === 'SERVICE_PAUSED' && pausedAll.error.scope === 'all' && pausedAllUser.error.status === 'SERVICE_PAUSED' && pausedAllUser.error.scope === 'all' && pausedAll.error.retryable === false;
});
await check('B2-4 a guest-only pause carries scope "guests" and does not pause a signed-in student', async (note) => {
  note(JSON.stringify([pausedGuests, guestsPausedUser]));
  return pausedGuests.error.status === 'SERVICE_PAUSED' && pausedGuests.error.scope === 'guests' && guestsPausedUser.error.status !== 'SERVICE_PAUSED';
});
await check('B2-4 a pause never reaches the model', async () => geminiCalls === 0);
await check('B2-4 only the exact value 1 pauses (other values leave the switch off)', async (note) => { note(JSON.stringify(notPaused)); return notPaused.error.status !== 'SERVICE_PAUSED'; });
await check('B2-1 with no usage-ledger binding a request is refused as a spending-control failure, not served and not reported as a pause', async (note) => { note(JSON.stringify(noBinding)); return noBinding.status === 503 && noBinding.error.status === 'SPENDING_CONTROL_UNAVAILABLE' && geminiCalls === 0; });
await check('B2-1 an invalid session is refused, not turned into a guest', async (note) => { note(JSON.stringify(badSession)); return badSession.status === 401 && geminiCalls === 0; });
await check('B2-1 invalid, zero and blank limit variables fall back to defaults instead of removing the limit', async () => {
  const src = read('cloudflare-worker.js');
  const fn = src.slice(src.indexOf('function configuredInt('), src.indexOf('function optionalPositiveInt('));
  const configuredInt = new Function('console', fn + '; return configuredInt;')({ log() {} });
  return configuredInt({ A: 'abc' }, 'A', 7, false) === 7 && configuredInt({ A: '0' }, 'A', 7, false) === 7 && configuredInt({ A: '  ' }, 'A', 7, false) === 7 && configuredInt({ A: '-3' }, 'A', 7, false) === 7 && configuredInt({ A: '1.5' }, 'A', 7, false) === 7 && configuredInt({ A: '12' }, 'A', 7, false) === 12 && configuredInt({}, 'A', 7, false) === 7;
});
await check('B2-1 the browser guest message counter is the only client-side limit and the Worker does not read any value from the browser to set a limit', async () => {
  const app = read('marg-app.js');
  const src = read('cloudflare-worker.js');
  return /const GUEST_MESSAGE_LIMIT = 5;/.test(app) && !/GUEST_MESSAGE_LIMIT/.test(src) && !/headers\.get\('X-Marg-(?:Limit|Quota|Budget)/i.test(src);
});
globalThis.fetch = originalFetch;

// B2-2: the shared session helper stamps and refuses correctly.
const session = require('./marg-session.js');
const memoryStore = (initial) => { const data = Object.assign({}, initial || {}); return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } }; };
const jwt = (payload) => 'h.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.s';
await check('B2-2 handoffOwner reads the account id, reports anonymous, and marks an unreadable session with ?', async () => {
  const throwing = { getItem() { throw new Error('blocked'); } };
  return session.handoffOwner(memoryStore({ marg_token: jwt({ sub: 'acct-a', exp: 4102444800 }) })) === 'acct-a' && session.handoffOwner(memoryStore()) === '' && session.handoffOwner(memoryStore({ marg_token: 'opaque' })) === '?' && session.handoffOwner(memoryStore({ marg_token: jwt({ exp: 1 }) })) === '?' && session.handoffOwner(throwing) === '?';
});
await check('B2-2 the session helper stays read-only (it only reads storage)', async () => {
  const source = read('marg-session.js');
  return !/setItem|removeItem|saveHandoff|fetch|XMLHttpRequest/.test(source);
});
await check('B2-2 a page writes the attempt stamped with owner and time, and an unreadable session is stamped ? so nobody receives it', async (note) => {
  const pages = ['daily-qa.html', 'daily-rc.html', 'daily-dilr.html', 'daily-dilr/index.html'];
  const problems = [];
  for (const page of pages) {
    const html = read(page);
    const helper = html.indexOf('/marg-session.js');
    if (helper < 0 || helper > html.indexOf('const WORKER_URL')) problems.push(page + ': session helper missing or late');
    if (!/pendingAttempt\.owner = window\.MargSession && MargSession\.handoffOwner \? MargSession\.handoffOwner\(localStorage\) : \(localStorage\.getItem\('marg_token'\) \? '\?' : ''\);/.test(html)) problems.push(page + ': owner stamp missing');
    if (!/pendingAttempt\.savedAt = Date\.now\(\);/.test(html)) problems.push(page + ': time stamp missing');
    const setIndex = html.indexOf("localStorage.setItem('marg_pending_attempt', JSON.stringify(pendingAttempt))");
    if (setIndex < html.indexOf('pendingAttempt.owner')) problems.push(page + ': written before it is stamped');
    if (/localStorage\.setItem\('marg_pending_attempt', JSON\.stringify\(\{/.test(html)) problems.push(page + ': an unstamped write remains');
  }
  const ask = read('daily-dilr/index.html');
  if (!/marg_ask_question_meta/.test(ask) || !/questionOwner/.test(ask)) problems.push('daily-dilr/index.html: question stamp missing');
  note(problems.join('; '));
  return problems.length === 0;
});
await check('B2-2 end to end: a stamped attempt written by a page is received by its owner only', async () => {
  const store = memoryStore({ marg_token: jwt({ sub: 'acct-a' }) });
  const attempt = { type: 'qa', correct: false };
  attempt.owner = session.handoffOwner(store);
  attempt.savedAt = Date.now();
  const raw = JSON.stringify(attempt);
  const vm = await import('node:vm');
  const sandbox = { localStorage: store, Date, JSON, window: {} };
  vm.createContext(sandbox);
  const appSource = read('marg-app.js');
  const start = appSource.indexOf('var PENDING_HANDOFF_KEYS');
  const stop = appSource.indexOf('function clearStoredSupabaseSession()');
  vm.runInContext(appSource.slice(start, stop), sandbox);
  store.setItem('marg_pending_attempt', raw);
  const forB = vm.runInContext("takePendingHandoff('marg_pending_attempt', 'acct-b', true)", sandbox);
  store.setItem('marg_pending_attempt', raw);
  const forA = vm.runInContext("takePendingHandoff('marg_pending_attempt', 'acct-a', true)", sandbox);
  store.setItem('marg_pending_attempt', JSON.stringify(Object.assign({}, attempt, { owner: '?' })));
  const unreadable = vm.runInContext("takePendingHandoff('marg_pending_attempt', 'acct-a', true)", sandbox);
  return forB === null && !!forA && forA.type === 'qa' && unreadable === null && !('marg_pending_attempt' in store.data);
});
await check('B2-2 the app consumes all three one-shot keys through the account check and the page script version changed with the helper', async () => {
  const app = read('marg-app.js');
  const direct = app.split('\n').filter((line) => /localStorage\.getItem\('marg_(?:pending_attempt|ask_question|first_message)'\)/.test(line));
  // The call must sit inside logout(), take the signed-in account's id, and run before the session is cleared.
  // (A bare match on the name would also be satisfied by the function's own definition line.)
  const logoutSource = app.slice(app.indexOf('async function logout('), app.indexOf('var chatOutboxFlushes'));
  const logoutDiscardsOwnHandoffs = /var accountId = currentUser && currentUser\.id \? currentUser\.id : '';/.test(logoutSource) && /discardOwnPendingHandoffs\(accountId\);\s*clearStoredSupabaseSession\(\)/.test(logoutSource);
  return direct.length === 0 && /takePendingHandoff\('marg_pending_attempt'/.test(app) && /takePendingHandoff\('marg_ask_question'/.test(app) && /takePendingHandoff\('marg_first_message'/.test(app) && logoutDiscardsOwnHandoffs && !read('daily-qa.html').includes('marg-session.js?v=20261030-1');
});

// B2-5: the privacy page only states what the code does.
const privacy = read('privacy.html').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const app = read('marg-app.js');
const workerSource = read('cloudflare-worker.js');
await check('B2-5 privacy page discloses usage counters, hashed identifiers, 10-minute reply retention, tokens and handoff entries', async (note) => {
  const needed = [/usage counters|counts how many model requests/i, /hash/i, /up to 10 minutes/, /refresh tokens/, /guest session token/, /24 hours/, /sign out/, /Last updated: November 2026/, /deleted after|deleted when the day changes|deleted when the day/i];
  const missing = needed.filter((pattern) => !pattern.test(privacy)).map(String);
  note(missing.join(' | '));
  return missing.length === 0;
});
await check('B2-5 the stated retention numbers match the code', async (note) => {
  const ttl = /configuredInt\(env, 'MARG_IDEMPOTENCY_TTL_MS', (\d+), false\)/.exec(workerSource);
  const handoff = /PENDING_HANDOFF_MAX_AGE_MS = (\d+) \* (\d+) \* (\d+) \* (\d+)/.exec(app);
  const purge = /IDEMPOTENCY_PURGE_PER_OPERATION = (\d+)/.exec(workerSource);
  note(JSON.stringify([ttl && ttl[1], handoff && handoff.slice(1), purge && purge[1]]));
  return !!ttl && Number(ttl[1]) === 10 * 60 * 1000 && !!handoff && handoff.slice(1).reduce((a, b) => a * Number(b), 1) === 24 * 3600 * 1000 && !!purge && Number(purge[1]) >= 1;
});
await check('B2-5 the privacy page makes none of the claims the code does not support', async (note) => {
  const forbidden = [/never (?:logs?|stores?|keeps?) (?:your )?(?:ip|network)/i, /no usage data/i, /does not (?:store|keep) (?:any )?(?:ip|network)/i, /deleted immediately/i, /exactly 10 minutes/i, /raw (?:ip|address)es? (?:are )?(?:stored|kept)/i];
  const hits = forbidden.filter((pattern) => pattern.test(privacy)).map(String);
  note(hits.join(' | '));
  return hits.length === 0 && /not your name or email/.test(privacy) && /can remain briefly/.test(privacy);
});

process.stdout.write((failed ? 'FAIL ' : 'PASS ') + (checks - failed) + '/' + checks + ' batch 2 checks passed\n');
process.exit(failed ? 1 : 0);
