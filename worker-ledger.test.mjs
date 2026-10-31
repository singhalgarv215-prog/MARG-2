import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 240000;
const timeout = setTimeout(() => {
  process.stdout.write('FAIL timeout guard: a ledger check hung past ' + TIMEOUT_MS + 'ms\n');
  process.exit(1);
}, TIMEOUT_MS);

const source = readFileSync(join(ROOT, 'cloudflare-worker.js'), 'utf8');
const directory = mkdtempSync(join(tmpdir(), 'marg-ledger-'));
const file = join(directory, 'worker.mjs');
writeFileSync(file, source);
const worker = await import(pathToFileURL(file).href);

const GOOD = 'Bearer good-token';
const BOB = 'Bearer SENTINEL_BEARER_TOKEN';
const VALUE_LIMIT = Number(process.env.MARG_TEST_VALUE_LIMIT || (2 * 1024 * 1024));
const logs = [];
const originalLog = console.log;
console.log = (...args) => { logs.push(args.map(String).join(' ')); };

let failed = 0;
let checks = 0;
let geminiCalls = 0;
let geminiHandler = null;
const originalParse = JSON.parse;

function say(line) { process.stdout.write(line + '\n'); }

function stubResponse(status, body, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {})
  });
}

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || headers.get(name.toLowerCase()) || '';
  return headers[name] || headers[name.toLowerCase()] || '';
}

function chat(text, tokens) {
  return {
    contents: [{ role: 'user', parts: [{ text: text || 'How should I start QA?' }] }],
    systemInstruction: { parts: [{ text: 'You are Marg, a CAT mentor.' }] },
    generationConfig: { maxOutputTokens: tokens || 1024, thinkingConfig: { thinkingLevel: 'minimal' } }
  };
}

function groundedChat(text) {
  return Object.assign(chat(text, 1024), { margWebGrounding: true });
}

function okBody(text, usage, queries) {
  const candidate = { content: { parts: [{ text: text || 'ok' }] }, finishReason: 'STOP' };
  if (queries) candidate.groundingMetadata = { webSearchQueries: queries };
  const body = { candidates: [candidate] };
  if (usage !== null) body.usageMetadata = usage || { promptTokenCount: 3, candidatesTokenCount: 4, thoughtsTokenCount: 1, totalTokenCount: 8, cachedContentTokenCount: 0 };
  return body;
}

globalThis.fetch = async (url, options) => {
  const target = String(url);
  if (target.includes('/auth/v1/user')) {
    const authorization = headerValue(options && options.headers, 'Authorization');
    if (authorization === GOOD) return stubResponse(200, { id: 'user-1' });
    if (authorization === BOB) return stubResponse(200, { id: 'SENTINEL_USER' });
    return stubResponse(401, { message: 'invalid' });
  }
  if (target.includes(':generateContent')) {
    geminiCalls += 1;
    if (geminiHandler) return geminiHandler(options, geminiCalls);
    const body = originalParse(options.body);
    return stubResponse(200, okBody('answer-' + geminiCalls, null, body && body.tools ? ['q1'] : null));
  }
  throw new Error('unexpected upstream ' + target);
};

function envFor(ledger, extra) {
  return Object.assign({
    GEMINI_API_KEY: 'TEST_NOT_REAL',
    MARG_USAGE_LEDGER_MEMORY: ledger,
    MARG_USER_REQUESTS_PER_MINUTE: '1000',
    MARG_GUEST_REQUESTS_PER_MINUTE: '1000',
    MARG_IP_REQUESTS_PER_MINUTE: '1000'
  }, extra || {});
}

function makeLedger() {
  return worker.createMemoryUsageLedger({ maxValueBytes: VALUE_LIMIT });
}

async function check(name, fn) {
  checks += 1;
  try {
    const ok = await fn();
    say((ok ? 'PASS' : 'FAIL') + ' ' + name);
    if (!ok) failed += 1;
  } catch (error) {
    say('FAIL ' + name + ' ' + (error && error.stack || error));
    failed += 1;
  }
}

function detail(line) { say('  detail ' + line); }

async function post(payload, env, headers, bodyText) {
  const requestHeaders = Object.assign({
    'Content-Type': 'application/json',
    'X-Marg-Client-Id': 'client-a',
    'CF-Connecting-IP': '203.0.113.10'
  }, headers || {});
  return worker.default.fetch(new Request('https://worker.test/', {
    method: 'POST',
    headers: requestHeaders,
    body: bodyText == null ? JSON.stringify(payload) : bodyText
  }), env);
}

function lastRecord() {
  const line = logs.filter((item) => item.includes('marg_worker_request')).pop();
  return line ? originalParse(line) : null;
}

function micros(tokens, perMillion) {
  const count = Math.max(0, Math.round(Number(tokens) || 0));
  const rate = Math.max(0, Math.round(Number(perMillion) || 0));
  if (!count || !rate) return 0;
  return Math.ceil((count * rate) / 1000000);
}

async function ledgerOp(ledger, body) {
  const response = await ledger.fetch(new Request('https://ledger.internal/', {
    method: 'POST',
    body: JSON.stringify(body)
  }));
  return response.json();
}

const baseCaps = {
  pricing: true,
  subject: { minute: 1000, calls: 100000, tokens: 50000000, micros: 50000000 },
  ipMinute: 1000,
  global: { tokens: 50000000, micros: 50000000 }
};

await check('L1 a 503 is not replayed and the same key reaches Gemini again', async () => {
  geminiCalls = 0;
  let blockUpstream = true;
  geminiHandler = () => blockUpstream
    ? stubResponse(503, { error: { code: 503, status: 'UNAVAILABLE', message: 'down' } })
    : stubResponse(200, okBody('recovered'));
  const ledger = makeLedger();
  const env = envFor(ledger);
  const headers = { Authorization: GOOD, 'X-Marg-Idempotency-Key': 'retry-key-01', 'CF-Connecting-IP': '203.0.113.21' };
  const first = await post(chat('same-body'), env, headers);
  const firstBody = await first.json();
  const callsAfterFailure = geminiCalls;
  blockUpstream = false;
  const second = await post(chat('same-body'), env, headers);
  const secondBody = await second.json();
  const replay = second.headers.get('X-Marg-Idempotent-Replay');
  const ok = first.status === 503 && second.status === 200 && replay !== '1' && geminiCalls > callsAfterFailure && secondBody.candidates && secondBody.candidates[0].content.parts[0].text === 'recovered';
  if (!ok) detail('first=' + first.status + ' ' + (firstBody.error && firstBody.error.status) + ' second=' + second.status + ' replay=' + replay + ' gemini=' + callsAfterFailure + '->' + geminiCalls);
  geminiHandler = null;
  return ok;
});

await check('L1 quota refusal and minute 429 are not replayed after the window', async () => {
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    geminiCalls = 0;
    geminiHandler = () => stubResponse(200, okBody('minute-ok'));
    const ledger = makeLedger();
    const env = envFor(ledger, { MARG_USER_REQUESTS_PER_MINUTE: '1' });
    const allow = { limit: async () => ({ success: true }) };
    env.MARG_RATE_LIMITER = allow;
    env.MARG_IP_LIMITER = allow;
    const headers = { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.22', 'X-Marg-Idempotency-Key': 'minute-key-1' };
    const first = await post(chat('minute-a'), env, headers);
    const blocked = await post(chat('minute-b'), env, Object.assign({}, headers, { 'X-Marg-Idempotency-Key': 'minute-key-2' }));
    const blockedBody = await blocked.json();
    const replayed = await post(chat('minute-b'), env, Object.assign({}, headers, { 'X-Marg-Idempotency-Key': 'minute-key-2' }));
    const immediateReplay = replayed.headers.get('X-Marg-Idempotent-Replay');
    clock += 61000;
    const after = await post(chat('minute-b'), env, Object.assign({}, headers, { 'X-Marg-Idempotency-Key': 'minute-key-2' }));
    const afterReplay = after.headers.get('X-Marg-Idempotent-Replay');
    const minuteCalls = geminiCalls;
    const quotaEnv = envFor(makeLedger(), { MARG_USER_CALLS_PER_DAY: '1' });
    const quotaHeaders = { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.23', 'X-Marg-Idempotency-Key': 'quota-key-01' };
    const spent = await post(chat('quota-a'), quotaEnv, Object.assign({}, quotaHeaders, { 'X-Marg-Idempotency-Key': 'quota-other' }));
    const denied = await post(chat('quota-b'), quotaEnv, quotaHeaders);
    const deniedAgain = await post(chat('quota-b'), quotaEnv, quotaHeaders);
    const deniedBody = await deniedAgain.json();
    const ok = first.status === 200 && blocked.status === 429 && blockedBody.error.quota === 'user_minute' &&
      immediateReplay !== '1' && after.status === 200 && afterReplay !== '1' && minuteCalls === 2 &&
      spent.status === 200 && denied.status === 429 && deniedAgain.status === 429 &&
      deniedAgain.headers.get('X-Marg-Idempotent-Replay') !== '1' && deniedBody.error.quota === 'user_daily_calls' && geminiCalls === 3;
    if (!ok) detail('minute first=' + first.status + ' blocked=' + blocked.status + ' immediate=' + immediateReplay + ' after=' + after.status + '/' + afterReplay + ' minuteGemini=' + minuteCalls + ' quota=' + denied.status + '/' + deniedAgain.status + ' replay=' + deniedAgain.headers.get('X-Marg-Idempotent-Replay') + ' gemini=' + geminiCalls);
    geminiHandler = null;
    return ok;
  } finally {
    Date.now = realNow;
  }
});

await check('L1 success replays once and a client retry after failure is not blocked', async () => {
  geminiCalls = 0;
  geminiHandler = () => stubResponse(200, okBody('stored-once'));
  const ledger = makeLedger();
  const env = envFor(ledger);
  const headers = { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.24', 'X-Marg-Idempotency-Key': 'success-key-1' };
  const first = await post(chat('stored'), env, headers);
  const again = await post(chat('stored'), env, headers);
  const againBody = await again.json();
  const successOk = first.status === 200 && again.status === 200 && again.headers.get('X-Marg-Idempotent-Replay') === '1' && againBody.candidates[0].content.parts[0].text === 'stored-once' && geminiCalls === 1;
  geminiCalls = 0;
  let calls = 0;
  geminiHandler = () => {
    calls += 1;
    if (calls === 1) return stubResponse(502, { error: { status: 'BAD_GATEWAY' } });
    return stubResponse(200, okBody('second-send'));
  };
  const retryEnv = envFor(makeLedger());
  const retryHeaders = { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.25', 'X-Marg-Idempotency-Key': 'client-retry-1' };
  const failed = await post(chat('retry-me'), retryEnv, retryHeaders);
  const retried = await post(chat('retry-me'), retryEnv, retryHeaders);
  const retriedBody = await retried.json();
  const retryOk = failed.status === 502 && retried.status === 200 && retried.headers.get('X-Marg-Idempotent-Replay') !== '1' && calls === 2 && retriedBody.candidates[0].content.parts[0].text === 'second-send';
  if (!successOk || !retryOk) detail('success=' + successOk + ' geminiAfterReplay=' + geminiCalls + ' failed=' + failed.status + ' retried=' + retried.status + ' calls=' + calls);
  geminiHandler = null;
  return successOk && retryOk;
});

await check('L2 another subject cannot replay, block, or conflict with Alice', async () => {
  geminiCalls = 0;
  let n = 0;
  geminiHandler = () => {
    n += 1;
    return stubResponse(200, okBody('answer-' + n));
  };
  const ledger = makeLedger();
  const env = envFor(ledger);
  const aliceHeaders = { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.30', 'X-Marg-Idempotency-Key': 'shared-key-1' };
  const alice = await post(chat('shared-body'), env, aliceHeaders);
  const aliceBody = await alice.json();
  const bob = await post(chat('shared-body'), env, { Authorization: BOB, 'CF-Connecting-IP': '203.0.113.31', 'X-Marg-Client-Id': 'bob', 'X-Marg-Idempotency-Key': 'shared-key-1' });
  const bobBody = await bob.json();
  const guest = await post(chat('shared-body'), env, { 'CF-Connecting-IP': '203.0.113.32', 'X-Marg-Client-Id': 'guest-b', 'X-Marg-Idempotency-Key': 'shared-key-1' });
  const guestBody = await guest.json();
  const aliceOther = await post(chat('alice-other'), env, { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.30', 'X-Marg-Idempotency-Key': 'shared-key-2' });
  const bobConflict = await post(chat('other-body'), env, { Authorization: BOB, 'CF-Connecting-IP': '203.0.113.31', 'X-Marg-Client-Id': 'bob', 'X-Marg-Idempotency-Key': 'shared-key-2' });
  const bobConflictBody = await bobConflict.json();
  const invalid = await post(chat('shared-body'), env, { Authorization: 'Bearer not-a-student', 'CF-Connecting-IP': '203.0.113.33', 'X-Marg-Idempotency-Key': 'shared-key-1' });
  const invalidBody = await invalid.json();
  const before = geminiCalls;
  const aliceAgain = await post(chat('shared-body'), env, aliceHeaders);
  const aliceAgainBody = await aliceAgain.json();
  const aliceOwnConflict = await post(chat('different-from-alice'), env, aliceHeaders);
  const ok = alice.status === 200 && aliceBody.candidates[0].content.parts[0].text === 'answer-1' &&
    bob.status === 200 && bob.headers.get('X-Marg-Idempotent-Replay') !== '1' && bobBody.candidates[0].content.parts[0].text !== 'answer-1' &&
    guest.status === 200 && guest.headers.get('X-Marg-Idempotent-Replay') !== '1' && guestBody.candidates[0].content.parts[0].text !== 'answer-1' &&
    aliceOther.status === 200 && bobConflict.status === 200 && bobConflict.headers.get('X-Marg-Idempotent-Replay') !== '1' &&
    bobConflictBody.candidates[0].content.parts[0].text !== 'answer-1' &&
    invalid.status === 401 && invalidBody.status === 'SESSION_INVALID' &&
    aliceAgain.status === 200 && aliceAgain.headers.get('X-Marg-Idempotent-Replay') === '1' && aliceAgainBody.candidates[0].content.parts[0].text === 'answer-1' &&
    aliceOwnConflict.status === 409 && geminiCalls === before;
  if (!ok) detail('alice=' + alice.status + ' bob=' + bob.status + '/' + (bobBody.candidates && bobBody.candidates[0].content.parts[0].text) + ' guest=' + guest.status + ' conflict=' + bobConflict.status + ' own=' + aliceOwnConflict.status + ' invalid=' + invalid.status + ' replay=' + aliceAgain.headers.get('X-Marg-Idempotent-Replay'));
  geminiHandler = null;
  return ok;
});

await check('L3 refused requests create no subject or minute records and values stay bounded', async () => {
  const ledger = makeLedger();
  if (!ledger.storage || typeof ledger.stats !== 'function' || typeof ledger.failNextPut !== 'function') {
    detail('memory ledger does not expose a bounded per-key storage double');
    return false;
  }
  const day = '2026-10-31';
  const now = Date.parse('2026-10-31T08:00:00+05:30');
  const refuseStarted = Date.now();
  for (let i = 0; i < 100000; i += 1) {
    const result = await ledgerOp(ledger, {
      action: 'begin', now, day, ttl: 180000, idemTtl: 600000, replayMax: 512 * 1024,
      subject: 'guest-ip:refused-' + i, network: 'net-' + (i % 1000), caps: Object.assign({}, baseCaps, { global: { tokens: 1, micros: 1 } }),
      add: { calls: 1, tokens: 100, micros: 50 }, reservationId: 'refused-' + i, bodyHash: 'h', idempotencyKey: ''
    });
    if (!result || result.mode !== 'quota') {
      detail('refused request was accepted at ' + i + ' ' + JSON.stringify(result));
      return false;
    }
  }
  const refuseMs = Date.now() - refuseStarted;
  const afterRefuse = ledger.storage.keys().filter((key) => key.indexOf('bal:') === 0 || key.indexOf('min:') === 0);
  if (afterRefuse.length) {
    detail('refused requests created ' + afterRefuse.length + ' subject or minute keys');
    return false;
  }
  const sessionLedger = makeLedger();
  const sessionStarted = Date.now();
  for (let i = 0; i < 100000; i += 1) {
    const id = 'session-' + i;
    const begun = await ledgerOp(sessionLedger, {
      action: 'begin', now, day, ttl: 180000, idemTtl: 600000, replayMax: 512 * 1024,
      subject: 'guest-ip:' + i, network: 'net-' + i, caps: baseCaps,
      add: { calls: 1, tokens: 20, micros: 10 }, reservationId: id, bodyHash: 'h' + i, idempotencyKey: ''
    });
    if (!begun || begun.mode !== 'owner') {
      detail('session begin failed at ' + i);
      return false;
    }
    await ledgerOp(sessionLedger, { action: 'release', now, day, ttl: 180000, reservationId: id });
  }
  const successLedger = makeLedger();
  for (let i = 0; i < 5000; i += 1) {
    const id = 'ok-' + i;
    const begun = await ledgerOp(successLedger, {
      action: 'begin', now, day, ttl: 180000, idemTtl: 600000, replayMax: 512 * 1024,
      subject: 'user:alice', network: '203.0.113.40', caps: Object.assign({}, baseCaps, { ipMinute: 100000, subject: { minute: 100000, calls: 100000, tokens: 50000000, micros: 50000000 } }),
      add: { calls: 1, tokens: 20, micros: 10 }, reservationId: id, bodyHash: 'body-' + i, idempotencyKey: 'idem-key-' + i
    });
    if (!begun || begun.mode !== 'owner') {
      detail('success begin failed at ' + i + ' ' + JSON.stringify(begun));
      return false;
    }
    await ledgerOp(successLedger, {
      action: 'settle', now, day, ttl: 180000, reservationId: id, billedTokens: 8, billedMicros: 22
    });
    await ledgerOp(successLedger, {
      action: 'complete', now, day, ttl: 180000, idemTtl: 600000, replayMax: 512 * 1024,
      subject: 'user:alice', idempotencyKey: 'idem-key-' + i, bodyHash: 'body-' + i,
      httpStatus: 200, response: '{"ok":' + i + '}', reservationId: id
    });
  }
  const sessionMs = Date.now() - sessionStarted;
  const sessionMax = sessionLedger.stats().maxSerialized;
  const successMax = successLedger.stats().maxSerialized;
  const bounded = sessionMax <= 256 * 1024 && successMax <= 256 * 1024 && sessionMax <= VALUE_LIMIT && successMax <= VALUE_LIMIT;
  if (!bounded) detail('max session=' + sessionMax + ' success=' + successMax + ' limit=' + VALUE_LIMIT);

  const costLedger = makeLedger();
  for (let i = 0; i < 100; i += 1) {
    await costLedger.storage.put('bal:' + day + ':user:seed-' + i, { day, calls: 1, tokens: 1, micros: 1, heldCalls: 0, heldTokens: 0, heldMicros: 0 });
  }
  const before = costLedger.stats();
  await ledgerOp(costLedger, {
    action: 'begin', now, day, ttl: 180000, subject: 'user:measured-a', network: '203.0.113.41', caps: baseCaps,
    add: { calls: 1, tokens: 20, micros: 10 }, reservationId: 'measured-a', bodyHash: 'm'
  });
  const mid = costLedger.stats();
  for (let i = 100; i < 5000; i += 1) {
    await costLedger.storage.put('bal:' + day + ':user:seed-' + i, { day, calls: 1, tokens: 1, micros: 1, heldCalls: 0, heldTokens: 0, heldMicros: 0 });
  }
  const seeded = costLedger.stats();
  await ledgerOp(costLedger, {
    action: 'begin', now, day, ttl: 180000, subject: 'user:measured-b', network: '203.0.113.42', caps: baseCaps,
    add: { calls: 1, tokens: 20, micros: 10 }, reservationId: 'measured-b', bodyHash: 'm2'
  });
  const after = costLedger.stats();
  const readsA = mid.reads - before.reads;
  const writesA = mid.writes - before.writes;
  const readsB = after.reads - seeded.reads;
  const writesB = after.writes - seeded.writes;
  const constant = readsA === readsB && writesA === writesB && readsA > 0 && readsA < 40;
  detail('measure refuseMs=' + refuseMs + ' sessionMs=' + sessionMs + ' reads=' + readsA + ' writes=' + writesA + ' sessionMax=' + sessionMax + ' successMax=' + successMax + ' keys=' + sessionLedger.storage.keys().length);
  if (!constant) detail('reads ' + readsA + ' vs ' + readsB + ' writes ' + writesA + ' vs ' + writesB);

  const oldMinute = 'min:' + day + ':' + Math.floor(now / 60000) + ':s:user:prune';
  await costLedger.storage.put(oldMinute, { day, window: Math.floor(now / 60000), count: 1 });
  await ledgerOp(costLedger, {
    action: 'begin', now: now + 60000, day, ttl: 180000, subject: 'user:prune', network: '203.0.113.43', caps: baseCaps,
    add: { calls: 1, tokens: 20, micros: 10 }, reservationId: 'prune-1', bodyHash: 'p'
  });
  const pruned = !costLedger.storage.keys().includes(oldMinute);

  const rollLedger = makeLedger();
  const open = await ledgerOp(rollLedger, {
    action: 'begin', now, day, ttl: 180000, subject: 'user:roll', network: '203.0.113.44', caps: baseCaps,
    add: { calls: 1, tokens: 30, micros: 15 }, reservationId: 'roll-open', bodyHash: 'r'
  });
  await rollLedger.storage.put('min:' + day + ':1:s:user:roll', { day, window: 1, count: 1 });
  await rollLedger.storage.put('bal:' + day + ':user:old', { day, calls: 4, tokens: 4, micros: 4, heldCalls: 0, heldTokens: 0, heldMicros: 0 });
  await ledgerOp(rollLedger, {
    action: 'begin', now: now + 1000, day: '2026-11-01', ttl: 180000, subject: 'user:other', network: '203.0.113.45', caps: baseCaps,
    add: { calls: 1, tokens: 20, micros: 10 }, reservationId: 'next-day', bodyHash: 'n'
  });
  const leftover = rollLedger.storage.keys().filter((key) => key.indexOf('min:' + day + ':') === 0 || key.indexOf('bal:' + day + ':') === 0);
  const stillOpen = await ledgerOp(rollLedger, { action: 'settle', now: now + 1000, day: '2026-11-01', ttl: 180000, reservationId: 'roll-open', billedTokens: 9, billedMicros: 4 });
  const rollOk = open.mode === 'owner' && leftover.length === 0 && stillOpen.settledTokens === 9;
  if (!pruned) detail('previous minute key was not deleted');
  if (!rollOk) detail('roll leftover=' + leftover.length + ' settle=' + JSON.stringify(stillOpen));

  const failLedger = makeLedger();
  const kept = await ledgerOp(failLedger, {
    action: 'begin', now, day, ttl: 180000, subject: 'user:keep', network: '203.0.113.46', caps: baseCaps,
    add: { calls: 1, tokens: 20, micros: 10 }, reservationId: 'keep-1', bodyHash: 'k'
  });
  await ledgerOp(failLedger, { action: 'settle', now, day, ttl: 180000, reservationId: 'keep-1', billedTokens: 8, billedMicros: 22 });
  const beforeFail = JSON.stringify(await failLedger.storage.get('day'));
  failLedger.failNextPut(1);
  const failedPut = await ledgerOp(failLedger, {
    action: 'begin', now, day, ttl: 180000, subject: 'user:keep', network: '203.0.113.46', caps: baseCaps,
    add: { calls: 1, tokens: 20, micros: 10 }, reservationId: 'keep-2', bodyHash: 'k2'
  });
  const afterFail = JSON.stringify(await failLedger.storage.get('day'));
  const recovered = await ledgerOp(failLedger, {
    action: 'begin', now, day, ttl: 180000, subject: 'user:keep', network: '203.0.113.46', caps: Object.assign({}, baseCaps, { subject: { minute: 1000, calls: 1, tokens: 50000000, micros: 50000000 } }),
    add: { calls: 1, tokens: 20, micros: 10 }, reservationId: 'keep-3', bodyHash: 'k3'
  });
  const closed = kept.mode === 'owner' && failedPut && failedPut.unavailable === true && beforeFail === afterFail && recovered.mode === 'quota' && recovered.quota === 'subject_calls';
  if (!closed) detail('failedPut=' + JSON.stringify(failedPut) + ' recovered=' + JSON.stringify(recovered) + ' same=' + (beforeFail === afterFail));
  return bounded && constant && pruned && rollOk && closed;
});

await check('L4 guests draw from a separate pool and an unset pool keeps the old shared ceiling', async () => {
  geminiHandler = () => stubResponse(200, okBody('pool'));
  geminiCalls = 0;
  const probeLedger = makeLedger();
  const probe = await post(chat('probe-guest'), envFor(probeLedger), { 'CF-Connecting-IP': '203.0.113.50', 'X-Marg-Client-Id': 'probe' });
  const reserved = lastRecord().reservedTokens;
  if (probe.status !== 200 || !(reserved > 0)) {
    detail('probe status=' + probe.status + ' reserved=' + reserved);
    return false;
  }
  geminiCalls = 0;
  const guestPool = String(reserved * 2);
  const globalCap = String(reserved * 6);
  let release = () => {};
  let held = 0;
  geminiHandler = () => new Promise((resolve) => {
    held += 1;
    const prior = release;
    release = () => { prior(); resolve(stubResponse(200, okBody('held'))); };
  });
  const ledger = makeLedger();
  const env = envFor(ledger, {
    MARG_GLOBAL_GUEST_TOKENS_PER_DAY: guestPool,
    MARG_GLOBAL_TOKENS_PER_DAY: globalCap,
    MARG_GLOBAL_SPEND_MICROS_PER_DAY: '100000000'
  });
  const tasks = [];
  const done = [];
  for (let i = 0; i < 4; i += 1) {
    tasks.push(post(chat('guest-' + i), env, { 'CF-Connecting-IP': '198.51.100.' + (10 + i), 'X-Marg-Client-Id': 'g-' + i }).then((response) => { done.push(response); return response; }));
  }
  tasks.push(post(chat('student'), env, { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.59', 'X-Marg-Client-Id': 'student' }).then((response) => { done.push(response); return response; }));
  const started = Date.now();
  while ((done.length < 2 || held < 3) && Date.now() - started < 5000) await new Promise((resolve) => setTimeout(resolve, 15));
  const poolOverflow = geminiCalls > 3;
  release();
  const responses = await Promise.all(tasks);
  const bodies = [];
  for (const response of responses) bodies.push(await response.json());
  const guestWins = responses.slice(0, 4).filter((response) => response.status === 200).length;
  const guestQuota = bodies.slice(0, 4).filter((body) => body.error && body.error.quota === 'guest_global_daily_tokens').length;
  const studentOk = !poolOverflow && responses[4].status === 200 && geminiCalls === 3 && guestWins === 2 && guestQuota === 2;
  if (!studentOk) detail('guestWins=' + guestWins + ' guestQuota=' + guestQuota + ' student=' + responses[4].status + ' gemini=' + geminiCalls + ' held=' + held);

  geminiCalls = 0;
  geminiHandler = () => stubResponse(200, okBody('shared'));
  const sharedLedger = makeLedger();
  const sharedEnv = envFor(sharedLedger, { MARG_GLOBAL_TOKENS_PER_DAY: String(reserved) });
  const guestTook = await post(chat('take'), sharedEnv, { 'CF-Connecting-IP': '203.0.113.70', 'X-Marg-Client-Id': 'taker' });
  const startedLog = logs.length;
  const studentBlocked = await post(chat('next-student'), sharedEnv, { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.71' });
  const blockedBody = await studentBlocked.json();
  const line = logs.slice(startedLog).filter((item) => item.includes('marg_worker_request') && item.includes('guestPoolConfigured')).pop();
  const record = line ? originalParse(line) : {};
  const unsetOk = guestTook.status === 200 && studentBlocked.status === 429 && blockedBody.error.quota === 'global_daily_tokens' && record.guestPoolConfigured === false;
  if (!unsetOk) detail('unset guest=' + guestTook.status + ' student=' + studentBlocked.status + ' quota=' + (blockedBody.error && blockedBody.error.quota) + ' field=' + record.guestPoolConfigured);
  geminiHandler = null;
  return studentOk && unsetOk;
});

await check('L5 grounding fails closed without a price and bills reported queries', async () => {
  geminiCalls = 0;
  geminiHandler = () => stubResponse(200, okBody('grounded-text', { promptTokenCount: 10, candidatesTokenCount: 4, thoughtsTokenCount: 0, totalTokenCount: 14, cachedContentTokenCount: 0 }, ['alpha', 'beta', 'alpha', '']));
  const student = await post(groundedChat('fee'), envFor(makeLedger()), { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.80' });
  const studentBody = await student.json();
  const guest = await post(groundedChat('fee'), envFor(makeLedger(), { MARG_GUEST_CAPABILITIES: 'log', MARG_GROUNDING_MICROS_PER_REQUEST: '14000' }), { 'CF-Connecting-IP': '203.0.113.81', 'X-Marg-Client-Id': 'ground-guest' });
  const guestBody = await guest.json();
  const closedCalls = geminiCalls;
  const priced = await post(groundedChat('fee'), envFor(makeLedger(), { MARG_GROUNDING_MICROS_PER_REQUEST: '14000' }), { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.82' });
  const pricedRecord = lastRecord();
  const plain = await post(chat('fee'), envFor(makeLedger()), { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.83' });
  const plainRecord = lastRecord();
  const expectedExtra = 14000 * 2;
  const queryOk = priced.status === 200 && plain.status === 200 && pricedRecord.settledMicros === plainRecord.settledMicros + expectedExtra;
  geminiHandler = () => stubResponse(200, { candidates: [{ content: { parts: [{ text: 'estimate' }] }, finishReason: 'STOP' }] });
  const probe = await post(chat('cap-fit'), envFor(makeLedger()), { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.84' });
  const fit = lastRecord() && lastRecord().settledMicros;
  geminiHandler = () => stubResponse(200, okBody('grounded-text', { promptTokenCount: 10, candidatesTokenCount: 4, thoughtsTokenCount: 0, totalTokenCount: 14, cachedContentTokenCount: 0 }, ['alpha']));
  const callsBeforeCap = geminiCalls;
  const ungrounded = await post(chat('cap-fit'), envFor(makeLedger(), { MARG_USER_SPEND_MICROS_PER_DAY: String(fit), MARG_GROUNDING_MICROS_PER_REQUEST: '14000' }), { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.85' });
  const over = await post(groundedChat('cap-fit'), envFor(makeLedger(), { MARG_USER_SPEND_MICROS_PER_DAY: String(fit), MARG_GROUNDING_MICROS_PER_REQUEST: '14000' }), { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.86' });
  const overBody = await over.json();
  const capOk = probe.status === 200 && fit > 0 && ungrounded.status === 200 && over.status === 429 && overBody.error.quota === 'user_daily_spend' && geminiCalls === callsBeforeCap + 1;
  const closed = student.status === 503 && studentBody.error.status === 'GROUNDING_UNAVAILABLE' && studentBody.error.retryable === false && /web lookup is unavailable/i.test(studentBody.error.message) &&
    guest.status === 503 && guestBody.error.status === 'GROUNDING_UNAVAILABLE' && closedCalls === 0;
  if (!(closed && queryOk && capOk)) detail('student=' + student.status + ' guest=' + guest.status + ' closedCalls=' + closedCalls + ' priced=' + priced.status + ' settled=' + (pricedRecord && pricedRecord.settledMicros) + ' plain=' + (plainRecord && plainRecord.settledMicros) + ' fit=' + fit + ' ungrounded=' + ungrounded.status + ' over=' + over.status + ' gemini=' + geminiCalls);
  geminiHandler = null;
  return closed && queryOk && capOk;
});

await check('L6 unknown ledger replies never reach Gemini and usage prices are exact', async () => {
  const replies = [{}, { ok: false }, { ok: false, mode: 'weird' }, { ok: true }, 'not-json'];
  for (const reply of replies) {
    geminiCalls = 0;
    const stub = {
      fetch: async () => new Response(typeof reply === 'string' ? reply : JSON.stringify(reply), { status: 200, headers: { 'Content-Type': 'application/json' } })
    };
    const response = await post(chat('stub'), envFor(stub), { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.90' });
    const body = await response.json();
    if (response.status !== 503 || body.error.status !== 'SPENDING_CONTROL_UNAVAILABLE' || geminiCalls !== 0) {
      detail('reply ' + JSON.stringify(reply) + ' status=' + response.status + ' gemini=' + geminiCalls);
      return false;
    }
  }
  const cases = [
    { name: 'plain', usage: { promptTokenCount: 10, candidatesTokenCount: 4, thoughtsTokenCount: 0, totalTokenCount: 14, cachedContentTokenCount: 0 }, expect: micros(10, 750000) + micros(4, 3750000) },
    { name: 'thinking', usage: { promptTokenCount: 0, candidatesTokenCount: 0, thoughtsTokenCount: 5, totalTokenCount: 5, cachedContentTokenCount: 0 }, expect: micros(5, 3750000) },
    { name: 'cached', usage: { promptTokenCount: 10, candidatesTokenCount: 0, thoughtsTokenCount: 0, totalTokenCount: 10, cachedContentTokenCount: 6 }, expect: micros(4, 750000) + micros(6, 75000) },
    { name: 'tool', usage: { promptTokenCount: 0, candidatesTokenCount: 0, thoughtsTokenCount: 0, toolUsePromptTokenCount: 8, totalTokenCount: 8, cachedContentTokenCount: 0 }, expect: micros(8, 750000) },
    { name: 'total', usage: { totalTokenCount: 9 }, expect: micros(9, 3750000) }
  ];
  for (const item of cases) {
    geminiHandler = () => stubResponse(200, okBody('priced', item.usage));
    await post(chat('price-' + item.name), envFor(makeLedger()), { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.91' });
    const record = lastRecord();
    if (!record || record.settledMicros !== item.expect) {
      detail(item.name + ' settled=' + (record && record.settledMicros) + ' expect=' + item.expect);
      geminiHandler = null;
      return false;
    }
  }
  geminiHandler = () => stubResponse(200, { candidates: [{ content: { parts: [{ text: 'estimate' }] }, finishReason: 'STOP' }] });
  await post(chat('missing-usage'), envFor(makeLedger()), { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.92' });
  const missing = lastRecord();
  if (!missing || missing.settledMicros !== missing.reservedMicros || !(missing.settledMicros > 0)) {
    detail('missing settled=' + (missing && missing.settledMicros) + ' reserved=' + (missing && missing.reservedMicros));
    geminiHandler = null;
    return false;
  }
  let phaseCalls = 0;
  geminiHandler = () => {
    phaseCalls += 1;
    if (phaseCalls === 1) return stubResponse(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'busy' } }, { 'Retry-After': '0.001' });
    return stubResponse(200, okBody('retried', { promptTokenCount: 10, candidatesTokenCount: 4, thoughtsTokenCount: 0, totalTokenCount: 14, cachedContentTokenCount: 0 }));
  };
  await post(chat('retry-price'), envFor(makeLedger()), { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.93' });
  const retried = lastRecord();
  const plainMicros = micros(10, 750000) + micros(4, 3750000);
  if (!retried || retried.settledMicros !== retried.reservedMicros / 2 + plainMicros) {
    detail('retry settled=' + (retried && retried.settledMicros) + ' reserved=' + (retried && retried.reservedMicros));
    geminiHandler = null;
    return false;
  }
  phaseCalls = 0;
  geminiHandler = () => {
    phaseCalls += 1;
    if (phaseCalls === 1) return stubResponse(400, { error: { code: 400, status: 'FAILED_PRECONDITION', message: 'User location is not supported for the API use.' } });
    return stubResponse(200, okBody('fallback', { promptTokenCount: 10, candidatesTokenCount: 4, thoughtsTokenCount: 0, totalTokenCount: 14, cachedContentTokenCount: 0 }));
  };
  await post(chat('fallback-price'), envFor(makeLedger()), { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.94' });
  const fallback = lastRecord();
  const fallbackMicros = micros(10, 1500000) + micros(4, 9000000);
  if (!fallback || fallback.settledMicros !== fallback.reservedMicros / 2 + fallbackMicros) {
    detail('fallback settled=' + (fallback && fallback.settledMicros) + ' reserved=' + (fallback && fallback.reservedMicros) + ' header later');
    geminiHandler = null;
    return false;
  }
  const started = logs.length;
  await post(chat('bad-var'), envFor(makeLedger(), { MARG_USER_CALLS_PER_DAY: 'nope' }), { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.95' });
  const rejected = logs.slice(started).some((line) => line.includes('MARG_USER_CALLS_PER_DAY') && line.includes('configuredIntRejected'));
  geminiHandler = null;
  return rejected;
});

await check('L7 stale reservations are charged, day roll keeps them, and a crashed key is released', async () => {
  const now = Date.parse('2026-10-31T10:00:00+05:30');
  const day = '2026-10-31';
  const ledger = makeLedger();
  const begun = await ledgerOp(ledger, {
    action: 'begin', now, day, ttl: 1000, idemTtl: 600000, replayMax: 1024,
    subject: 'user:stale', network: '203.0.113.100', caps: Object.assign({}, baseCaps, { subject: { minute: 1000, calls: 1, tokens: 50000000, micros: 50000000 } }),
    add: { calls: 1, tokens: 40, micros: 15 }, reservationId: 'stale-1', bodyHash: 's', idempotencyKey: 'stale-key-1'
  });
  const next = await ledgerOp(ledger, {
    action: 'begin', now: now + 1000, day, ttl: 1000, idemTtl: 600000,
    subject: 'user:stale', network: '203.0.113.100', caps: Object.assign({}, baseCaps, { subject: { minute: 1000, calls: 1, tokens: 50000000, micros: 50000000 } }),
    add: { calls: 1, tokens: 40, micros: 15 }, reservationId: 'stale-2', bodyHash: 's2'
  });
  const staleOk = begun.mode === 'owner' && next.mode === 'quota' && next.quota === 'subject_calls';

  const roll = makeLedger();
  const open = await ledgerOp(roll, {
    action: 'begin', now, day, ttl: 180000, subject: 'user:open', network: '203.0.113.101', caps: Object.assign({}, baseCaps, { subject: { minute: 1000, calls: 1, tokens: 50000000, micros: 50000000 } }),
    add: { calls: 1, tokens: 40, micros: 15 }, reservationId: 'open-1', bodyHash: 'o'
  });
  const secondDay = await ledgerOp(roll, {
    action: 'begin', now: now + 1000, day: '2026-11-01', ttl: 180000,
    subject: 'user:open', network: '203.0.113.101', caps: Object.assign({}, baseCaps, { subject: { minute: 1000, calls: 1, tokens: 50000000, micros: 50000000 } }),
    add: { calls: 1, tokens: 40, micros: 15 }, reservationId: 'open-2', bodyHash: 'o2'
  });
  const settled = await ledgerOp(roll, { action: 'settle', now: now + 1001, day: '2026-11-01', ttl: 180000, reservationId: 'open-1', billedTokens: 11, billedMicros: 6 });
  const rollOk = open.mode === 'owner' && secondDay.mode === 'quota' && settled.settledTokens === 11 && settled.already !== true;

  const crashed = makeLedger();
  const running = await ledgerOp(crashed, {
    action: 'begin', now, day, ttl: 1000, idemTtl: 600000,
    subject: 'user:crash', network: '203.0.113.102', caps: baseCaps,
    add: { calls: 1, tokens: 40, micros: 15 }, reservationId: 'crash-1', bodyHash: 'c', idempotencyKey: 'crash-key-1'
  });
  const blocked = await ledgerOp(crashed, {
    action: 'begin', now: now + 10, day, ttl: 1000, idemTtl: 600000,
    subject: 'user:crash', network: '203.0.113.102', caps: baseCaps,
    add: { calls: 1, tokens: 40, micros: 15 }, reservationId: 'crash-2', bodyHash: 'c', idempotencyKey: 'crash-key-1'
  });
  const released = await ledgerOp(crashed, {
    action: 'begin', now: now + 1000, day, ttl: 1000, idemTtl: 600000,
    subject: 'user:crash', network: '203.0.113.102', caps: baseCaps,
    add: { calls: 1, tokens: 40, micros: 15 }, reservationId: 'crash-3', bodyHash: 'c', idempotencyKey: 'crash-key-1'
  });
  const crashOk = running.mode === 'owner' && blocked.mode === 'in_progress' && released.mode === 'owner' && released.reservationId === 'crash-3';
  if (!(staleOk && rollOk && crashOk)) detail('stale=' + JSON.stringify(next) + ' roll=' + JSON.stringify(secondDay) + '/' + JSON.stringify(settled) + ' crash=' + JSON.stringify(blocked) + '/' + JSON.stringify(released));
  return staleOk && rollOk && crashOk;
});

await check('L8 one hundred concurrent requests never pass a small global cap', async () => {
  const probeLedger = makeLedger();
  geminiHandler = () => stubResponse(200, okBody('cap'));
  const probe = await post(chat('cap-probe'), envFor(probeLedger), { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.110' });
  const reserved = lastRecord().reservedTokens;
  if (probe.status !== 200 || !(reserved > 0)) return false;
  const allowed = 3;
  let release = () => {};
  let held = 0;
  geminiCalls = 0;
  geminiHandler = () => new Promise((resolve) => {
    held += 1;
    const prior = release;
    release = () => { prior(); resolve(stubResponse(200, okBody('raced'))); };
  });
  const ledger = makeLedger();
  const env = envFor(ledger, { MARG_GLOBAL_TOKENS_PER_DAY: String(reserved * allowed), MARG_GLOBAL_SPEND_MICROS_PER_DAY: '100000000' });
  const tasks = [];
  const done = [];
  for (let i = 0; i < 100; i += 1) {
    tasks.push(post(chat('race-' + i), env, { Authorization: i % 2 === 0 ? GOOD : BOB, 'CF-Connecting-IP': '203.0.113.' + (120 + (i % 20)), 'X-Marg-Client-Id': 'race-' + i }).then((response) => { done.push(response); return response; }));
  }
  const started = Date.now();
  while ((done.length < 100 - allowed || held < allowed) && Date.now() - started < 8000) await new Promise((resolve) => setTimeout(resolve, 20));
  const over = geminiCalls > allowed;
  release();
  const responses = await Promise.all(tasks);
  const successes = responses.filter((response) => response.status === 200).length;
  const ok = !over && successes === allowed && geminiCalls === allowed;
  if (!ok) detail('successes=' + successes + ' gemini=' + geminiCalls + ' allowed=' + allowed + ' held=' + held);
  geminiHandler = null;
  return ok;
});

clearTimeout(timeout);
say((failed === 0 ? 'PASS' : 'FAIL') + ' ' + failed + ' failed of ' + checks);
process.exit(failed === 0 ? 0 : 1);
