import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMemoryUsageLedger } from './worker-ledger-memory.mjs';

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

function bindLedger(ledger) {
  return { idFromName(name) { return name; }, get() { return ledger; } };
}

function envFor(ledger, extra) {
  return Object.assign({
    GEMINI_API_KEY: 'TEST_NOT_REAL',
    MARG_USAGE_LEDGER: bindLedger(ledger),
    MARG_USER_REQUESTS_PER_MINUTE: '1000',
    MARG_GUEST_REQUESTS_PER_MINUTE: '1000',
    MARG_IP_REQUESTS_PER_MINUTE: '1000'
  }, extra || {});
}

function makeLedger() {
  return createMemoryUsageLedger(worker.UsageLedger, { maxValueBytes: VALUE_LIMIT, strict: true });
}

async function storageHash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
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

  const oldMinute = 'min:' + day + ':' + Math.floor(now / 60000) + ':s:' + await storageHash('user:prune');
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

function wideCaps(extra) {
  return Object.assign({}, baseCaps, { ipMinute: 100000, subject: { minute: 100000, calls: 100000, tokens: 50000000, micros: 50000000 } }, extra || {});
}

async function storedText(ledger) {
  const keys = ledger.storage.keys();
  const parts = [];
  for (const key of keys) parts.push(key + '\n' + JSON.stringify(await ledger.storage.get(key)));
  return parts.join('\n');
}

await check('L9 a Map from storage.list rolls the day and the next operation still runs', async () => {
  const ledger = makeLedger();
  const now = Date.parse('2026-10-31T23:50:00+05:30');
  const caps = wideCaps();
  const day1 = await ledgerOp(ledger, { action: 'begin', now, day: '2026-10-31', ttl: 180000, subject: 'user:day1', network: '203.0.113.10', caps, add: { calls: 1, tokens: 20, micros: 10 }, reservationId: 'map-r1', bodyHash: 'h' });
  const listed = await ledger.storage.list({ prefix: 'bal:' });
  const day2 = await ledgerOp(ledger, { action: 'begin', now: now + 1000, day: '2026-11-01', ttl: 180000, subject: 'user:day1', network: '203.0.113.10', caps, add: { calls: 1, tokens: 20, micros: 10 }, reservationId: 'map-r2', bodyHash: 'h2' });
  const day2again = await ledgerOp(ledger, { action: 'begin', now: now + 1001, day: '2026-11-01', ttl: 180000, subject: 'user:other', network: '203.0.113.11', caps, add: { calls: 1, tokens: 20, micros: 10 }, reservationId: 'map-r3', bodyHash: 'h3' });
  const stored = await ledger.storage.get('day');
  const ok = listed instanceof Map && day1.mode === 'owner' && day2.mode === 'owner' && day2again.mode === 'owner' && stored && stored.day === '2026-11-01';
  if (!ok) detail('day1=' + JSON.stringify(day1) + ' day2=' + JSON.stringify(day2) + ' again=' + JSON.stringify(day2again) + ' stored=' + (stored && stored.day));
  return ok;
});

await check('L9 day roll keeps an open reservation and drops previous-day keys for 1, 500 and 5000 subjects', async () => {
  const now = Date.parse('2026-10-31T23:00:00+05:30');
  const caps = wideCaps();
  for (const count of [1, 500, 5000]) {
    const ledger = makeLedger();
    for (let index = 0; index < count; index += 1) {
      const begun = await ledgerOp(ledger, {
        action: 'begin', now, day: '2026-10-31', ttl: 180000, subject: 'user:bulk-' + index, network: '203.0.113.10', caps,
        add: { calls: 1, tokens: 20, micros: 10 }, reservationId: 'bulk-' + count + '-' + index, bodyHash: 'b'
      });
      if (!begun || begun.mode !== 'owner') {
        detail('begin failed at ' + count + '/' + index + ' ' + JSON.stringify(begun));
        return false;
      }
      await ledgerOp(ledger, { action: 'release', now, day: '2026-10-31', ttl: 180000, reservationId: 'bulk-' + count + '-' + index });
    }
    const open = await ledgerOp(ledger, {
      action: 'begin', now, day: '2026-10-31', ttl: 180000, idemTtl: 600000, subject: 'user:open-' + count, network: '203.0.113.10', caps,
      add: { calls: 1, tokens: 30, micros: 12 }, reservationId: 'open-' + count, bodyHash: 'open', idempotencyKey: 'open-key-' + count
    });
    await ledgerOp(ledger, {
      action: 'complete', now, day: '2026-10-31', ttl: 180000, idemTtl: 600000, replayMax: 1024,
      subject: 'user:open-' + count, idempotencyKey: 'open-key-' + count, bodyHash: 'open', httpStatus: 200, response: '{"kept":true}', reservationId: 'open-' + count
    });
    const rolled = await ledgerOp(ledger, {
      action: 'begin', now: now + 1000, day: '2026-11-01', ttl: 180000, subject: 'user:next-' + count, network: '203.0.113.11', caps,
      add: { calls: 1, tokens: 20, micros: 10 }, reservationId: 'next-' + count, bodyHash: 'n'
    });
    const leftover = ledger.storage.keys().filter((key) => key.indexOf('bal:2026-10-31:') === 0 || key.indexOf('min:2026-10-31:') === 0);
    const replay = await ledgerOp(ledger, {
      action: 'begin', now: now + 1001, day: '2026-11-01', ttl: 180000, idemTtl: 600000,
      subject: 'user:open-' + count, idempotencyKey: 'open-key-' + count, bodyHash: 'open', caps,
      add: { calls: 1, tokens: 20, micros: 10 }, reservationId: 'replay-' + count
    });
    const settled = await ledgerOp(ledger, { action: 'settle', now: now + 1002, day: '2026-11-01', ttl: 180000, reservationId: 'open-' + count, billedTokens: 9, billedMicros: 4 });
    const page = ledger.stats().maxList;
    const ok = open.mode === 'owner' && rolled.mode === 'owner' && leftover.length === 0 && replay.mode === 'replay' && settled.settledTokens === 9 && page > 0 && page <= 128;
    if (!ok) detail('count=' + count + ' rolled=' + JSON.stringify(rolled) + ' leftover=' + leftover.length + ' replay=' + JSON.stringify(replay) + ' settle=' + JSON.stringify(settled) + ' page=' + page);
    if (!ok) return false;
  }
  return true;
});

await check('L9 reserve before midnight settles after, and the first later operation can begin, settle, release or extend', async () => {
  const now = Date.parse('2026-10-31T23:59:00+05:30');
  const caps = wideCaps();
  const flight = makeLedger();
  const reserved = await ledgerOp(flight, { action: 'begin', now, day: '2026-10-31', ttl: 180000, subject: 'user:flight', network: '203.0.113.12', caps, add: { calls: 1, tokens: 40, micros: 15 }, reservationId: 'flight-1', bodyHash: 'f' });
  const settledLater = await ledgerOp(flight, { action: 'settle', now: now + 1000, day: '2026-11-01', ttl: 180000, reservationId: 'flight-1', billedTokens: 11, billedMicros: 6 });
  const flightOk = reserved.mode === 'owner' && settledLater.settledTokens === 11 && settledLater.already !== true;

  async function first(action, extra) {
    const ledger = makeLedger();
    const begun = await ledgerOp(ledger, { action: 'begin', now, day: '2026-10-31', ttl: 180000, subject: 'user:' + action, network: '203.0.113.13', caps, add: { calls: 1, tokens: 20, micros: 8 }, reservationId: action + '-1', bodyHash: action });
    const next = await ledgerOp(ledger, Object.assign({ now: now + 1000, day: '2026-11-01', ttl: 180000, reservationId: action + '-1' }, extra));
    return begun.mode === 'owner' && next;
  }
  const began = await first('begin', { action: 'begin', subject: 'user:fresh', network: '203.0.113.14', caps, add: { calls: 1, tokens: 20, micros: 8 }, reservationId: 'begin-2', bodyHash: 'fresh' });
  const settled = await first('settle', { action: 'settle', billedTokens: 7, billedMicros: 3 });
  const released = await first('release', { action: 'release' });
  const extended = await first('extend', { action: 'extend', caps, add: { tokens: 5, micros: 2 } });
  const ok = flightOk && began && began.mode === 'owner' && settled && settled.settledTokens === 7 && released && released.released === true && extended && extended.reservedTokens === 25;
  if (!ok) detail('flight=' + JSON.stringify(settledLater) + ' begin=' + JSON.stringify(began) + ' settle=' + JSON.stringify(settled) + ' release=' + JSON.stringify(released) + ' extend=' + JSON.stringify(extended));
  return ok;
});

await check('L9 a cleanup that throws is retried and a cleanup that keeps throwing still serves the request', async () => {
  const now = Date.parse('2026-10-31T23:10:00+05:30');
  const caps = wideCaps();
  const once = makeLedger();
  await ledgerOp(once, { action: 'begin', now, day: '2026-10-31', ttl: 180000, subject: 'user:once', network: '203.0.113.15', caps, add: { calls: 1, tokens: 20, micros: 8 }, reservationId: 'once-1', bodyHash: 'o' });
  once.failNextList(1);
  const rolled = await ledgerOp(once, { action: 'begin', now: now + 1000, day: '2026-11-01', ttl: 180000, subject: 'user:once-b', network: '203.0.113.16', caps, add: { calls: 1, tokens: 20, micros: 8 }, reservationId: 'once-2', bodyHash: 'o2' });
  const pending = await once.storage.get('day');
  const stillThere = once.storage.keys().some((key) => key.indexOf('bal:2026-10-31:') === 0 || key.indexOf('min:2026-10-31:') === 0);
  const retried = await ledgerOp(once, { action: 'begin', now: now + 1001, day: '2026-11-01', ttl: 180000, subject: 'user:once-c', network: '203.0.113.17', caps, add: { calls: 1, tokens: 20, micros: 8 }, reservationId: 'once-3', bodyHash: 'o3' });
  const gone = !once.storage.keys().some((key) => key.indexOf('bal:2026-10-31:') === 0 || key.indexOf('min:2026-10-31:') === 0);
  const cleared = await once.storage.get('day');
  const onceOk = rolled.mode === 'owner' && pending.day === '2026-11-01' && pending.cleanupPending === '2026-10-31' && stillThere && retried.mode === 'owner' && gone && cleared.cleanupPending === '';

  const always = makeLedger();
  const held = await ledgerOp(always, { action: 'begin', now, day: '2026-10-31', ttl: 180000, subject: 'user:always', network: '203.0.113.18', caps, add: { calls: 1, tokens: 40, micros: 15 }, reservationId: 'always-1', bodyHash: 'a' });
  always.failNextList(100000);
  const blockedRoll = await ledgerOp(always, { action: 'begin', now: now + 1000, day: '2026-11-01', ttl: 180000, subject: 'user:always-b', network: '203.0.113.19', caps, add: { calls: 1, tokens: 20, micros: 8 }, reservationId: 'always-2', bodyHash: 'a2' });
  const during = await always.storage.get('day');
  const keptKeys = always.storage.keys().some((key) => key.indexOf('bal:2026-10-31:') === 0);
  const charged = await ledgerOp(always, { action: 'settle', now: now + 1002, day: '2026-11-01', ttl: 180000, reservationId: 'always-1', billedTokens: 12, billedMicros: 5 });
  const stillKept = always.storage.keys().some((key) => key.indexOf('bal:2026-10-31:') === 0);
  always.failNextList(0);
  let clearedKeys = false;
  let served = true;
  for (let index = 0; index < 40; index += 1) {
    const step = await ledgerOp(always, { action: 'begin', now: now + 1100 + index, day: '2026-11-01', ttl: 180000, subject: 'user:always-c-' + index, network: '203.0.113.20', caps, add: { calls: 1, tokens: 10, micros: 4 }, reservationId: 'always-c-' + index, bodyHash: 'c' });
    if (!step || step.mode !== 'owner') served = false;
    if (!always.storage.keys().some((key) => key.indexOf('bal:2026-10-31:') === 0 || key.indexOf('min:2026-10-31:') === 0)) {
      clearedKeys = true;
      break;
    }
  }
  const alwaysOk = held.mode === 'owner' && blockedRoll.mode === 'owner' && during.day === '2026-11-01' && during.cleanupPending === '2026-10-31' && keptKeys && charged.settledTokens === 12 && stillKept && served && clearedKeys;
  if (!(onceOk && alwaysOk)) detail('once rolled=' + JSON.stringify(rolled) + ' pending=' + (pending && pending.cleanupPending) + ' gone=' + gone + ' always=' + JSON.stringify(blockedRoll) + ' charged=' + JSON.stringify(charged) + ' cleared=' + clearedKeys + ' served=' + served);
  return onceOk && alwaysOk;
});

await check('L9 two idle days still roll onto the new day', async () => {
  const now = Date.parse('2026-10-30T12:00:00+05:30');
  const ledger = makeLedger();
  const caps = wideCaps();
  const first = await ledgerOp(ledger, { action: 'begin', now, day: '2026-10-30', ttl: 180000, subject: 'user:idle', network: '203.0.113.21', caps, add: { calls: 1, tokens: 20, micros: 8 }, reservationId: 'idle-1', bodyHash: 'i' });
  await ledgerOp(ledger, { action: 'release', now, day: '2026-10-30', ttl: 180000, reservationId: 'idle-1' });
  const later = await ledgerOp(ledger, { action: 'begin', now: now + 48 * 60 * 60 * 1000, day: '2026-11-01', ttl: 180000, subject: 'user:idle', network: '203.0.113.21', caps, add: { calls: 1, tokens: 20, micros: 8 }, reservationId: 'idle-2', bodyHash: 'i2' });
  const day = await ledger.storage.get('day');
  const oldKeys = ledger.storage.keys().filter((key) => key.indexOf('2026-10-30') !== -1 && (key.indexOf('bal:') === 0 || key.indexOf('min:') === 0));
  const missingMiddle = !ledger.storage.keys().some((key) => key.indexOf('2026-10-31') !== -1);
  const ok = first.mode === 'owner' && later.mode === 'owner' && day.day === '2026-11-01' && oldKeys.length === 0 && missingMiddle;
  if (!ok) detail('later=' + JSON.stringify(later) + ' day=' + (day && day.day) + ' old=' + oldKeys.length);
  return ok;
});

await check('L9 strict list is a Map and the old keys shape still rolls', async () => {
  const ledger = makeLedger();
  const page = await ledger.storage.list({ prefix: 'none' });
  let shapeThrew = false;
  try { await ledger.storage.list({ returnShape: 'keys' }); } catch (error) { shapeThrew = error && error.code === 'LIST_SHAPE'; }
  let bothThrew = false;
  try { await ledger.storage.list({ start: 'a', startAfter: 'b' }); } catch (error) { bothThrew = error && error.code === 'LIST_SHAPE'; }
  await ledger.storage.put('c', 1);
  await ledger.storage.put('a', 1);
  await ledger.storage.put('b', 1);
  const forward = Array.from((await ledger.storage.list({ startAfter: 'a', limit: 1 })).keys());
  const reversed = Array.from((await ledger.storage.list({ reverse: true, limit: 1 })).keys());
  const missing = await ledger.storage.get('missing-key');
  const removed = await ledger.storage.delete('a');
  const absent = await ledger.storage.delete('a');

  const map = new Map();
  const kv = {
    async get(key) { return map.has(key) ? map.get(key) : undefined; },
    async put(key, value) { map.set(key, JSON.parse(JSON.stringify(value))); },
    async delete(key) { const had = map.has(key); map.delete(key); return had; },
    async list(options) {
      const prefix = options && options.prefix || '';
      const names = Array.from(map.keys()).filter((key) => !prefix || String(key).indexOf(prefix) === 0).sort();
      return { keys: names.map((name) => ({ name })) };
    },
    async transaction(fn) {
      const snap = new Map(map);
      try { return await fn(kv); } catch (error) { map.clear(); snap.forEach((value, key) => map.set(key, value)); throw error; }
    }
  };
  const old = new worker.UsageLedger({ storage: kv });
  const caps = wideCaps();
  const now = Date.parse('2026-10-31T10:00:00+05:30');
  const first = await (await old.fetch(new Request('https://ledger.internal/', { method: 'POST', body: JSON.stringify({ action: 'begin', now, day: '2026-10-31', ttl: 180000, subject: 'user:old-shape', network: '203.0.113.22', caps, add: { calls: 1, tokens: 20, micros: 8 }, reservationId: 'old-1', bodyHash: 'k' }) }))).json();
  const second = await (await old.fetch(new Request('https://ledger.internal/', { method: 'POST', body: JSON.stringify({ action: 'begin', now: now + 1000, day: '2026-11-01', ttl: 180000, subject: 'user:old-shape', network: '203.0.113.22', caps, add: { calls: 1, tokens: 20, micros: 8 }, reservationId: 'old-2', bodyHash: 'k2' }) }))).json();
  const leftover = Array.from(map.keys()).filter((key) => key.indexOf('bal:2026-10-31:') === 0 || key.indexOf('min:2026-10-31:') === 0);
  const ok = page instanceof Map && shapeThrew && bothThrew && forward[0] === 'b' && reversed[0] === 'c' && missing === undefined && removed === true && absent === false && first.mode === 'owner' && second.mode === 'owner' && leftover.length === 0;
  if (!ok) detail('forward=' + forward.join(',') + ' reverse=' + reversed.join(',') + ' second=' + JSON.stringify(second) + ' leftover=' + leftover.length + ' shape=' + shapeThrew);
  return ok;
});

await check('L10 storage keys and values do not contain the raw subject, address, bearer or salt', async () => {
  const ledger = makeLedger();
  const salt = 'SENTINEL_SALT_VALUE';
  const env = envFor(ledger, { MARG_LEDGER_HASH_SALT: salt });
  const headers = { Authorization: BOB, 'CF-Connecting-IP': '203.0.113.244', 'X-Marg-Client-Id': 'client-sentinel', 'X-Marg-Idempotency-Key': 'idem-key-sentinel-1' };
  const first = await post(chat('plain question'), env, headers);
  const keysAfterFirst = ledger.storage.keys().filter((key) => key.indexOf('bal:') === 0).sort().join('|');
  const second = await post(chat('plain question again'), env, Object.assign({}, headers, { 'X-Marg-Idempotency-Key': 'idem-key-sentinel-2' }));
  const keysAfterSecond = ledger.storage.keys().filter((key) => key.indexOf('bal:') === 0).sort().join('|');
  const other = await post(chat('other student'), env, { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.245', 'X-Marg-Idempotency-Key': 'idem-key-other-1' });
  const keysAfterOther = ledger.storage.keys().filter((key) => key.indexOf('bal:') === 0);
  const dumped = await storedText(ledger);
  const record = lastRecord();
  const hidden = dumped.indexOf('SENTINEL_USER') === -1 && dumped.indexOf('203.0.113.244') === -1 && dumped.indexOf('SENTINEL_BEARER_TOKEN') === -1 && dumped.indexOf(salt) === -1;
  const same = keysAfterFirst && keysAfterFirst === keysAfterSecond;
  const distinct = keysAfterOther.length === 2 && keysAfterFirst !== keysAfterOther.sort().join('|');
  const rolled = makeLedger();
  const caps = wideCaps();
  const now = Date.parse('2026-10-31T22:00:00+05:30');
  await ledgerOp(rolled, { action: 'begin', now, day: '2026-10-31', ttl: 180000, ledgerSalt: salt, subject: 'user:SENTINEL_USER', network: '203.0.113.244', caps, add: { calls: 1, tokens: 20, micros: 8 }, reservationId: 'hash-1', bodyHash: 'h' });
  await ledgerOp(rolled, { action: 'release', now, day: '2026-10-31', ttl: 180000, ledgerSalt: salt, reservationId: 'hash-1' });
  const next = await ledgerOp(rolled, { action: 'begin', now: now + 1000, day: '2026-11-01', ttl: 180000, ledgerSalt: salt, subject: 'user:SENTINEL_USER', network: '203.0.113.244', caps, add: { calls: 1, tokens: 20, micros: 8 }, reservationId: 'hash-2', bodyHash: 'h2' });
  const old = rolled.storage.keys().filter((key) => key.indexOf('bal:2026-10-31:') === 0 || key.indexOf('min:2026-10-31:') === 0);
  const ok = first.status === 200 && second.status === 200 && other.status === 200 && hidden && same && distinct && record.ledgerSaltConfigured === true && next.mode === 'owner' && old.length === 0;
  if (!ok) detail('statuses=' + first.status + '/' + second.status + '/' + other.status + ' hidden=' + hidden + ' same=' + same + ' distinct=' + distinct + ' salt=' + (record && record.ledgerSaltConfigured) + ' old=' + old.length + ' next=' + JSON.stringify(next));
  const unsalted = logs.filter((item) => item.includes('marg_worker_request')).pop();
  await post(chat('no salt'), envFor(makeLedger()), { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.246' });
  const unsaltedRecord = lastRecord();
  if (!unsaltedRecord || unsaltedRecord.ledgerSaltConfigured !== false) {
    detail('unsalted flag ' + (unsaltedRecord && unsaltedRecord.ledgerSaltConfigured) + ' prior ' + unsalted);
    return false;
  }
  return ok;
});

await check('L11 pause switches stop model calls and a partial guest pool is logged', async () => {
  geminiCalls = 0;
  const paused = await post(chat('paused'), { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_GEMINI_PAUSED: '1' }, { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.250' });
  const pausedBody = await paused.json();
  const pausedCalls = geminiCalls;
  const notOne = await post(chat('not paused'), envFor(makeLedger(), { MARG_GEMINI_PAUSED: 'on' }), { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.251' });
  const article = await post({ margAction: 'daily_article', topic: 'economy' }, { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_GEMINI_PAUSED: '1' }, { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.252' });
  const articleBody = await article.json();
  const guestEnv = envFor(makeLedger(), { MARG_GUESTS_PAUSED: '1' });
  const guest = await post(chat('guest paused'), guestEnv, { 'CF-Connecting-IP': '203.0.113.253', 'X-Marg-Client-Id': 'paused-guest' });
  const guestBody = await guest.json();
  const student = await post(chat('student continues'), guestEnv, { Authorization: GOOD, 'CF-Connecting-IP': '203.0.113.254' });
  const pauseOk = paused.status === 503 && pausedBody.error.status === 'SERVICE_PAUSED' && pausedBody.error.retryable === false && pausedCalls === 0 && notOne.status === 200 && article.status === 502 && articleBody.error.status === 'ARTICLE_SOURCE_FAILURE' && guest.status === 503 && guestBody.error.status === 'SERVICE_PAUSED' && student.status === 200;

  const tokenOnly = envFor(makeLedger(), { MARG_GLOBAL_GUEST_TOKENS_PER_DAY: '5000000' });
  await post(chat('partial tokens'), tokenOnly, { 'CF-Connecting-IP': '203.0.113.60', 'X-Marg-Client-Id': 'partial-a' });
  const tokenRecord = lastRecord();
  const microsOnly = envFor(makeLedger(), { MARG_GLOBAL_GUEST_SPEND_MICROS_PER_DAY: '5000000' });
  await post(chat('partial micros'), microsOnly, { 'CF-Connecting-IP': '203.0.113.61', 'X-Marg-Client-Id': 'partial-b' });
  const microsRecord = lastRecord();
  const both = envFor(makeLedger(), { MARG_GLOBAL_GUEST_TOKENS_PER_DAY: '5000000', MARG_GLOBAL_GUEST_SPEND_MICROS_PER_DAY: '5000000' });
  await post(chat('both pools'), both, { 'CF-Connecting-IP': '203.0.113.62', 'X-Marg-Client-Id': 'partial-c' });
  const bothRecord = lastRecord();
  const partialOk = tokenRecord.guestPoolPartial === true && tokenRecord.guestPoolConfigured === true && microsRecord.guestPoolPartial === true && bothRecord.guestPoolPartial === false && bothRecord.guestPoolConfigured === true;
  if (!(pauseOk && partialOk)) detail('paused=' + paused.status + '/' + (pausedBody.error && pausedBody.error.status) + ' article=' + article.status + '/' + (articleBody.error && articleBody.error.status) + ' guest=' + guest.status + ' student=' + student.status + ' partial=' + (tokenRecord && tokenRecord.guestPoolPartial) + '/' + (microsRecord && microsRecord.guestPoolPartial) + '/' + (bothRecord && bothRecord.guestPoolPartial));
  return pauseOk && partialOk;
});

await check('L12 per-subject idempotency keeps the newest 32 and the total cap drops the oldest row', async () => {
  const now = Date.parse('2026-10-31T09:00:00+05:30');
  const caps = wideCaps();
  const subjectLedger = makeLedger();
  for (let index = 0; index < 33; index += 1) {
    const key = 'sub-key-' + String(index).padStart(3, '0');
    const begun = await ledgerOp(subjectLedger, {
      action: 'begin', now, day: '2026-10-31', ttl: 180000, idemTtl: 600000, subject: 'user:capped', network: '203.0.113.70', caps,
      add: { calls: 1, tokens: 10, micros: 4 }, reservationId: 'sub-' + index, bodyHash: 'c' + index, idempotencyKey: key
    });
    if (!begun || begun.mode !== 'owner') {
      detail('subject begin ' + index + ' ' + JSON.stringify(begun));
      return false;
    }
  }
  const idemKeys = subjectLedger.storage.keys().filter((key) => key.indexOf('idem:') === 0);
  const oldest = await ledgerOp(subjectLedger, {
    action: 'begin', now: now + 1, day: '2026-10-31', ttl: 180000, idemTtl: 600000, subject: 'user:capped', network: '203.0.113.70', caps,
    add: { calls: 1, tokens: 10, micros: 4 }, reservationId: 'sub-again-0', bodyHash: 'c0', idempotencyKey: 'sub-key-000'
  });
  const newest = await ledgerOp(subjectLedger, {
    action: 'begin', now: now + 2, day: '2026-10-31', ttl: 180000, idemTtl: 600000, subject: 'user:capped', network: '203.0.113.70', caps,
    add: { calls: 1, tokens: 10, micros: 4 }, reservationId: 'sub-again-32', bodyHash: 'c32', idempotencyKey: 'sub-key-032'
  });
  const subjectOk = oldest.mode === 'owner' && newest.mode === 'in_progress' && idemKeys.length <= 32 && !idemKeys.some((key) => key.indexOf('sub-key-000') !== -1) && idemKeys.some((key) => key.indexOf('sub-key-032') !== -1);

  const totalLedger = makeLedger();
  const firstKey = 'tot-s000-k000';
  let newestKey = '';
  let created = 0;
  for (let subject = 0; subject < 128; subject += 1) {
    for (let index = 0; index < 32; index += 1) {
      const key = 'tot-s' + String(subject).padStart(3, '0') + '-k' + String(index).padStart(3, '0');
      const begun = await ledgerOp(totalLedger, {
        action: 'begin', now, day: '2026-10-31', ttl: 180000, idemTtl: 600000, subject: 'user:total-' + subject, network: 'net-' + subject, caps,
        add: { calls: 1, tokens: 10, micros: 4 }, reservationId: 'tot-' + subject + '-' + index, bodyHash: 't', idempotencyKey: key
      });
      if (!begun || begun.mode !== 'owner') {
        detail('total begin failed at ' + subject + '/' + index + ' ' + JSON.stringify(begun));
        return false;
      }
      newestKey = key;
      created += 1;
    }
  }
  const extra = await ledgerOp(totalLedger, {
    action: 'begin', now, day: '2026-10-31', ttl: 180000, idemTtl: 600000, subject: 'user:total-extra', network: 'net-extra', caps,
    add: { calls: 1, tokens: 10, micros: 4 }, reservationId: 'tot-extra', bodyHash: 'tx', idempotencyKey: 'tot-extra-key'
  });
  const againFirst = await ledgerOp(totalLedger, {
    action: 'begin', now: now + 1, day: '2026-10-31', ttl: 180000, idemTtl: 600000, subject: 'user:total-0', network: 'net-0', caps,
    add: { calls: 1, tokens: 10, micros: 4 }, reservationId: 'tot-first-again', bodyHash: 't', idempotencyKey: firstKey
  });
  const againNewest = await ledgerOp(totalLedger, {
    action: 'begin', now: now + 2, day: '2026-10-31', ttl: 180000, idemTtl: 600000, subject: 'user:total-127', network: 'net-127', caps,
    add: { calls: 1, tokens: 10, micros: 4 }, reservationId: 'tot-newest-again', bodyHash: 't', idempotencyKey: newestKey
  });
  const totalOk = created === 4096 && extra.mode === 'owner' && againFirst.mode === 'owner' && againNewest.mode === 'in_progress';
  if (!(subjectOk && totalOk)) detail('subject oldest=' + JSON.stringify(oldest) + ' newest=' + JSON.stringify(newest) + ' idem=' + idemKeys.length + ' extra=' + JSON.stringify(extra) + ' first=' + JSON.stringify(againFirst) + ' newestTotal=' + JSON.stringify(againNewest) + ' key=' + newestKey);
  return subjectOk && totalOk;
});

await check('L13 the worker source has no in-memory test hook', async () => {
  const hook = source.indexOf('MARG_USAGE_LEDGER_MEMORY') === -1 && source.indexOf('function createMemoryUsageLedger') === -1 && source.indexOf('createMemoryUsageLedger') === -1;
  const listed = /^export \{[^}]+\};/m.test(source) && source.indexOf('export { resolveMaxOutputTokens, UsageLedger };') !== -1;
  return hook && listed;
});

clearTimeout(timeout);
say((failed === 0 ? 'PASS' : 'FAIL') + ' ' + failed + ' failed of ' + checks);
process.exit(failed === 0 ? 0 : 1);
