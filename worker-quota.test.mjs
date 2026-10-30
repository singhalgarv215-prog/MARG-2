import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = '/workspace';
const B3 = 'e39509ba5f92c144cc77746a9d7f204cfbd11e7a';
const SALT = 'test-salt';
const SOURCE = readFileSync(join(ROOT, 'cloudflare-worker.js'), 'utf8');
const BASELINE = execFileSync('git', ['show', B3 + ':cloudflare-worker.js'], { cwd: ROOT, encoding: 'utf8' });
const MARGIN = Number((SOURCE.match(/const RESERVATION_SETTLE_MARGIN_MS = (\d+);/) || [])[1]);
const IN_FLIGHT_RETRY = Number((SOURCE.match(/const IN_FLIGHT_RETRY_AFTER_SECONDS = (\d+);/) || [])[1]);

let failed = 0;
let ipCounter = 1;
let now = Date.UTC(2026, 5, 15, 12, 0, 0);
const geminiBodies = [];
const geminiPlan = [];
const holders = [];
let geminiStarted = 0;
let geminiActive = 0;
let maxGeminiActive = 0;
const logs = [];
const errors = [];
const warns = [];
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const realNow = Date.now;
const realUUID = crypto.randomUUID.bind(crypto);
Date.now = () => now;
console.log = function () {
  logs.push(Array.from(arguments).map(String).join(' '));
  return originalLog.apply(console, arguments);
};
console.error = function () {
  errors.push(Array.from(arguments).map(String).join(' '));
  return originalError.apply(console, arguments);
};
console.warn = function () {
  warns.push(Array.from(arguments).map(String).join(' '));
  return originalWarn.apply(console, arguments);
};

function nextIp() {
  ipCounter += 1;
  return '203.0.113.' + String(ipCounter);
}

function objectName(subject) {
  return createHash('sha256').update(String(subject) + SALT, 'utf8').digest('hex');
}

function resetGemini() {
  geminiBodies.length = 0;
  geminiPlan.length = 0;
  holders.splice(0, holders.length);
  geminiStarted = 0;
  geminiActive = 0;
  maxGeminiActive = 0;
}

function releaseHolders() {
  const pending = holders.splice(0, holders.length);
  pending.forEach((resolve) => resolve());
}

async function waitFor(fn) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (fn()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return !!fn();
}

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || headers.get(name.toLowerCase()) || '';
  const found = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  return found ? headers[found] : '';
}

function stubResponse(status, body, extraHeaders) {
  return new Response(JSON.stringify(body), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {}) });
}

globalThis.fetch = async function (url, options) {
  const target = String(url);
  if (target.includes('/auth/v1/user')) {
    const authorization = headerValue(options && options.headers, 'Authorization');
    if (authorization === 'Bearer SENTINEL_BEARER_TOKEN') return stubResponse(200, { id: 'SENTINEL_USER' });
    if (/^Bearer user-/.test(authorization)) return stubResponse(200, { id: authorization.slice('Bearer '.length) });
    if (authorization === 'Bearer good-token') return stubResponse(200, { id: 'user-1' });
    return stubResponse(401, { message: 'invalid' });
  }
  if (target.includes(':generateContent')) {
    geminiBodies.push(JSON.parse(options.body));
    const step = geminiPlan.shift() || {};
    if (step.hold) await holdGemini(options && options.signal);
    if (step.throw) throw new Error('upstream down');
    if (step.status && step.status !== 200) {
      return stubResponse(step.status, { error: { code: step.status, status: 'UNAVAILABLE', message: 'busy' } }, { 'Retry-After': step.retryAfter || '' });
    }
    const payload = { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] };
    if (!step.omitUsage) {
      payload.usageMetadata = step.usage || { promptTokenCount: 1, candidatesTokenCount: 1, thoughtsTokenCount: 0, totalTokenCount: 8 };
    }
    return stubResponse(200, payload);
  }
  if (target.includes('thehindu.com') || target.includes('aeon.co')) return new Response('no feed', { status: 500 });
  throw new Error('unexpected upstream ' + target);
};

function holdGemini(signal) {
  geminiStarted += 1;
  geminiActive += 1;
  if (geminiActive > maxGeminiActive) maxGeminiActive = geminiActive;
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      geminiActive -= 1;
      if (error) reject(error);
      else resolve();
    };
    holders.push(() => finish());
    if (signal) {
      const abort = () => finish(new DOMException('The operation was aborted', 'AbortError'));
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
  });
}

function createNamespace() {
  const instances = new Map();
  const pending = [];
  let arming = false;
  let wave = 0;
  const namespace = {
    instances,
    fault: null,
    idFromName(name) { return { name: String(name) }; },
    get(id) {
      const name = String(id && id.name != null ? id.name : id);
      if (!instances.has(name)) {
        const store = new Map();
        const state = {
          async blockConcurrencyWhile(fn) { return fn(); },
          storage: {
            async get(key) {
              await Promise.resolve();
              return store.has(key) ? store.get(key) : undefined;
            },
            async put(key, value) {
              await Promise.resolve();
              store.set(key, JSON.parse(JSON.stringify(value)));
            },
            async delete(key) {
              await Promise.resolve();
              store.delete(key);
            },
            async list() {
              await Promise.resolve();
              return { keys: Array.from(store.keys()).map((entry) => ({ name: entry })) };
            }
          }
        };
        instances.set(name, { instance: new worker.MargQuota(state, {}), store });
      }
      const record = instances.get(name);
      return {
        fetch(request) {
          return new Promise((resolve, reject) => {
            pending.push({ request, record, name, resolve, reject });
            wave += 1;
            if (!arming) arm();
          });
        }
      };
    }
  };

  // Requests reach the stub from separate digest callbacks, so a synchronous
  // handler would finish before the next caller arrives. Hold the batch until
  // one quiet turn, then start every handler in that batch before any of them
  // continues past its first await. A synchronous reserve still applies each
  // increment before the next handler reads; an await inside reserve does not.
  function arm() {
    arming = true;
    const waveAtSchedule = wave;
    setImmediate(() => {
      if (wave !== waveAtSchedule) {
        arm();
        return;
      }
      arming = false;
      const batch = pending.splice(0, pending.length);
      batch.forEach((item) => {
        if (namespace.fault && namespace.fault(item.name, null)) {
          item.reject(new Error('quota durable object unreachable'));
          return;
        }
        try {
          item.record.instance.fetch(item.request).then(item.resolve, item.reject);
        } catch (error) {
          item.reject(error);
        }
      });
    });
  }
  return namespace;
}

function allowLimiter() {
  return { async limit() { return { success: true }; } };
}

function loadSource(source, label) {
  const directory = mkdtempSync(join(tmpdir(), 'marg-b4-'));
  const file = join(directory, label + '.mjs');
  writeFileSync(file, source);
  return import(pathToFileURL(file).href);
}

const baseline = await loadSource(BASELINE, 'b3');
const worker = await loadSource(SOURCE, 'worker');

function chatPayload(text) {
  return {
    contents: [{ role: 'user', parts: [{ text: text || 'hi' }] }],
    generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: 'low' } }
  };
}

function visionPayload() {
  return {
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'aaaa' } }, { text: 'hi' }] }],
    generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: 'low' } }
  };
}

const classes = {
  chat: chatPayload('hi'),
  structured: {
    contents: [{ role: 'user', parts: [{ text: 'Write two questions.' }] }],
    generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: 'low' }, responseMimeType: 'application/json', responseJsonSchema: { type: 'object' } }
  },
  vision: visionPayload(),
  grounded: {
    contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: 'low' } },
    margWebGrounding: true
  },
  article: { margAction: 'daily_article', topic: 'economy' }
};

function baseEnv(extra) {
  return Object.assign({ GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_RATE_LIMITER: allowLimiter(), MARG_IP_LIMITER: allowLimiter() }, extra || {});
}

function quotaEnv(namespace, limits, extra) {
  return baseEnv(Object.assign({
    MARG_QUOTA: namespace,
    MARG_QUOTA_MODE: 'enforce',
    MARG_QUOTA_LIMITS: JSON.stringify(limits || {}),
    MARG_QUOTA_DAY_OFFSET_MINUTES: '0',
    MARG_QUOTA_FAILURE: 'closed',
    QUOTA_HASH_SALT: SALT
  }, extra || {}));
}

async function post(module, payload, env, headers) {
  const requestHeaders = Object.assign({
    'Content-Type': 'application/json',
    'X-Marg-Client-Id': 'client-a',
    'CF-Connecting-IP': nextIp(),
    Authorization: 'Bearer user-default'
  }, headers || {});
  if (!requestHeaders.Authorization) delete requestHeaders.Authorization;
  return module.default.fetch(new Request('https://worker.test/', {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(payload)
  }), env);
}

async function read(response) {
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch (_error) {}
  return { status: response.status, text, body, retryAfter: response.headers.get('Retry-After') };
}

function memoryOf(namespace, subject) {
  const record = namespace.instances.get(objectName(subject));
  return record ? record.instance.memory : null;
}

function dayOf(memory) {
  if (!memory) return null;
  const days = Object.values(memory.days);
  return days.length ? days[0] : null;
}

function problems(list) {
  const found = list.filter((item) => typeof item === 'string' && item);
  return found.length ? found.join(' | ') : true;
}

async function check(name, fn) {
  resetGemini();
  try {
    const result = await fn();
    const ok = result === true;
    originalLog((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + result));
    if (!ok) failed += 1;
  } catch (error) {
    originalLog('FAIL ' + name + ' ' + (error && error.stack || error));
    failed += 1;
  }
}

function userHeaders(id, extra) {
  return Object.assign({ Authorization: 'Bearer ' + id, 'CF-Connecting-IP': '198.51.100.10' }, extra || {});
}

await check('Q1 flag off, binding absent, and no limits match B3 for every class', async () => {
  if (!/export \{ resolveMaxOutputTokens, MargQuota \};/.test(SOURCE)) return 'export list form changed';
  if (/\bimport\s/.test(SOURCE) || /extends\s+DurableObject/.test(SOURCE) || /cloudflare:workers/.test(SOURCE)) return 'harness constraint broken';
  const throwingBinding = {
    idFromName() { throw new Error('quota binding used while off'); },
    get() { throw new Error('quota binding used while off'); }
  };
  const cases = [
    { name: 'binding-absent', env: { GEMINI_API_KEY: 'TEST_NOT_REAL' } },
    { name: 'mode-off', env: { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_QUOTA: throwingBinding, MARG_QUOTA_MODE: 'off', MARG_QUOTA_LIMITS: JSON.stringify({ user: { calls_per_day: 1 } }) } },
    { name: 'no-limits', env: { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_QUOTA: throwingBinding, MARG_QUOTA_MODE: 'log' } }
  ];
  const mismatches = [];
  for (const className of Object.keys(classes)) {
    for (const item of cases) {
      let uuid = 0;
      crypto.randomUUID = () => '00000000-0000-4000-8000-' + String(++uuid).padStart(12, '0');
      resetGemini();
      const before = await read(await post(baseline, classes[className], item.env, userHeaders('good-token')));
      const beforeGemini = JSON.stringify(geminiBodies);
      uuid = 0;
      resetGemini();
      const after = await read(await post(worker, classes[className], item.env, userHeaders('good-token')));
      const afterGemini = JSON.stringify(geminiBodies);
      crypto.randomUUID = realUUID;
      if (before.status !== after.status || before.text !== after.text || beforeGemini !== afterGemini) {
        mismatches.push(className + '/' + item.name + ' status ' + before.status + '/' + after.status);
      }
    }
  }
  crypto.randomUUID = realUUID;
  return problems(mismatches);
});

const probeNamespace = createNamespace();
const probeLogs = logs.length;
await post(worker, chatPayload(), quotaEnv(probeNamespace, { user: { calls_per_day: 1000, tokens_per_day: 5000000 }, global: { tokens_per_day: 5000000, tokens_per_month: 5000000 } }), userHeaders('user-probe'));
const probeLine = logs.slice(probeLogs).filter((line) => line.includes('marg_worker_request')).pop();
const ESTIMATE = probeLine ? JSON.parse(probeLine).reservedTokens : 0;
if (!Number.isInteger(ESTIMATE) || ESTIMATE <= 0) {
  originalLog('FAIL estimate probe ' + ESTIMATE);
  failed += 1;
}

await check('Q2 per-user daily call quota rejects the request after the cap', async () => {
  const namespace = createNamespace();
  const env = quotaEnv(namespace, { user: { calls_per_day: 2 } });
  const headers = userHeaders('user-q2');
  const first = await read(await post(worker, chatPayload(), env, headers));
  const second = await read(await post(worker, chatPayload(), env, headers));
  const before = geminiBodies.length;
  const third = await read(await post(worker, chatPayload(), env, headers));
  const reset = Date.UTC(2026, 5, 16);
  const error = third.body && third.body.error || {};
  return problems([
    first.status !== 200 && 'first ' + first.status,
    second.status !== 200 && 'second ' + second.status,
    third.status !== 429 && 'third ' + third.status,
    error.status !== 'USER_DAILY_QUOTA' && error.status,
    error.scope !== 'user' && error.scope,
    error.retryable !== false && 'retryable',
    error.code !== 429 && 'code',
    third.retryAfter !== String(Math.ceil((reset - now) / 1000)) && 'retry-after ' + third.retryAfter,
    error.reset_at !== new Date(reset).toISOString() && error.reset_at,
    geminiBodies.length !== before && 'gemini was called',
    Object.keys(error).sort().join(',') !== 'code,request_id,reset_at,retryable,scope,status' && 'shape'
  ]);
});

await check('Q3 settle uses actual usage and missing usage charges the estimate', async () => {
  const under = createNamespace();
  const underEnv = quotaEnv(under, { user: { tokens_per_day: ESTIMATE + 100 } });
  const underHeaders = userHeaders('user-q3a');
  geminiPlan.push({ usage: { promptTokenCount: 2, candidatesTokenCount: 3, thoughtsTokenCount: 3, totalTokenCount: 8 } });
  const first = await read(await post(worker, chatPayload(), underEnv, underHeaders));
  const day = dayOf(memoryOf(under, 'user:user-q3a'));
  const settled = day && day.tokens;
  const second = await read(await post(worker, chatPayload(), underEnv, underHeaders));
  const missing = createNamespace();
  const missingEnv = quotaEnv(missing, { user: { tokens_per_day: ESTIMATE } });
  const missingHeaders = userHeaders('user-q3b');
  geminiPlan.push({ omitUsage: true });
  const charged = await read(await post(worker, chatPayload(), missingEnv, missingHeaders));
  const chargedDay = dayOf(memoryOf(missing, 'user:user-q3b'));
  const blocked = await read(await post(worker, chatPayload(), missingEnv, missingHeaders));
  return problems([
    first.status !== 200 && 'under first',
    !day && 'missing day',
    settled !== 8 && 'settled ' + settled,
    day && day.reserved !== 0 && 'reserved left',
    second.status !== 200 && 'under-use did not free budget ' + second.status,
    charged.status !== 200 && 'missing usage first',
    chargedDay && chargedDay.tokens !== ESTIMATE && 'charged ' + (chargedDay && chargedDay.tokens),
    blocked.status !== 429 && 'missing usage did not consume the estimate'
  ]);
});

await check('Q4 guests share an IP bucket and the guest token pool', async () => {
  const calls = createNamespace();
  const callEnv = quotaEnv(calls, { guest: { calls_per_day: 2 }, global: { tokens_per_day: 5000000 } });
  async function guest(ip, clientId) {
    return read(await post(worker, chatPayload(), callEnv, { Authorization: '', 'CF-Connecting-IP': ip, 'X-Marg-Client-Id': clientId }));
  }
  const first = await guest('2001:db8:1:2::10', 'client-1');
  const second = await guest('2001:db8:1:2:ffff:1:2:3', 'client-2');
  const third = await guest('2001:db8:1:2::99', 'client-3');
  const other = await guest('2001:db8:1:3::1', 'client-3');
  const pool = createNamespace();
  const poolEnv = quotaEnv(pool, { guest: { calls_per_day: 20 }, global: { tokens_per_day: 5000000, guest_tokens_per_day: ESTIMATE } });
  geminiPlan.push({ usage: { totalTokenCount: ESTIMATE } });
  const guestOne = await read(await post(worker, chatPayload(), poolEnv, { Authorization: '', 'CF-Connecting-IP': '203.0.113.40', 'X-Marg-Client-Id': 'pool-a' }));
  const guestTwo = await read(await post(worker, chatPayload(), poolEnv, { Authorization: '', 'CF-Connecting-IP': '203.0.113.41', 'X-Marg-Client-Id': 'pool-b' }));
  const student = await read(await post(worker, chatPayload(), poolEnv, userHeaders('user-q4')));
  return problems([
    first.status !== 200 && 'first guest',
    second.status !== 200 && 'same /64',
    third.status !== 429 && 'rotating client id reset the bucket ' + third.status,
    third.body && third.body.error && third.body.error.status !== 'GUEST_DAILY_QUOTA' && third.body.error.status,
    third.body && third.body.error && third.body.error.scope !== 'guest' && 'guest scope',
    other.status !== 200 && 'different /64 should be a new bucket',
    guestOne.status !== 200 && 'pool guest',
    guestTwo.status !== 429 && 'guest pool ' + guestTwo.status,
    guestTwo.body && guestTwo.body.error && guestTwo.body.error.status !== 'GUEST_DAILY_QUOTA' && 'pool status',
    guestTwo.body && guestTwo.body.error && guestTwo.body.error.scope !== 'global' && 'pool scope',
    student.status !== 200 && 'student blocked by guest pool'
  ]);
});

await check('Q5 global daily and monthly budgets roll on the configured offset', async () => {
  now = Date.UTC(2026, 5, 15, 12, 0, 0);
  const daily = createNamespace();
  const dailyEnv = quotaEnv(daily, { user: { calls_per_day: 20 }, guest: { calls_per_day: 20 }, global: { tokens_per_day: ESTIMATE, tokens_per_month: 5000000 } });
  geminiPlan.push({ omitUsage: true });
  const userOne = await read(await post(worker, chatPayload(), dailyEnv, userHeaders('user-q5a')));
  const userTwo = await read(await post(worker, chatPayload(), dailyEnv, userHeaders('user-q5b')));
  const guest = await read(await post(worker, chatPayload(), dailyEnv, { Authorization: '', 'CF-Connecting-IP': '203.0.113.70', 'X-Marg-Client-Id': 'q5-guest' }));
  const offset = 330;
  const boundary = 20000 * 86400000 - offset * 60000;
  now = boundary - 1;
  const rollover = createNamespace();
  const rollEnv = quotaEnv(rollover, { user: { calls_per_day: 1 } }, { MARG_QUOTA_DAY_OFFSET_MINUTES: String(offset) });
  const oldDay = await read(await post(worker, chatPayload(), rollEnv, userHeaders('user-q5c')));
  const oldDenied = await read(await post(worker, chatPayload(), rollEnv, userHeaders('user-q5c')));
  now = boundary;
  const newDay = await read(await post(worker, chatPayload(), rollEnv, userHeaders('user-q5c')));
  const monthStart = Date.UTC(2026, 6, 1);
  const monthBoundary = monthStart - offset * 60000;
  now = monthBoundary - 2 * 86400000;
  const monthly = createNamespace();
  const monthEnv = quotaEnv(monthly, { user: { calls_per_day: 20 }, global: { tokens_per_day: 5000000, tokens_per_month: ESTIMATE } }, { MARG_QUOTA_DAY_OFFSET_MINUTES: String(offset) });
  geminiPlan.push({ omitUsage: true });
  const monthOne = await read(await post(worker, chatPayload(), monthEnv, userHeaders('user-q5d')));
  const monthDenied = await read(await post(worker, chatPayload(), monthEnv, userHeaders('user-q5d')));
  now += 86400000;
  const nextDayStill = await read(await post(worker, chatPayload(), monthEnv, userHeaders('user-q5d')));
  now = monthBoundary;
  const newMonth = await read(await post(worker, chatPayload(), monthEnv, userHeaders('user-q5d')));
  now = Date.UTC(2026, 5, 15, 12, 0, 0);
  return problems([
    userOne.status !== 200 && 'global first',
    userTwo.status !== 429 && 'global user',
    userTwo.body && userTwo.body.error && userTwo.body.error.status !== 'GLOBAL_DAILY_BUDGET' && userTwo.body.error.status,
    guest.status !== 429 && 'global guest',
    guest.body && guest.body.error && guest.body.error.status !== 'GLOBAL_DAILY_BUDGET' && 'guest global',
    guest.body && guest.body.error && guest.body.error.scope !== 'global' && 'scope',
    oldDay.status !== 200 && 'before boundary',
    oldDenied.status !== 429 && 'same day',
    newDay.status !== 200 && 'exact reset instant',
    monthOne.status !== 200 && 'month first',
    monthDenied.body && monthDenied.body.error && monthDenied.body.error.status !== 'GLOBAL_MONTHLY_BUDGET' && monthDenied.body.error.status,
    nextDayStill.body && nextDayStill.body.error && nextDayStill.body.error.status !== 'GLOBAL_MONTHLY_BUDGET' && 'day rollover cleared the month',
    newMonth.status !== 200 && 'month boundary'
  ]);
});

await check('Q6 one hundred simultaneous calls and in-flight cap', async () => {
  now = Date.UTC(2026, 5, 15, 12, 0, 0);
  const calls = createNamespace();
  const callEnv = quotaEnv(calls, { user: { calls_per_day: 10 } });
  const headers = userHeaders('user-q6a');
  const responses = await Promise.all(Array.from({ length: 100 }, () => post(worker, chatPayload(), callEnv, headers).then(read)));
  const allowed = responses.filter((item) => item.status === 200).length;
  const denied = responses.filter((item) => item.status === 429 && item.body && item.body.error && item.body.error.status === 'USER_DAILY_QUOTA').length;
  const callGemini = geminiBodies.length;
  const callMemory = memoryOf(calls, 'user:user-q6a');
  const flight = createNamespace();
  const flightEnv = quotaEnv(flight, { user: { max_in_flight: 3, calls_per_day: 100 } });
  geminiPlan.push({ hold: true }, { hold: true }, { hold: true }, { hold: true }, { hold: true }, { hold: true }, { hold: true }, { hold: true });
  const done = [];
  const tasks = Array.from({ length: 8 }, () => post(worker, chatPayload(), flightEnv, userHeaders('user-q6b')).then(async (response) => {
    const item = await read(response);
    done.push(item);
    return item;
  }));
  const opened = await waitFor(() => geminiStarted === 3 && done.filter((item) => item.status === 429).length === 5);
  const retry = done.find((item) => item.status === 429);
  releaseHolders();
  await Promise.all(tasks);
  const flightMemory = memoryOf(flight, 'user:user-q6b');
  const flightDay = dayOf(flightMemory);
  return problems([
    allowed !== 10 && 'allowed ' + allowed,
    denied !== 90 && 'denied ' + denied,
    callGemini !== 10 && 'gemini ' + callGemini,
    callMemory && Object.keys(callMemory.reservations).length !== 0 && 'call reservations leaked',
    !opened && 'in-flight did not settle at 3',
    maxGeminiActive > 3 && 'in flight ' + maxGeminiActive,
    geminiStarted !== 3 && 'started ' + geminiStarted,
    !retry && 'no in-flight rejection',
    retry && retry.body.error.status !== 'TOO_MANY_IN_FLIGHT' && retry.body.error.status,
    retry && retry.body.error.retryable !== true && 'in-flight retryable',
    retry && retry.retryAfter !== String(IN_FLIGHT_RETRY) && 'in-flight retry-after ' + (retry && retry.retryAfter),
    flightMemory && Object.keys(flightMemory.reservations).length !== 0 && 'in-flight reservations leaked',
    flightDay && flightDay.calls !== 3 && 'in-flight calls ' + (flightDay && flightDay.calls)
  ]);
});

await check('Q7 upstream failure, durable object failure, expiry, and global rollback', async () => {
  now = Date.UTC(2026, 5, 15, 12, 0, 0);
  async function failedUpstream(step, label) {
    const namespace = createNamespace();
    const env = quotaEnv(namespace, { user: { calls_per_day: 5, max_in_flight: 1 } });
    geminiPlan.push(step);
    const response = await read(await post(worker, chatPayload(), env, Object.assign(userHeaders('user-' + label), step.hold || step.status === 429 ? { 'X-Marg-Timeout-Ms': '1000' } : {})));
    const memory = memoryOf(namespace, 'user:user-' + label);
    const day = dayOf(memory);
    return problems([
      day && day.tokens !== 0 && label + ' tokens ' + (day && day.tokens),
      day && day.calls !== 1 && label + ' calls ' + (day && day.calls),
      memory && Object.keys(memory.reservations).length !== 0 && label + ' reservation leaked',
      response.status === 200 && label + ' should not succeed'
    ]);
  }
  const server = await failedUpstream({ status: 500 }, 'q7s');
  const limited = await failedUpstream({ status: 429, retryAfter: '30' }, 'q7r');
  geminiPlan.length = 0;
  const timed = await failedUpstream({ hold: true }, 'q7t');
  const beforeClosed = geminiBodies.length;
  const closed = createNamespace();
  closed.fault = () => true;
  const closedUser = await read(await post(worker, chatPayload(), quotaEnv(closed, { user: { calls_per_day: 5 } }), userHeaders('user-q7c')));
  const closedGuest = await read(await post(worker, chatPayload(), quotaEnv(closed, { user: { calls_per_day: 5 }, guest: { calls_per_day: 5 } }), { Authorization: '', 'CF-Connecting-IP': '203.0.113.80', 'X-Marg-Client-Id': 'q7-guest' }));
  const closedGemini = geminiBodies.length;
  const opened = createNamespace();
  opened.fault = () => true;
  const openEnv = quotaEnv(opened, { user: { calls_per_day: 5 }, guest: { calls_per_day: 5 } }, { MARG_QUOTA_FAILURE: 'open_registered' });
  const openUser = await read(await post(worker, chatPayload(), openEnv, userHeaders('user-q7o')));
  const openGuest = await read(await post(worker, chatPayload(), openEnv, { Authorization: '', 'CF-Connecting-IP': '203.0.113.81', 'X-Marg-Client-Id': 'q7-open' }));
  const expiry = createNamespace();
  const expiryEnv = quotaEnv(expiry, { user: { max_in_flight: 1, calls_per_day: 10 } });
  holders.splice(0, holders.length);
  geminiStarted = 0;
  geminiPlan.push({ hold: true });
  const stuckPromise = post(worker, chatPayload(), expiryEnv, userHeaders('user-q7e')).then(read);
  const sawStuck = await waitFor(() => geminiStarted === 1);
  now += 120000;
  const freed = await read(await post(worker, chatPayload(), expiryEnv, userHeaders('user-q7e')));
  releaseHolders();
  await stuckPromise;
  const expiryMemory = memoryOf(expiry, 'user:user-q7e');
  const rollback = createNamespace();
  const rollbackEnv = quotaEnv(rollback, { user: { calls_per_day: 1 }, global: { tokens_per_day: 1 } });
  const firstGlobal = await read(await post(worker, chatPayload(), rollbackEnv, userHeaders('user-q7g')));
  const secondGlobal = await read(await post(worker, chatPayload(), rollbackEnv, userHeaders('user-q7g')));
  const rolled = memoryOf(rollback, 'user:user-q7g');
  const rolledDay = dayOf(rolled);
  now = Date.UTC(2026, 5, 15, 12, 0, 0);
  return problems([
    server,
    limited,
    timed,
    closedUser.status !== 503 && 'closed user',
    closedUser.body && closedUser.body.error && closedUser.body.error.status !== 'QUOTA_UNAVAILABLE' && closedUser.body.error.status,
    closedGuest.status !== 503 && 'closed guest',
    closedGemini !== beforeClosed && 'closed called gemini',
    openUser.status !== 200 && 'open user ' + openUser.status,
    openGuest.status !== 503 && 'open guest',
    openGuest.body && openGuest.body.error && openGuest.body.error.status !== 'QUOTA_UNAVAILABLE' && 'open guest status',
    !sawStuck && 'stuck reservation did not start',
    freed.status !== 200 && 'expired reservation was not freed ' + freed.status,
    expiryMemory && Object.keys(expiryMemory.reservations).length !== 0 && 'expiry leak',
    firstGlobal.body && firstGlobal.body.error && firstGlobal.body.error.status !== 'GLOBAL_DAILY_BUDGET' && firstGlobal.body.error.status,
    secondGlobal.body && secondGlobal.body.error && secondGlobal.body.error.status !== 'GLOBAL_DAILY_BUDGET' && 'rollback burned the user call',
    rolledDay && rolledDay.calls !== 0 && 'rolled calls ' + (rolledDay && rolledDay.calls),
    rolled && Object.keys(rolled.reservations).length !== 0 && 'rolled reservation'
  ]);
});

await check('Q8 invalid enforce configuration behaves as log and does not throw', async () => {
  const errorAt = errors.length;
  async function allows(limits, extra) {
    const namespace = createNamespace();
    const env = quotaEnv(namespace, null, Object.assign({ MARG_QUOTA_LIMITS: limits, MARG_QUOTA_DAY_OFFSET_MINUTES: '0', MARG_QUOTA_FAILURE: 'closed' }, extra || {}));
    const headers = userHeaders('user-q8-' + ipCounter);
    const first = await read(await post(worker, chatPayload(), env, headers));
    const second = await read(await post(worker, chatPayload(), env, headers));
    return first.status === 200 && second.status === 200;
  }
  const badJson = await allows('{');
  const negative = await allows(JSON.stringify({ user: { calls_per_day: -5 } }));
  const fraction = await allows(JSON.stringify({ user: { calls_per_day: 1.5 } }));
  const zero = await allows(JSON.stringify({ user: { calls_per_day: 0 } }));
  const text = await allows(JSON.stringify({ user: { calls_per_day: '2' } }));
  const missingOffset = await allows(JSON.stringify({ user: { calls_per_day: 1 } }), { MARG_QUOTA_DAY_OFFSET_MINUTES: '' });
  const missingFailure = await allows(JSON.stringify({ user: { calls_per_day: 1 } }), { MARG_QUOTA_FAILURE: '' });
  const namespace = createNamespace();
  const imageEnv = quotaEnv(namespace, { user: { calls_per_day: 1 } });
  const imageHeaders = userHeaders('user-q8-image');
  const imageOne = await read(await post(worker, visionPayload(), imageEnv, imageHeaders));
  const imageTwo = await read(await post(worker, visionPayload(), imageEnv, imageHeaders));
  const logged = errors.slice(errorAt).join('\n');
  return problems([
    !badJson && 'bad json',
    !negative && 'negative',
    !fraction && 'fraction',
    !zero && 'zero',
    !text && 'string',
    !missingOffset && 'missing offset',
    !missingFailure && 'missing failure',
    imageOne.status !== 200 && 'image one',
    imageTwo.status !== 200 && 'image two enforced without image_tokens',
    logged.indexOf('MARG_QUOTA configuration invalid') === -1 && 'no configuration error log'
  ]);
});

await check('Q9 pause switches work without a durable object binding', async () => {
  const before = geminiBodies.length;
  const paused = await read(await post(worker, chatPayload(), baseEnv({ MARG_GEMINI_PAUSED: '1' }), userHeaders('user-q9')));
  const pausedGemini = geminiBodies.length;
  const guestPaused = await read(await post(worker, chatPayload(), baseEnv({ MARG_GUESTS_PAUSED: '1' }), { Authorization: '', 'CF-Connecting-IP': '203.0.113.90', 'X-Marg-Client-Id': 'q9-guest' }));
  const userOpen = await read(await post(worker, chatPayload(), baseEnv({ MARG_GUESTS_PAUSED: '1' }), userHeaders('user-q9b')));
  const throwingBinding = { idFromName() { throw new Error('binding touched'); }, get() { throw new Error('binding touched'); } };
  const pausedOff = await read(await post(worker, chatPayload(), baseEnv({ MARG_QUOTA: throwingBinding, MARG_QUOTA_MODE: 'off', MARG_GEMINI_PAUSED: '1' }), userHeaders('user-q9c')));
  return problems([
    paused.status !== 503 && 'paused ' + paused.status,
    paused.body && paused.body.error && paused.body.error.status !== 'SERVICE_PAUSED' && paused.body.error.status,
    pausedGemini !== before && 'paused called gemini',
    guestPaused.status !== 503 && 'guest paused',
    userOpen.status !== 200 && 'student was paused with guests',
    pausedOff.status !== 503 && 'pause required the binding'
  ]);
});

await check('Q10 exempt users skip user caps, stay metered, and still hit rate limits', async () => {
  const namespace = createNamespace();
  const env = quotaEnv(namespace, { user: { calls_per_day: 1 }, global: { tokens_per_day: 5000000 } }, { MARG_QUOTA_EXEMPT: 'other, user-q10 ,nope' });
  const headers = userHeaders('user-q10');
  const logAt = logs.length;
  const first = await read(await post(worker, chatPayload(), env, headers));
  const second = await read(await post(worker, chatPayload(), env, headers));
  const day = dayOf(memoryOf(namespace, 'user:user-q10'));
  const line = logs.slice(logAt).filter((entry) => entry.includes('marg_worker_request')).pop();
  const record = line ? JSON.parse(line) : {};
  let hits = 0;
  const limited = quotaEnv(createNamespace(), { user: { calls_per_day: 1 } }, {
    MARG_QUOTA_EXEMPT: 'user-q10b',
    MARG_RATE_LIMITER: { async limit() { hits += 1; return { success: hits <= 1 }; } }
  });
  const rateOne = await read(await post(worker, chatPayload(), limited, userHeaders('user-q10b')));
  const rateTwo = await read(await post(worker, chatPayload(), limited, userHeaders('user-q10b')));
  const globalCap = quotaEnv(createNamespace(), { user: { calls_per_day: 1 }, global: { tokens_per_day: ESTIMATE } }, { MARG_QUOTA_EXEMPT: 'user-q10c' });
  geminiPlan.push({ omitUsage: true });
  const globalOne = await read(await post(worker, chatPayload(), globalCap, userHeaders('user-q10c')));
  const globalTwo = await read(await post(worker, chatPayload(), globalCap, userHeaders('user-q10c')));
  return problems([
    first.status !== 200 && 'first exempt',
    second.status !== 200 && 'exempt user was capped',
    !day || day.calls !== 2 && 'not metered ' + (day && day.calls),
    record.quotaOutcome !== 'allowed' && 'outcome',
    record.quotaMode !== 'enforce' && 'mode',
    !Number.isFinite(record.reservedTokens) && 'reserved',
    String(line || '').indexOf('user-q10') !== -1 && 'raw id logged',
    rateOne.status !== 200 && 'rate first',
    rateTwo.status !== 429 && 'rate second',
    rateTwo.body && rateTwo.body.error && rateTwo.body.error.status !== 'RATE_LIMITED' && rateTwo.body.error.status,
    globalOne.status !== 200 && 'global first',
    globalTwo.body && globalTwo.body.error && globalTwo.body.error.status !== 'GLOBAL_DAILY_BUDGET' && 'exempt skipped global'
  ]);
});

await check('Q11 an internal upstream retry is charged once', async () => {
  const namespace = createNamespace();
  const env = quotaEnv(namespace, { user: { calls_per_day: 5 }, global: { tokens_per_day: 5000000 } });
  geminiPlan.push({ status: 429, retryAfter: '0.001' });
  geminiPlan.push({ usage: { promptTokenCount: 1, candidatesTokenCount: 1, thoughtsTokenCount: 6, totalTokenCount: 8 } });
  const response = await read(await post(worker, chatPayload(), env, userHeaders('user-q11')));
  const day = dayOf(memoryOf(namespace, 'user:user-q11'));
  const globalDay = dayOf(memoryOf(namespace, 'global'));
  return problems([
    response.status !== 200 && 'status ' + response.status,
    geminiBodies.length !== 2 && 'upstream calls ' + geminiBodies.length,
    response.text.indexOf('"upstreamCalls":2') === -1 && 'header count missing',
    !day || day.calls !== 1 && 'calls ' + (day && day.calls),
    !day || day.tokens !== 8 && 'tokens ' + (day && day.tokens),
    !globalDay || globalDay.tokens !== 8 && 'global tokens ' + (globalDay && globalDay.tokens)
  ]);
});

await check('Q12 logs and durable object state contain no raw identifiers', async () => {
  const namespace = createNamespace();
  const env = quotaEnv(namespace, { user: { calls_per_day: 5, tokens_per_day: 5000000 }, global: { tokens_per_day: 5000000 } });
  const logAt = logs.length;
  const errorAt = errors.length;
  const warnAt = warns.length;
  await post(worker, chatPayload('SENTINEL_MESSAGE_TEXT'), env, {
    Authorization: 'Bearer SENTINEL_BEARER_TOKEN',
    'CF-Connecting-IP': 'SENTINEL_IP',
    'X-Marg-Client-Id': 'client-sentinel'
  });
  const sentinels = ['SENTINEL_USER', 'SENTINEL_IP', 'SENTINEL_BEARER_TOKEN', 'SENTINEL_MESSAGE_TEXT'];
  const blobs = [logs.slice(logAt).join('\n'), errors.slice(errorAt).join('\n'), warns.slice(warnAt).join('\n')];
  namespace.instances.forEach((record, name) => {
    blobs.push(name);
    blobs.push(JSON.stringify(Array.from(record.store.entries())));
    blobs.push(JSON.stringify(record.instance.memory));
  });
  const hit = sentinels.filter((sentinel) => blobs.join('\n').indexOf(sentinel) !== -1);
  return hit.length ? hit.join(',') : true;
});

await check('Q13 a student under the limits matches B3 and the per-minute limiter still applies', async () => {
  const namespace = createNamespace();
  const env = quotaEnv(namespace, { user: { calls_per_day: 100, tokens_per_day: 5000000, max_in_flight: 20 }, global: { tokens_per_day: 5000000, tokens_per_month: 5000000 } });
  let uuid = 0;
  crypto.randomUUID = () => '00000000-0000-4000-8000-' + String(++uuid).padStart(12, '0');
  resetGemini();
  const before = await read(await post(baseline, chatPayload('How should I start QA?'), { GEMINI_API_KEY: 'TEST_NOT_REAL' }, userHeaders('good-token')));
  const beforeGemini = JSON.stringify(geminiBodies);
  uuid = 0;
  resetGemini();
  const after = await read(await post(worker, chatPayload('How should I start QA?'), env, userHeaders('good-token')));
  const afterGemini = JSON.stringify(geminiBodies);
  crypto.randomUUID = realUUID;
  const deny = { async limit() { return { success: false }; } };
  uuid = 0;
  crypto.randomUUID = () => '10000000-0000-4000-8000-' + String(++uuid).padStart(12, '0');
  const limitedBefore = await read(await post(baseline, chatPayload(), { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_RATE_LIMITER: deny, MARG_IP_LIMITER: allowLimiter() }, userHeaders('good-token')));
  uuid = 0;
  const limitedAfter = await read(await post(worker, chatPayload(), quotaEnv(createNamespace(), { user: { calls_per_day: 10 } }, { MARG_RATE_LIMITER: deny }), userHeaders('good-token')));
  crypto.randomUUID = realUUID;
  return problems([
    before.status !== after.status && 'status',
    before.text !== after.text && 'body',
    beforeGemini !== afterGemini && 'gemini body',
    limitedBefore.status !== 429 && 'baseline limiter',
    limitedAfter.status !== 429 && 'limiter',
    limitedBefore.text !== limitedAfter.text && 'limiter body',
    limitedAfter.body && limitedAfter.body.error && limitedAfter.body.error.status !== 'RATE_LIMITED' && limitedAfter.body.error.status,
    limitedAfter.retryAfter !== '60' && 'retry-after'
  ]);
});

crypto.randomUUID = realUUID;
Date.now = realNow;
console.log = originalLog;
console.error = originalError;
console.warn = originalWarn;
console.log((failed ? failed + ' FAILED' : '13 passed') + ' of 13');
process.exit(failed ? 1 : 0);
