import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const MargSession = require('./marg-session.js');
const sessionSource = fs.readFileSync(path.join(root, 'marg-session.js'), 'utf8');

const checks = [];
function check(name, passed) {
  checks.push([name, !!passed]);
  console.log((passed ? 'PASS' : 'FAIL') + ' — ' + name);
}

const QA_NOTE = 'Today\u2019s generated draft did not pass Marg\u2019s checks, so two hand-checked questions opened instead.';
const RC_NOTE = 'Today\u2019s generated draft did not pass Marg\u2019s checks, so this hand-checked RC opened instead.';
const WORKER_URL = 'https://marg.singhalgarv215.workers.dev/';

function makeJwt(expSeconds) {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ exp: expSeconds })).toString('base64url');
  return header + '.' + body + '.sig';
}

function memoryStorage() {
  const data = new Map();
  const writes = [];
  const reads = [];
  let throwReads = false;
  let throwWrites = false;
  return {
    writes: writes,
    reads: reads,
    throwReads(value) { throwReads = !!value; },
    throwWrites(value) { throwWrites = !!value; },
    getItem(key) {
      if (throwReads) throw new Error('storage unavailable');
      reads.push(String(key));
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      if (throwWrites) throw new Error('storage unavailable');
      writes.push(['set', String(key), String(value)]);
      data.set(String(key), String(value));
    },
    removeItem(key) {
      if (throwWrites) throw new Error('storage unavailable');
      writes.push(['remove', String(key)]);
      data.delete(String(key));
    },
    dump() { return Object.fromEntries(data); },
    seed(key, value) { data.set(String(key), String(value)); }
  };
}

function httpResult(status, body, headerMap) {
  const headers = headerMap || {};
  return {
    ok: status >= 200 && status < 300,
    status: status,
    headers: {
      get(name) {
        const found = Object.keys(headers).find(function(key) { return key.toLowerCase() === String(name).toLowerCase(); });
        return found ? headers[found] : null;
      }
    },
    async json() { return body; }
  };
}

function installClock(target, startMs) {
  let current = startMs;
  const RealDate = Date;
  function FakeDate(...args) {
    if (!new.target) return RealDate(...args);
    if (args.length === 0) return new RealDate(current);
    return new RealDate(...args);
  }
  FakeDate.now = function() { return current; };
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  FakeDate.prototype = RealDate.prototype;
  target.Date = FakeDate;
  return {
    now() { return current; },
    advance(ms) { current += ms; }
  };
}

function element() {
  return {
    innerHTML: '',
    textContent: '',
    className: '',
    style: {},
    disabled: false,
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    setAttribute() {},
    appendChild() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

function extractScript(html) {
  const marker = html.indexOf('const WORKER_URL');
  const scriptStart = html.lastIndexOf('<script>', marker);
  const scriptEnd = html.indexOf('</script>', marker);
  return { code: html.slice(scriptStart + '<script>'.length, scriptEnd), scriptStart: scriptStart };
}

const pages = {
  QA: {
    file: 'daily-qa.html',
    fn: 'generateQA',
    newKey: 'marg_daily_qa_v2_',
    oldKey: 'marg_daily_qa_',
    retryKey: 'marg_daily_qa_retry_after',
    note: QA_NOTE,
    validItem: {
      difficulty: 'Medium to Hard',
      questions: [
        { q: 'A two-digit number is four times the sum of its digits. Reversing its digits increases the number by 18. What is the number?', topics: ['Number Systems'], options: ['A. 24', 'B. 36', 'C. 42', 'D. 48'], correct: 0, solution: 'Let the digits be a and b. Then 10a + b = 4(a + b), so b = 2a. Also, 9(b - a) = 18, giving a = 2 and b = 4. The number is 24.', common_mistake: 'Using the reversal condition without the digit-sum condition.', concept_check: 'Digit equations' },
        { q: 'A rectangle has positive integer side lengths and perimeter 34. Its area is at least 60 but less than 72. How many distinct unordered pairs of side lengths are possible?', topics: ['Geometry', 'Number Systems'], options: ['A. 2', 'B. 3', 'C. 4', 'D. 5'], correct: 1, solution: 'For sides a less than or equal to b, a + b = 17. The stated area condition holds for a = 5, 6 and 7 only. Hence there are 3 pairs.', common_mistake: 'Including 8 x 9 even though the upper bound is strict.', concept_check: 'Integer cases and inequalities' }
      ]
    },
    model(item) { return { content: [{ text: JSON.stringify(item) }] }; },
    empty() { return { content: [{ text: '' }] }; },
    notJson() { return { content: [{ text: 'this is not json' }] }; },
    invalid() { return { content: [{ text: JSON.stringify({ questions: [] }) }] }; },
    select(ctx) { ctx.selectOption(0, 0, 0); },
    pending(parsed, item) {
      return parsed && parsed.type === 'qa' && parsed.topics === item.questions[0].topics.join(' + ') && parsed.commonMistake === item.questions[0].common_mistake;
    }
  },
  RC: {
    file: 'daily-rc.html',
    fn: 'generateRC',
    newKey: 'marg_daily_rc_v3_',
    oldKey: 'marg_daily_rc_v2_',
    retryKey: 'marg_daily_rc_retry_after',
    note: RC_NOTE,
    validItem: null,
    model(item) {
      return { candidates: [{ content: { parts: [{ text: JSON.stringify(item) }] } }] };
    },
    empty() { return { candidates: [{ content: { parts: [{ text: '' }] } }] }; },
    notJson() { return { candidates: [{ content: { parts: [{ text: 'this is not json' }] } }] }; },
    invalid() { return { candidates: [{ content: { parts: [{ text: JSON.stringify({ passage: 'too short', questions: [] }) }] } }] }; },
    select(ctx) { ctx.selectOption(0, 0, 1); },
    pending(parsed, item) {
      return parsed && parsed.type === 'rc' && parsed.topic === item.topic && parsed.trapType === item.questions[0].trap_type;
    }
  }
};

function rcItem() {
  function paragraph(seed, count) {
    const words = [];
    for (let i = 0; i < count; i++) words.push(seed + i);
    return words.join(' ');
  }
  return {
    passage: [paragraph('alpha', 120), paragraph('beta', 120), paragraph('gamma', 120), paragraph('delta', 120)].join('\n\n'),
    difficulty: 'Hard',
    topic: 'Measurement and institutions',
    questions: [0, 1, 2].map(function(index) {
      return {
        q: 'Which option best captures purpose number ' + (index + 1) + ' of this passage?',
        options: ['A. First distinct reading ' + index, 'B. Second distinct reading ' + index, 'C. Third distinct reading ' + index, 'D. Fourth distinct reading ' + index],
        correct: 1,
        explanation: 'The passage supports this reading through its central institutional claim.',
        trap_type: 'Scope shift ' + index
      };
    })
  };
}
pages.RC.validItem = rcItem();

function loadPage(kind, options) {
  const spec = pages[kind];
  const html = fs.readFileSync(path.join(root, spec.file), 'utf8');
  const extracted = extractScript(html);
  let code = extracted.code;
  if (!options.auto) code = code.replace(new RegExp('\\n' + spec.fn + '\\(\\);\\s*$'), '\n');
  const storage = memoryStorage();
  const sessions = memoryStorage();
  if (options.storageThrows) storage.throwReads(true);
  if (options.sessionThrows) sessions.throwWrites(true);
  const listeners = [];
  const intervals = [];
  const calls = [];
  const sandbox = {
    console: { error() {}, log() {} },
    setTimeout: options.manualTimers ? function(fn) { sandbox.__timers.push(fn); return sandbox.__timers.length; } : setTimeout,
    clearTimeout: options.manualTimers ? function(id) { sandbox.__timers[id - 1] = null; } : clearTimeout,
    setInterval: function() { intervals.push(arguments); return 0; },
    clearInterval: function() {},
    AbortController: AbortController,
    Math: Math,
    JSON: JSON,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Error: Error,
    TypeError: TypeError,
    SyntaxError: SyntaxError,
    Promise: Promise,
    RegExp: RegExp,
    Set: Set,
    Map: Map,
    parseInt: parseInt,
    decodeURIComponent: decodeURIComponent,
    encodeURIComponent: encodeURIComponent,
    document: {
      getElementById(id) {
        if (!sandbox.__elements.has(id)) sandbox.__elements.set(id, element());
        return sandbox.__elements.get(id);
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() { return element(); },
      addEventListener(type) { listeners.push('document:' + type); }
    },
    location: { href: 'http://127.0.0.1/', replace() {}, reload() { sandbox.__reloads += 1; } },
    localStorage: storage,
    sessionStorage: sessions,
    addEventListener(type) { listeners.push('window:' + type); },
    fetch: async function(url, init) {
      calls.push({ url: String(url), options: init || {} });
      if (String(url) !== WORKER_URL && !(options.allowWorker && String(url) === WORKER_URL)) throw new Error('unexpected fetch ' + url);
      if (!options.allowWorker && String(url) === WORKER_URL && !options.fetchImpl) throw new Error('real worker blocked');
      return options.fetchImpl(url, init, calls);
    },
    __elements: new Map(),
    __timers: [],
    __reloads: 0
  };
  sandbox.window = sandbox;
  const clock = installClock(sandbox, options.now || Date.UTC(2026, 9, 30, 8, 0, 0));
  vm.createContext(sandbox);
  let bootError = null;
  if (options.helper !== false) {
    try { vm.runInContext(sessionSource, sandbox, { filename: 'marg-session.js' }); }
    catch (error) { bootError = error; }
  }
  if (options.before) options.before(storage, sessions, clock);
  try { vm.runInContext(code, sandbox, { filename: spec.file }); }
  catch (error) { bootError = error; }
  return { spec: spec, html: html, scriptStart: extracted.scriptStart, sandbox: sandbox, storage: storage, sessions: sessions, calls: calls, listeners: listeners, intervals: intervals, clock: clock, bootError: bootError };
}

async function flush() {
  for (let i = 0; i < 12; i++) await new Promise(function(resolve) { setTimeout(resolve, 0); });
}

function containerText(page) {
  return page.sandbox.document.getElementById('practice-container').innerHTML;
}

function headerMap(call) {
  return call && call.options && call.options.headers || {};
}

function customHeaderNames(headers) {
  return Object.keys(headers).filter(function(name) {
    const lower = name.toLowerCase();
    return lower !== 'content-type' && lower !== 'authorization';
  });
}

function dayKey(page) {
  return new Date(page.clock.now()).toISOString().split('T')[0];
}

function signIn(storage, clock, token) {
  storage.seed('marg_token', token || 'token-abc');
  storage.seed('marg_token_expiry', String(clock.now() + 10 * 60 * 1000));
  storage.seed('marg_refresh_token', 'refresh-keep');
  storage.seed('marg_user', '{"id":"student"}');
}

async function drive(kind, options) {
  const deferred = [];
  const scripted = (options.responses || []).slice();
  const page = loadPage(kind, Object.assign({}, options, {
    fetchImpl: options.fetchImpl || async function() {
      if (options.hang) return new Promise(function(resolve, reject) { deferred.push({ resolve: resolve, reject: reject }); });
      const next = scripted.shift();
      if (next instanceof Error) throw next;
      if (!next) throw new Error('no scripted response');
      return next;
    }
  }));
  await flush();
  return Object.assign(page, { deferred: deferred, release: async function(value) { const item = deferred.shift(); item.resolve(value); await flush(); } });
}

function quoted(source, key) {
  return source.includes("'" + key + "'") || source.includes('"' + key + '"');
}

async function runUnit() {
  const now = 1_700_000_000_000;
  const store = function(token, expiry) {
    return { getItem(key) { if (key === 'marg_token') return token; if (key === 'marg_token_expiry') return expiry; return null; }, setItem() { throw new Error('write'); }, removeItem() { throw new Error('write'); } };
  };
  check('U1 no token -> signed_out', MargSession.getMargAccessToken(store(null, null), now).reason === 'signed_out' && MargSession.getMargAccessToken(store('', null), now).reason === 'signed_out');
  const future = MargSession.getMargAccessToken(store('token-abc', String(now + 120000)), now);
  check('U2 stored future expiry -> ok', future.reason === 'ok' && future.token === 'token-abc');
  check('U3 stored past expiry -> expired', MargSession.getMargAccessToken(store('token-abc', String(now - 1000)), now).reason === 'expired');
  check('U4 expiry inside 60s margin -> expired', MargSession.getMargAccessToken(store('token-abc', String(now + 30000)), now).reason === 'expired');
  check('U5 JWT exp in the past -> expired', MargSession.getMargAccessToken(store(makeJwt(Math.floor(now / 1000) - 120), null), now).reason === 'expired');
  const jwtOk = MargSession.getMargAccessToken(store(makeJwt(Math.floor(now / 1000) + 3600), null), now);
  check('U6 JWT exp in the future -> ok', jwtOk.reason === 'ok' && jwtOk.token.split('.').length === 3);
  check('U7 malformed JWT -> ok', MargSession.getMargAccessToken(store('not-a-jwt', ''), now).reason === 'ok' && MargSession.getMargAccessToken(store('a.@@@.c', null), now).reason === 'ok');
  check('U8 storage read throws -> signed_out', MargSession.getMargAccessToken({ getItem() { throw new Error('blocked'); } }, now).reason === 'signed_out');
  let fetches = 0;
  let writes = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function() { fetches += 1; throw new Error('network'); };
  const spy = {
    getItem() { return 'token-abc'; },
    setItem() { writes += 1; },
    removeItem() { writes += 1; }
  };
  MargSession.getMargAccessToken(spy, now);
  globalThis.fetch = originalFetch;
  check('U9 module does not call fetch or storage writes', fetches === 0 && writes === 0);
  const banned = ['setItem', 'removeItem', 'fetch', 'XMLHttpRequest', 'marg_refresh_token'];
  check('U10 marg-session.js has no forbidden tokens', banned.every(function(token) { return !sessionSource.includes(token); }));
}

async function runPages() {
  for (const kind of ['QA', 'RC']) {
    const spec = pages[kind];
    const token = 'token-abc';
    const valid = httpResult(200, spec.model(spec.validItem));

    const signed = await drive(kind, {
      auto: true,
      responses: [valid],
      before(storage, sessions, clock) { signIn(storage, clock, token); }
    });
    const headers = headerMap(signed.calls[0]);
    const names = Object.keys(headers).map(function(name) { return name.toLowerCase(); });
    check(kind + ' P1 one authorized request', signed.calls.length === 1 && headers.Authorization === 'Bearer ' + token && headers['Content-Type'] === 'application/json' && !names.some(function(name) { return name === 'x-marg-client-id'; }) && customHeaderNames(headers).length === 0 && String(signed.calls[0].url) === WORKER_URL);
    const body = JSON.parse(signed.calls[0].options.body);
    check(kind + ' P1 keeps the original request budget', kind === 'QA' ? body.max_tokens === 8192 && Array.isArray(body.messages) : body.generationConfig.maxOutputTokens === 8192 && body.generationConfig.thinkingConfig.thinkingLevel === 'minimal' && body.generationConfig.responseMimeType === 'application/json');

    const signedOut = await drive(kind, { auto: true, responses: [valid] });
    check(kind + ' P2 signed out makes no request and writes nothing', signedOut.calls.length === 0 && containerText(signedOut).includes('Sign in to use Daily Practice') && containerText(signedOut).includes('Daily Practice is for registered Marg students.') && containerText(signedOut).includes('Sign in with Marg') && signedOut.storage.writes.length === 0 && signedOut.sessions.writes.length === 0);

    const cached = await drive(kind, {
      auto: true,
      responses: [valid],
      before(storage, sessions, clock) {
        storage.seed(spec.newKey + new Date(clock.now()).toISOString().split('T')[0], JSON.stringify(spec.validItem));
      }
    });
    check(kind + ' P3 cached item renders without a request', cached.calls.length === 0 && containerText(cached).includes(spec.validItem.questions ? spec.validItem.questions[0].q.slice(0, 24) : spec.validItem.topic));

    const expired = await drive(kind, {
      auto: true,
      responses: [valid],
      before(storage, sessions, clock) {
        storage.seed('marg_token', token);
        storage.seed('marg_refresh_token', 'refresh-keep');
        storage.seed('marg_token_expiry', String(clock.now() - 1000));
      }
    });
    const expiredDump = expired.storage.dump();
    check(kind + ' P4 expired session makes no request and keeps the stored session', expired.calls.length === 0 && containerText(expired).includes('Your session has timed out') && expiredDump.marg_token === token && expiredDump.marg_refresh_token === 'refresh-keep' && Number(expiredDump.marg_token_expiry) < expired.clock.now());

    for (const status of [401, 403]) {
      const before = { marg_token: token };
      const denied = await drive(kind, {
        auto: true,
        responses: [httpResult(status, { error: { status: 'CLIENT_ID_REQUIRED' } })],
        before(storage, sessions, clock) {
          signIn(storage, clock, token);
          before.marg_token = storage.dump().marg_token;
          before.marg_refresh_token = storage.dump().marg_refresh_token;
          before.marg_token_expiry = storage.dump().marg_token_expiry;
          before.marg_user = storage.dump().marg_user;
        }
      });
      const after = denied.storage.dump();
      check(kind + ' P' + (status === 401 ? '5' : '6') + ' HTTP ' + status + ' is not cached', containerText(denied).includes('Your session was not accepted') && !after[spec.newKey + dayKey(denied)] && !denied.sessions.dump()[spec.retryKey] && after.marg_token === before.marg_token && after.marg_refresh_token === before.marg_refresh_token && after.marg_token_expiry === before.marg_token_expiry && after.marg_user === before.marg_user);
    }

    const limited = await drive(kind, {
      auto: true,
      responses: [httpResult(429, { error: { status: 'RATE_LIMITED' } }, { 'Retry-After': '30' }), valid],
      before(storage, sessions, clock) { signIn(storage, clock, token); }
    });
    const retryAt = Number(limited.sessions.dump()[spec.retryKey]);
    check(kind + ' P7 Retry-After 30 sets a 30s cooldown', containerText(limited).includes('Too many requests') && containerText(limited).includes('Wait a minute and try again.') && !limited.storage.dump()[spec.newKey + dayKey(limited)] && retryAt === limited.clock.now() + 30000);
    const callsAfterLimit = limited.calls.length;
    await limited.sandbox[spec.fn]();
    await flush();
    check(kind + ' P7 cooldown blocks the next attempt', limited.calls.length === callsAfterLimit && /Please wait 30 more seconds before trying again\./.test(containerText(limited)));
    limited.clock.advance(30000);
    await limited.sandbox[spec.fn]();
    await flush();
    check(kind + ' P7 attempt after 30s makes one request', limited.calls.length === callsAfterLimit + 1);

    for (const variant of [
      { headers: {}, seconds: 60, label: 'missing Retry-After' },
      { headers: { 'Retry-After': '9999' }, seconds: 120, label: 'Retry-After 9999' },
      { headers: { 'Retry-After': 'abc' }, seconds: 60, label: 'Retry-After abc' }
    ]) {
      const rate = await drive(kind, {
        auto: true,
        responses: [httpResult(429, {}, variant.headers)],
        before(storage, sessions, clock) { signIn(storage, clock, token); }
      });
      check(kind + ' P7 ' + variant.label + ' cooldown', Number(rate.sessions.dump()[spec.retryKey]) === rate.clock.now() + variant.seconds * 1000 && !rate.storage.dump()[spec.newKey + dayKey(rate)]);
    }

    const failures = [
      { label: 'TypeError', make: function() { return new TypeError('Failed to fetch'); } },
      { label: 'AbortError', make: function() { const error = new Error('aborted'); error.name = 'AbortError'; return error; } },
      { label: 'HTTP 500', make: function() { return httpResult(500, { error: { status: 'SERVER' } }); } },
      { label: 'HTTP 503', make: function() { return httpResult(503, { error: { status: 'UNAVAILABLE' } }); } }
    ];
    for (const failure of failures) {
      const made = failure.make();
      const failed = await drive(kind, {
        auto: true,
        responses: [made],
        fetchImpl: made instanceof Error ? async function() { throw made; } : undefined,
        before(storage, sessions, clock) { signIn(storage, clock, token); }
      });
      check(kind + ' P8 ' + failure.label + ' is transient and not cached', containerText(failed).includes('Could not prepare today') && containerText(failed).includes('Check your connection and try again.') && !failed.storage.dump()[spec.newKey + dayKey(failed)] && Number(failed.sessions.dump()[spec.retryKey]) === failed.clock.now() + 15000);
    }

    const success = await drive(kind, {
      auto: true,
      responses: [valid],
      before(storage, sessions, clock) {
        signIn(storage, clock, token);
        sessions.seed(spec.retryKey, String(clock.now() - 1000));
      }
    });
    const saved = success.storage.dump()[spec.newKey + dayKey(success)];
    check(kind + ' P9 valid draft is cached without the recovery note', containerText(success).includes(kind === 'QA' ? spec.validItem.questions[0].q.slice(0, 40) : spec.validItem.topic) && !containerText(success).includes('hand-checked') && saved && !JSON.parse(saved).recoveryNote && !success.sessions.dump()[spec.retryKey]);

    const invalids = [
      { label: 'empty model text', body: spec.empty() },
      { label: 'model text is not JSON', body: spec.notJson() },
      { label: 'validator rejects the draft', body: spec.invalid() }
    ];
    for (const invalid of invalids) {
      const bad = await drive(kind, {
        auto: true,
        responses: [httpResult(200, invalid.body)],
        before(storage, sessions, clock) { signIn(storage, clock, token); }
      });
      const cachedFallback = bad.storage.dump()[spec.newKey + dayKey(bad)];
      check(kind + ' P10 ' + invalid.label + ' uses the hand-checked fallback', containerText(bad).includes(spec.note) && cachedFallback && JSON.parse(cachedFallback).recoveryNote === spec.note);
    }

    const broken = await drive(kind, {
      auto: true,
      responses: [{ ok: true, status: 200, headers: { get() { return null; } }, async json() { throw new SyntaxError('not json'); } }],
      before(storage, sessions, clock) { signIn(storage, clock, token); }
    });
    check(kind + ' P11 non-JSON response body is transient', containerText(broken).includes('Could not prepare today') && !broken.storage.dump()[spec.newKey + dayKey(broken)] && Number(broken.sessions.dump()[spec.retryKey]) === broken.clock.now() + 15000);

    const stale = await drive(kind, {
      auto: true,
      responses: [httpResult(500, {})],
      before(storage, sessions, clock) {
        signIn(storage, clock, token);
        storage.seed(spec.oldKey + new Date(clock.now()).toISOString().split('T')[0], JSON.stringify(spec.validItem));
      }
    });
    check(kind + ' P12 old cache key does not suppress generation', stale.calls.length === 1 && !containerText(stale).includes('hand-checked'));

    let pendingCalls = 0;
    let releasePending = null;
    const duplicate = loadPage(kind, {
      auto: false,
      before(storage, sessions, clock) { signIn(storage, clock, token); },
      fetchImpl: function() {
        pendingCalls += 1;
        return new Promise(function(resolve) { releasePending = resolve; });
      }
    });
    const first = duplicate.sandbox[spec.fn]();
    const second = duplicate.sandbox[spec.fn]();
    check(kind + ' P13 two calls in one tick make one request', pendingCalls === 1);
    await Promise.resolve();
    const third = duplicate.sandbox[spec.fn]();
    check(kind + ' P13 a pending call makes no extra request', pendingCalls === 1);
    releasePending(valid);
    await first; await second; await third; await flush();
    const afterSuccess = pendingCalls;
    await duplicate.sandbox[spec.fn]();
    await flush();
    check(kind + ' P13 a cached success makes no further request', pendingCalls === afterSuccess);
    duplicate.storage.writes.length = 0;
    duplicate.storage.dump();
    const cacheKey = spec.newKey + dayKey(duplicate);
    duplicate.storage.removeItem(cacheKey);
    duplicate.sessions.seed(spec.retryKey, String(duplicate.clock.now() - 1));
    pendingCalls = 0;
    releasePending = null;
    const retryFetch = duplicate.sandbox.fetch;
    duplicate.sandbox.fetch = async function() {
      pendingCalls += 1;
      return httpResult(500, {});
    };
    await duplicate.sandbox[spec.fn]();
    await flush();
    check(kind + ' P13 a failure records one request and a cooldown', pendingCalls === 1 && Number(duplicate.sessions.dump()[spec.retryKey]) === duplicate.clock.now() + 15000);
    duplicate.clock.advance(15000);
    duplicate.sandbox.fetch = async function() {
      pendingCalls += 1;
      return valid;
    };
    await duplicate.sandbox[spec.fn]();
    await flush();
    check(kind + ' P13 after the cooldown one request is made', pendingCalls === 2);
    void retryFetch;

    const loaded = await drive(kind, {
      auto: true,
      responses: [valid],
      before(storage, sessions, clock) { signIn(storage, clock, token); }
    });
    const quiet = await drive(kind, { auto: true, responses: [valid] });
    check(kind + ' P14 page load attempts generation once', loaded.calls.length === 1 && quiet.calls.length === 0 && loaded.intervals.length === 0 && quiet.intervals.length === 0 && !loaded.listeners.some(function(name) { return /visibilitychange|pageshow|online/.test(name); }));

    const missing = await drive(kind, { auto: true, helper: false, responses: [valid] });
    check(kind + ' P15 missing helper shows the session-check panel', !missing.bootError && missing.calls.length === 0 && containerText(missing).includes('Could not check your sign-in') && containerText(missing).includes('Reload'));

    const handoff = success;
    const readCount = handoff.storage.reads.length;
    handoff.spec.select(handoff.sandbox);
    const during = handoff.storage.reads.slice(readCount);
    const fullNew = spec.newKey + dayKey(handoff);
    const fullOld = spec.oldKey + dayKey(handoff);
    const pending = JSON.parse(handoff.storage.dump().marg_pending_attempt || 'null');
    check(kind + ' P16 selectOption reads the new cache and keeps topic data', spec.pending(pending, spec.validItem) && during.includes(fullNew) && !during.includes(fullOld));

    const source = fs.readFileSync(path.join(root, spec.file), 'utf8');
    const marker = source.indexOf('const WORKER_URL');
    check(kind + ' P17 static auth and cache contract', source.indexOf('/marg-session.js') !== -1 && source.indexOf('/marg-session.js') < marker && !source.includes('X-Marg-Client-Id') && source.includes('Authorization') && quoted(source, spec.newKey) && !quoted(source, spec.oldKey));
  }
}

async function runWorker() {
  const dest = path.join(os.tmpdir(), 'marg-worker-b2-' + process.pid + '.mjs');
  fs.copyFileSync(path.join(root, 'cloudflare-worker.js'), dest);
  const worker = await import(pathToFileURL(dest).href);
  const token = 'test-access-token';
  let geminiCalls = 0;
  let workerCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function(url, init) {
    const target = String(url);
    const headers = init && init.headers || {};
    if (target.includes('/auth/v1/user')) {
      if (headers.Authorization === 'Bearer ' + token) return new Response(JSON.stringify({ id: 'test-user' }), { status: 200 });
      return new Response('{}', { status: 401 });
    }
    if (target.includes('generateContent')) {
      geminiCalls += 1;
      const canned = globalThis.__margCannedText;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: canned }] }, finishReason: 'STOP' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error('unexpected upstream ' + target);
  };
  const ledger = worker.createMemoryUsageLedger();
  const workerEnv = { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_USAGE_LEDGER_MEMORY: ledger, MARG_USER_REQUESTS_PER_MINUTE: '1000', MARG_IP_REQUESTS_PER_MINUTE: '1000' };
  const negative = await worker.default.fetch(new Request(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_tokens: 8192, system: 'You are an expert CAT exam question generator. Generate only valid JSON with no markdown.', messages: [{ role: 'user', content: 'Generate questions' }] })
  }), workerEnv);
  const negativeBody = await negative.json();
  check('E1 old request shape is 401 CLIENT_ID_REQUIRED and does not call Gemini', negative.status === 401 && negativeBody.error && negativeBody.error.status === 'CLIENT_ID_REQUIRED' && geminiCalls === 0);

  globalThis.__margCannedText = JSON.stringify(pages.QA.validItem);
  const qa = await drive('QA', {
    auto: true,
    allowWorker: true,
    before(storage, sessions, clock) {
      storage.seed('marg_token', token);
      storage.seed('marg_token_expiry', String(clock.now() + 10 * 60 * 1000));
    },
    fetchImpl: async function(url, init) {
      if (String(url) !== WORKER_URL) throw new Error('unexpected ' + url);
      workerCalls += 1;
      return worker.default.fetch(new Request(String(url), { method: 'POST', headers: init.headers, body: init.body }), workerEnv);
    }
  });
  check('E2 QA renders the generated draft and does not show the fallback note', workerCalls === 1 && containerText(qa).includes(pages.QA.validItem.questions[0].q.slice(0, 40)) && !containerText(qa).includes('hand-checked') && qa.storage.dump()[pages.QA.newKey + dayKey(qa)]);

  globalThis.__margCannedText = JSON.stringify(pages.RC.validItem);
  const beforeRc = workerCalls;
  const rc = await drive('RC', {
    auto: true,
    allowWorker: true,
    before(storage, sessions, clock) {
      storage.seed('marg_token', token);
      storage.seed('marg_token_expiry', String(clock.now() + 10 * 60 * 1000));
    },
    fetchImpl: async function(url, init) {
      if (String(url) !== WORKER_URL) throw new Error('unexpected ' + url);
      workerCalls += 1;
      return worker.default.fetch(new Request(String(url), { method: 'POST', headers: init.headers, body: init.body }), workerEnv);
    }
  });
  check('E3 RC renders the generated draft and does not show the fallback note', workerCalls === beforeRc + 1 && containerText(rc).includes(pages.RC.validItem.topic) && !containerText(rc).includes('hand-checked') && rc.storage.dump()[pages.RC.newKey + dayKey(rc)]);

  const signedOutCalls = workerCalls;
  const guest = await drive('QA', {
    auto: true,
    allowWorker: true,
    fetchImpl: async function() { workerCalls += 1; throw new Error('worker should not be called'); }
  });
  const expired = await drive('RC', {
    auto: true,
    allowWorker: true,
    before(storage, sessions, clock) {
      storage.seed('marg_token', token);
      storage.seed('marg_token_expiry', String(clock.now() - 5000));
    },
    fetchImpl: async function() { workerCalls += 1; throw new Error('worker should not be called'); }
  });
  check('E4 signed-out and expired states do not invoke the Worker', workerCalls === signedOutCalls && guest.calls.length === 0 && expired.calls.length === 0 && containerText(guest).includes('Sign in to use Daily Practice') && containerText(expired).includes('Your session has timed out'));
  globalThis.fetch = originalFetch;
  delete globalThis.__margCannedText;
  fs.unlinkSync(dest);
}

const unhandled = [];
process.on('unhandledRejection', function(error) { unhandled.push(error); });
await runUnit();
await runPages();
await runWorker();
await flush();
if (unhandled.length) check('no unhandled rejections', false);
const failed = checks.filter(function(item) { return !item[1]; }).length;
console.log(failed ? (checks.length - failed) + '/' + checks.length + ' daily practice checks passed.' : checks.length + '/' + checks.length + ' daily practice checks passed.');
process.exit(failed ? 1 : 0);
