import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = '/workspace';
const MAX_REQUEST_BYTES = 20 * 1024 * 1024;
const GOOD_AUTH = 'Bearer good-token';
const SOURCE = readFileSync(join(ROOT, 'cloudflare-worker.js'), 'utf8');
const BASELINE_SOURCE = execFileSync('git', ['show', 'main:cloudflare-worker.js'], { cwd: ROOT, encoding: 'utf8' });

let failed = 0;
let ipCounter = 1;
const geminiBodies = [];
let otherFetches = 0;
let supabaseMode = 'ok';
let parses = 0;
const originalParse = JSON.parse;
const logs = [];
const errors = [];
const originalLog = console.log;
const originalError = console.error;

console.log = function () {
  logs.push(Array.from(arguments).map(String).join(' '));
  return originalLog.apply(console, arguments);
};
console.error = function () {
  errors.push(Array.from(arguments).map(String).join(' '));
  return originalError.apply(console, arguments);
};

JSON.parse = function (text) {
  parses += 1;
  return originalParse.apply(JSON, arguments);
};

function nextIp() {
  ipCounter += 1;
  return '203.0.113.' + String(ipCounter);
}

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

globalThis.fetch = async function (url, options) {
  const target = String(url);
  if (target.includes('/auth/v1/user')) {
    if (supabaseMode === 'throw') throw new Error('supabase unreachable');
    if (supabaseMode === '500') return stubResponse(500, { error: 'unavailable' });
    const authorization = headerValue(options && options.headers, 'Authorization');
    if (authorization === GOOD_AUTH) return stubResponse(200, { id: 'user-1' });
    if (authorization === 'Bearer SENTINEL_BEARER_TOKEN') return stubResponse(200, { id: 'SENTINEL_USER' });
    return stubResponse(401, { message: 'invalid' });
  }
  if (target.includes(':generateContent')) {
    const body = originalParse(options.body);
    geminiBodies.push(body);
    return stubResponse(200, {
      candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4, thoughtsTokenCount: 1, totalTokenCount: 8, cachedContentTokenCount: 0 }
    });
  }
  otherFetches += 1;
  throw new Error('unexpected upstream ' + target);
};

function loadSource(source, label) {
  const directory = mkdtempSync(join(tmpdir(), 'marg-b3-'));
  const file = join(directory, label + '.mjs');
  writeFileSync(file, source);
  return import(pathToFileURL(file).href);
}

const baselineModule = await loadSource(BASELINE_SOURCE, 'baseline');
const workerModule = await loadSource(SOURCE, 'worker');
const seamSource = SOURCE
  .replace('function beforeUpstream(ctx) {}', 'function beforeUpstream(ctx) { globalThis.__b3Before.push(ctx); }')
  .replace('function afterUpstream(ctx, result) {}', 'function afterUpstream(ctx, result) { globalThis.__b3After.push(result); }');
const seamModule = await loadSource(seamSource, 'seams');
globalThis.__b3Before = [];
globalThis.__b3After = [];

function resetNetwork() {
  geminiBodies.length = 0;
  otherFetches = 0;
  supabaseMode = 'ok';
}

async function check(name, fn) {
  try {
    const ok = await fn();
    originalLog((ok ? 'PASS' : 'FAIL') + ' ' + name);
    if (!ok) failed += 1;
  } catch (error) {
    originalLog('FAIL ' + name + ' ' + (error && error.stack || error));
    failed += 1;
  }
}

function post(module, payload, env, headers, bodyText) {
  const ip = headers && headers['CF-Connecting-IP'] || nextIp();
  const requestHeaders = Object.assign({
    'Content-Type': 'application/json',
    'X-Marg-Client-Id': 'client-a',
    'CF-Connecting-IP': ip
  }, headers || {});
  if (requestHeaders['X-Marg-Client-Id'] === undefined) delete requestHeaders['X-Marg-Client-Id'];
  return module.default.fetch(new Request('https://worker.test/', {
    method: 'POST',
    headers: requestHeaders,
    body: bodyText == null ? JSON.stringify(payload) : bodyText
  }), env || { GEMINI_API_KEY: 'TEST_NOT_REAL' });
}

function dangerousPayload() {
  return {
    contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    safetySettings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }],
    tools: [{ code_execution: {} }, { url_context: {} }, { google_search: {} }],
    toolConfig: { functionCallingConfig: { mode: 'ANY' } },
    cachedContent: 'cachedContents/secret',
    generationConfig: {
      maxOutputTokens: 1024,
      candidateCount: 8,
      temperature: 0,
      responseModalities: ['TEXT', 'IMAGE'],
      thinkingConfig: { thinkingBudget: 1024, includeThoughts: true, thinkingLevel: 'low' }
    }
  };
}

function leakNames(body) {
  const text = JSON.stringify(body);
  return ['safetySettings', 'code_execution', 'url_context', 'toolConfig', 'cachedContent', 'candidateCount', 'thinkingBudget', 'includeThoughts', 'responseModalities', '"temperature"'].filter((name) => text.includes(name));
}

function chat(text, tokens, level) {
  return {
    contents: [{ role: 'user', parts: [{ text: text || 'How should I start QA?' }] }],
    systemInstruction: { parts: [{ text: 'You are Marg, a CAT mentor.' }] },
    generationConfig: { maxOutputTokens: tokens || 2048, thinkingConfig: { thinkingLevel: level || 'minimal' } }
  };
}

function images(count, tokens, level) {
  const parts = [];
  for (let index = 0; index < count; index += 1) parts.push({ inlineData: { mimeType: 'image/jpeg', data: 'aaaa' } });
  parts.push({ text: 'Read these pages in order.' });
  return {
    contents: [{ role: 'user', parts: parts }],
    systemInstruction: { parts: [{ text: 'You extract CAT book question numbers from photographed pages.' }] },
    generationConfig: { maxOutputTokens: tokens || 4096, thinkingConfig: { thinkingLevel: level || 'low' } }
  };
}

const corpus = {
  mentor: {
    contents: [
      { role: 'user', parts: [{ text: 'I am weak at QA.' }] },
      { role: 'model', parts: [{ text: 'We will start from ratios.' }] },
      { role: 'user', parts: [{ text: 'How should I start QA practice?' }] }
    ],
    systemInstruction: { parts: [{ text: 'You are Marg, a CAT mentor.' }] },
    generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: 'minimal' } }
  },
  structured: {
    contents: [{ role: 'user', parts: [{ text: 'Write two original QA questions.' }] }],
    systemInstruction: { parts: [{ text: 'You are an expert CAT question setter. Return only valid JSON.' }] },
    generationConfig: {
      maxOutputTokens: 16384,
      thinkingConfig: { thinkingLevel: 'low' },
      responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object', properties: { questions: { type: 'array', items: { type: 'object', properties: { q: { type: 'string', minLength: 1 } } } } }, required: ['questions'] }
    }
  },
  vision1: images(1, 4096, 'low'),
  vision4: images(4, 8192, 'minimal'),
  grounded: {
    contents: [{ role: 'user', parts: [{ text: 'What is the current CAT registration fee?' }] }],
    systemInstruction: { parts: [{ text: 'You are Marg, a CAT mentor.' }] },
    generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: 'medium' } },
    margWebGrounding: true
  },
  dailyQa: {
    max_tokens: 8192,
    system: 'You are an expert CAT exam question generator. Generate only valid JSON with no markdown.',
    messages: [{ role: 'user', content: 'Generate 2 genuine CAT-level Quantitative Aptitude questions. Return ONLY valid JSON.' }]
  },
  dailyRc: {
    contents: [{ role: 'user', parts: [{ text: 'Generate one original CAT-level Reading Comprehension passage with exactly 3 questions. Return ONLY valid JSON.' }] }],
    systemInstruction: { parts: [{ text: 'You are an expert CAT exam question generator. Generate only valid JSON with no markdown, no backticks, no extra text.' }] },
    generationConfig: {
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingLevel: 'minimal' }
    }
  },
  article: { margAction: 'daily_article', topic: 'economy', offset: 0 }
};

function deepEqual(left, right) {
  return JSON.stringify(sortValue(left)) === JSON.stringify(sortValue(right));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  const sorted = {};
  Object.keys(value).sort().forEach((key) => { sorted[key] = sortValue(value[key]); });
  return sorted;
}

function responseShape(body) {
  if (!body || typeof body !== 'object') return body;
  if (body.error) return { error: { code: body.error.code, status: body.error.status, retryable: body.error.retryable, message: body.error.message } };
  if (body.content) return { kind: 'compat', keys: Object.keys(body).sort(), text: body.content[0] && body.content[0].text, stop: body.stop_reason, prompt: body.usage_metadata && body.usage_metadata.promptTokenCount };
  if (body.article) return { kind: 'article', keys: Object.keys(body).sort(), title: body.article.title };
  return { kind: 'native', keys: Object.keys(body).sort(), prompt: body.usageMetadata && body.usageMetadata.promptTokenCount, calls: body.margRequest && body.margRequest.upstreamCalls };
}

async function callBoth(payload, headers) {
  resetNetwork();
  const before = geminiBodies.length;
  const baseResponse = await post(baselineModule, payload, { GEMINI_API_KEY: 'TEST_NOT_REAL' }, headers);
  const baseBody = await baseResponse.json();
  const baseGemini = geminiBodies.slice(before);
  resetNetwork();
  const nextResponse = await post(workerModule, payload, { GEMINI_API_KEY: 'TEST_NOT_REAL' }, headers);
  const nextBody = await nextResponse.json();
  const nextGemini = geminiBodies.slice();
  return { baseResponse, baseBody, baseGemini, nextResponse, nextBody, nextGemini };
}

await check('source has no import and keeps the allowed export form', async () => {
  const exportLines = SOURCE.split('\n').filter((line) => /^\s*export\b/.test(line));
  return !/^import\s/m.test(SOURCE) && exportLines.length === 2 && exportLines[0] === 'export { resolveMaxOutputTokens };' && exportLines[1] === 'export default {';
});

await check('W1 baseline still forwards safetySettings tools toolConfig cachedContent candidateCount thinkingBudget includeThoughts responseModalities temperature', async () => {
  resetNetwork();
  const response = await post(baselineModule, dangerousPayload(), null, { Authorization: GOOD_AUTH });
  const body = geminiBodies[0];
  return response.status === 200 && body && body.safetySettings && body.tools.some((tool) => tool.code_execution) && body.tools.some((tool) => tool.url_context) && body.toolConfig && body.cachedContent && body.generationConfig.candidateCount === 8 && body.generationConfig.thinkingConfig.thinkingBudget === 1024 && body.generationConfig.thinkingConfig.includeThoughts === true && body.generationConfig.responseModalities && body.generationConfig.temperature === 0;
});

await check('W1 baseline accepts 32768 on plain chat, 60 images, a 5 MB prompt, 4001 turns, and an invalid bearer as a guest', async () => {
  resetNetwork();
  const bigTokens = await post(baselineModule, { contents: [{ role: 'user', parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 32768 } }, null, { Authorization: GOOD_AUTH });
  const tokensOk = bigTokens.status === 200 && geminiBodies[0].generationConfig.maxOutputTokens === 32768;
  resetNetwork();
  const manyImages = await post(baselineModule, images(60, 1024, 'low'), null, { Authorization: GOOD_AUTH });
  const imagesOk = manyImages.status === 200 && JSON.stringify(geminiBodies[0]).split('inlineData').length - 1 === 60;
  resetNetwork();
  const huge = await post(baselineModule, chat('H'.repeat(5 * 1024 * 1024), 1024, 'minimal'), null, { Authorization: GOOD_AUTH });
  const hugeOk = huge.status === 200 && geminiBodies[0].contents[0].parts[0].text.length === 5 * 1024 * 1024;
  resetNetwork();
  const turns = [];
  for (let index = 0; index < 4001; index += 1) turns.push({ role: 'user', parts: [{ text: 't' }] });
  const history = await post(baselineModule, { contents: turns, generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: 'minimal' } } }, null, { Authorization: GOOD_AUTH });
  const historyOk = history.status === 200 && geminiBodies.length === 1;
  resetNetwork();
  const guest = await post(baselineModule, chat('hello', 1024, 'minimal'), null, { Authorization: 'Bearer not-a-student', 'X-Marg-Client-Id': 'invented-client' });
  return tokensOk && imagesOk && hugeOk && historyOk && guest.status === 200 && geminiBodies.length === 1;
});

await check('W2 dangerous fields never reach Gemini in off, log, or enforce', async () => {
  const modes = [{ MARG_WORKER_VALIDATION: 'off' }, { MARG_WORKER_VALIDATION: 'log' }, { MARG_WORKER_VALIDATION: 'enforce' }, {}];
  for (const mode of modes) {
    resetNetwork();
    const response = await post(workerModule, dangerousPayload(), Object.assign({ GEMINI_API_KEY: 'TEST_NOT_REAL' }, mode), { Authorization: GOOD_AUTH });
    if (response.status !== 200 || !geminiBodies[0] || leakNames(geminiBodies[0]).length) return false;
    if (geminiBodies[0].tools) return false;
  }
  resetNetwork();
  const groundedTools = Object.assign(dangerousPayload(), { margWebGrounding: true });
  const response = await post(workerModule, groundedTools, { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_WORKER_VALIDATION: 'off' }, { Authorization: GOOD_AUTH });
  const tools = geminiBodies[0] && geminiBodies[0].tools;
  return response.status === 200 && Array.isArray(tools) && tools.length === 1 && tools[0].google_search && !tools[0].code_execution && leakNames(geminiBodies[0]).length === 0;
});

await check('W2 enforce rejects 60 images, a 5 MB prompt, and 4001 turns before Gemini; log still sends them', async () => {
  resetNetwork();
  const logged = await post(workerModule, images(60, 1024, 'low'), { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_WORKER_VALIDATION: 'log' }, { Authorization: GOOD_AUTH });
  const loggedOk = logged.status === 200 && geminiBodies.length === 1;
  resetNetwork();
  const imagesResponse = await post(workerModule, images(60, 1024, 'low'), { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_WORKER_VALIDATION: 'enforce' }, { Authorization: GOOD_AUTH });
  const imagesBody = await imagesResponse.json();
  const imagesOk = imagesResponse.status === 400 && imagesBody.status === 'INVALID_REQUEST' && imagesBody.reasons.includes('IMAGE_COUNT') && geminiBodies.length === 0;
  resetNetwork();
  const hugeResponse = await post(workerModule, chat('H'.repeat(5 * 1024 * 1024), 1024, 'minimal'), { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_WORKER_VALIDATION: 'enforce' }, { Authorization: GOOD_AUTH });
  const hugeBody = await hugeResponse.json();
  const hugeOk = hugeResponse.status === 413 && hugeBody.status === 'PAYLOAD_TOO_LARGE' && hugeBody.reasons.includes('TEXT_TOO_LARGE') && geminiBodies.length === 0;
  resetNetwork();
  const turns = [];
  for (let index = 0; index < 4001; index += 1) turns.push({ role: 'user', parts: [{ text: 't' }] });
  const turnResponse = await post(workerModule, { contents: turns, generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: 'minimal' } } }, { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_WORKER_VALIDATION: 'enforce' }, { Authorization: GOOD_AUTH });
  const turnBody = await turnResponse.json();
  return loggedOk && imagesOk && hugeOk && turnResponse.status === 400 && turnBody.reasons.includes('TOO_MANY_TURNS') && geminiBodies.length === 0;
});

await check('W2 enforce clamps a plain-chat 32768 request to 16384 and log leaves the resolved value', async () => {
  resetNetwork();
  const logged = await post(workerModule, { contents: [{ role: 'user', parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 32768 } }, { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_WORKER_VALIDATION: 'log' }, { Authorization: GOOD_AUTH });
  const loggedTokens = geminiBodies[0] && geminiBodies[0].generationConfig.maxOutputTokens;
  const loggedLevel = geminiBodies[0] && geminiBodies[0].generationConfig.thinkingConfig.thinkingLevel;
  resetNetwork();
  const enforced = await post(workerModule, { contents: [{ role: 'user', parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 32768 } }, { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_WORKER_VALIDATION: 'enforce' }, { Authorization: GOOD_AUTH });
  const enforcedTokens = geminiBodies[0] && geminiBodies[0].generationConfig.maxOutputTokens;
  return logged.status === 200 && loggedTokens === 32768 && loggedLevel === 'low' && enforced.status === 200 && enforcedTokens === 16384;
});

await check('W3 legitimate inventory payloads match baseline upstream bodies and response shapes', async () => {
  const rows = ['mentor', 'structured', 'vision1', 'vision4', 'grounded', 'dailyQa', 'dailyRc', 'article'];
  for (const row of rows) {
    const result = await callBoth(corpus[row], { Authorization: GOOD_AUTH });
    if (result.baseResponse.status !== result.nextResponse.status) return false;
    if (!deepEqual(responseShape(result.baseBody), responseShape(result.nextBody))) return false;
    if (row === 'article') {
      if (result.baseGemini.length || result.nextGemini.length) return false;
      continue;
    }
    if (result.baseGemini.length !== 1 || result.nextGemini.length !== 1) return false;
    if (!deepEqual(result.baseGemini[0], result.nextGemini[0])) {
      originalLog('DIFF ' + row + ' ' + JSON.stringify(sortValue(result.baseGemini[0])).slice(0, 400) + ' != ' + JSON.stringify(sortValue(result.nextGemini[0])).slice(0, 400));
      return false;
    }
  }
  return true;
});

await check('W4 guest limiter key is the IP bucket, not the client id; a user is keyed by id; IPv6 uses /64', async () => {
  const keys = [];
  const limiter = { limit: async ({ key }) => { keys.push(key); return { success: keys.filter((item) => item === key).length <= 1 }; } };
  const ipLimiter = { limit: async () => ({ success: true }) };
  const env = { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_RATE_LIMITER: limiter, MARG_IP_LIMITER: ipLimiter };
  resetNetwork();
  const first = await post(workerModule, chat('one', 1024, 'minimal'), env, { 'X-Marg-Client-Id': 'invented-a', 'CF-Connecting-IP': '198.51.100.10' });
  const second = await post(workerModule, chat('two', 1024, 'minimal'), env, { 'X-Marg-Client-Id': 'invented-b', 'CF-Connecting-IP': '198.51.100.10' });
  const third = await post(workerModule, chat('three', 1024, 'minimal'), env, { 'X-Marg-Client-Id': 'invented-a', 'CF-Connecting-IP': '198.51.100.11' });
  const guestKeys = keys.filter((key) => key.indexOf('guest:') === 0);
  const guestOk = first.status === 200 && second.status === 429 && third.status === 200 && guestKeys[0] === 'guest:198.51.100.10' && guestKeys[1] === 'guest:198.51.100.10' && guestKeys[0].indexOf('invented') === -1;
  keys.length = 0;
  resetNetwork();
  const userA = await post(workerModule, chat('user', 1024, 'minimal'), env, { Authorization: GOOD_AUTH, 'X-Marg-Client-Id': 'rotate-a', 'CF-Connecting-IP': '198.51.100.20' });
  const userB = await post(workerModule, chat('user', 1024, 'minimal'), env, { Authorization: GOOD_AUTH, 'X-Marg-Client-Id': 'rotate-b', 'CF-Connecting-IP': '198.51.100.21' });
  const userOk = userA.status === 200 && userB.status === 429 && keys[0] === 'user:user-1' && keys[1] === 'user:user-1';
  keys.length = 0;
  resetNetwork();
  const v6a = await post(workerModule, chat('v6', 1024, 'minimal'), env, { 'X-Marg-Client-Id': 'v6-a', 'CF-Connecting-IP': '2001:db8:1:2::5' });
  const v6b = await post(workerModule, chat('v6', 1024, 'minimal'), env, { 'X-Marg-Client-Id': 'v6-b', 'CF-Connecting-IP': '2001:db8:1:2:ffff:ffff:ffff:ffff' });
  const v6c = await post(workerModule, chat('v6', 1024, 'minimal'), env, { 'X-Marg-Client-Id': 'v6-c', 'CF-Connecting-IP': '2001:db8:1:3::1' });
  const v6Keys = keys.filter((key) => key.indexOf('guest:') === 0);
  const missing = await post(workerModule, chat('no-client', 1024, 'minimal'), { GEMINI_API_KEY: 'TEST_NOT_REAL' }, { 'X-Marg-Client-Id': '', 'CF-Connecting-IP': '198.51.100.30', Authorization: '' });
  const missingBody = await missing.json();
  keys.length = 0;
  const bare = await workerModule.default.fetch({ method: 'POST', text: async () => JSON.stringify(chat('unit', 1024, 'minimal')) }, env);
  return guestOk && userOk && v6a.status === 200 && v6b.status === 429 && v6c.status === 200 && v6Keys[0] === 'guest:2001:db8:1:2' && v6Keys[1] === 'guest:2001:db8:1:2' && v6Keys[2] === 'guest:2001:db8:1:3' && missing.status === 401 && missingBody.error.status === 'CLIENT_ID_REQUIRED' && bare.status === 200 && keys[0] === 'guest:unit-test';
});

await check('W5 invalid, expired, 5xx, and thrown Supabase results stay guests unless MARG_AUTH_STRICT is on', async () => {
  const cases = [
    ['Bearer not-a-student', 'ok'],
    ['Bearer expired-token', 'ok'],
    [GOOD_AUTH, '500'],
    [GOOD_AUTH, 'throw']
  ];
  for (const entry of cases) {
    resetNetwork();
    supabaseMode = entry[1] === 'ok' ? 'ok' : entry[1];
    if (entry[0] !== GOOD_AUTH) supabaseMode = 'ok';
    const open = await post(workerModule, chat('guest-path', 1024, 'minimal'), { GEMINI_API_KEY: 'TEST_NOT_REAL' }, { Authorization: entry[0], 'X-Marg-Client-Id': 'guest-client' });
    if (entry[1] === '500') supabaseMode = '500';
    if (entry[1] === 'throw') supabaseMode = 'throw';
    if (entry[0] === GOOD_AUTH && entry[1] !== 'ok') {
      resetNetwork();
      supabaseMode = entry[1];
      const again = await post(workerModule, chat('guest-path', 1024, 'minimal'), { GEMINI_API_KEY: 'TEST_NOT_REAL' }, { Authorization: entry[0], 'X-Marg-Client-Id': 'guest-client' });
      if (again.status !== 200 || geminiBodies.length !== 1) return false;
      resetNetwork();
      supabaseMode = entry[1];
      const strict = await post(workerModule, chat('guest-path', 1024, 'minimal'), { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_AUTH_STRICT: 'on' }, { Authorization: entry[0], 'X-Marg-Client-Id': 'guest-client' });
      const strictBody = await strict.json();
      if (strict.status !== 503 || strictBody.status !== 'AUTH_UNAVAILABLE' || strictBody.retryable !== true || geminiBodies.length !== 0) return false;
      continue;
    }
    if (open.status !== 200 || geminiBodies.length !== 1) return false;
    resetNetwork();
    const strict = await post(workerModule, chat('guest-path', 1024, 'minimal'), { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_AUTH_STRICT: 'on' }, { Authorization: entry[0], 'X-Marg-Client-Id': 'guest-client' });
    const strictBody = await strict.json();
    if (strict.status !== 401 || strictBody.status !== 'SESSION_INVALID' || geminiBodies.length !== 0) return false;
  }
  return true;
});

await check('W6 unset validation matches log, off and log keep the same outcome, and enforce clamps or rejects', async () => {
  const payload = { contents: [{ role: 'user', parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 40000 }, safetySettings: [{ category: 'HARM' }] };
  async function run(env) {
    resetNetwork();
    const started = logs.length;
    const response = await post(workerModule, payload, Object.assign({ GEMINI_API_KEY: 'TEST_NOT_REAL' }, env), { Authorization: GOOD_AUTH });
    const line = logs.slice(started).filter((item) => item.includes('marg_worker_request')).pop();
    return { status: response.status, tokens: geminiBodies[0] && geminiBodies[0].generationConfig.maxOutputTokens, leaked: geminiBodies[0] ? leakNames(geminiBodies[0]) : [], line: line ? originalParse(line) : null, called: geminiBodies.length };
  }
  const unset = await run({});
  const logged = await run({ MARG_WORKER_VALIDATION: 'log' });
  const off = await run({ MARG_WORKER_VALIDATION: 'off' });
  const enforced = await run({ MARG_WORKER_VALIDATION: 'enforce' });
  const sameOutcome = unset.status === logged.status && unset.tokens === logged.tokens && off.status === logged.status && off.tokens === logged.tokens && unset.called === 1 && off.called === 1;
  return sameOutcome && unset.tokens === 32768 && unset.line.validationMode === 'log' && logged.line.validationMode === 'log' && logged.line.clamps[0].applied === false && off.line.validationMode === 'off' && off.line.rejectReasons.length === 0 && unset.leaked.length === 0 && enforced.status === 200 && enforced.tokens === 16384 && enforced.line.clamps[0].applied === true;
});

await check('W7 guests are limited only in enforce; a registered student keeps images, grounding, JSON, articles, and the class ceiling', async () => {
  const guestHeaders = { Authorization: 'Bearer nope', 'X-Marg-Client-Id': 'guest-cap' };
  async function guest(mode, payload) {
    resetNetwork();
    const started = logs.length;
    const response = await post(workerModule, payload, { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_GUEST_CAPABILITIES: mode }, guestHeaders);
    const body = await response.json();
    const line = logs.slice(started).filter((item) => item.includes('marg_worker_request')).pop();
    return { status: response.status, body, called: geminiBodies.length, other: otherFetches, line: line ? originalParse(line) : null, upstream: geminiBodies[0] };
  }
  const imageLog = await guest('log', images(1, 4096, 'low'));
  const imageEnforce = await guest('enforce', images(1, 4096, 'low'));
  const groundLog = await guest('log', corpus.grounded);
  const groundEnforce = await guest('enforce', corpus.grounded);
  const jsonLog = await guest('log', corpus.structured);
  const jsonEnforce = await guest('enforce', corpus.structured);
  const articleLog = await guest('log', corpus.article);
  const articleEnforce = await guest('enforce', corpus.article);
  const tokenLog = await guest('log', chat('plan', 9000, 'medium'));
  const tokenEnforce = await guest('enforce', chat('plan', 9000, 'medium'));
  const tokenOff = await guest('off', chat('plan', 9000, 'medium'));
  const allowed = await guest('enforce', chat('hello', 2048, 'minimal'));
  resetNetwork();
  const registeredImage = await post(workerModule, images(1, 4096, 'low'), { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_GUEST_CAPABILITIES: 'enforce' }, { Authorization: GOOD_AUTH });
  const registeredGround = await post(workerModule, corpus.grounded, { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_GUEST_CAPABILITIES: 'enforce' }, { Authorization: GOOD_AUTH });
  const registeredJson = await post(workerModule, corpus.structured, { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_GUEST_CAPABILITIES: 'enforce' }, { Authorization: GOOD_AUTH });
  const registeredTokens = await post(workerModule, chat('study', 16384, 'low'), { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_GUEST_CAPABILITIES: 'enforce' }, { Authorization: GOOD_AUTH });
  return imageLog.status === 200 && imageLog.called === 1 && imageLog.line.rejectReasons.includes('CAPABILITY_NOT_AVAILABLE:image') &&
    imageEnforce.status === 403 && imageEnforce.body.capability === 'image' && imageEnforce.called === 0 &&
    groundLog.status === 200 && groundLog.upstream.tools[0].google_search && groundEnforce.status === 403 && groundEnforce.body.capability === 'web_grounding' &&
    jsonLog.status === 200 && jsonEnforce.status === 403 && jsonEnforce.body.capability === 'structured' &&
    articleLog.status === 502 && articleEnforce.status === 403 && articleEnforce.body.capability === 'daily_article' && articleEnforce.other === 0 &&
    tokenLog.status === 200 && tokenLog.upstream.generationConfig.maxOutputTokens === 9000 && tokenEnforce.status === 403 && tokenEnforce.body.capability === 'output_tokens' &&
    tokenOff.status === 200 && tokenOff.line.rejectReasons.includes('CAPABILITY_NOT_AVAILABLE:output_tokens') === false &&
    allowed.status === 200 && allowed.called === 1 &&
    registeredImage.status === 200 && registeredGround.status === 200 && registeredJson.status === 200 && registeredTokens.status === 200;
});

await check('W8 oversized Content-Length, oversized streamed body, malformed JSON, non-object JSON, and empty contents', async () => {
  let read = false;
  const oversizedHeader = await workerModule.default.fetch({
    method: 'POST',
    headers: { get(name) { const value = { 'content-length': String(MAX_REQUEST_BYTES + 1), 'x-marg-client-id': 'c', 'cf-connecting-ip': '203.0.113.40' }; return value[String(name).toLowerCase()] || null; } },
    body: { getReader() { read = true; throw new Error('read'); } },
    text: async () => { read = true; return '{}'; }
  }, { GEMINI_API_KEY: 'TEST_NOT_REAL' });
  const headerOk = oversizedHeader.status === 413 && read === false;
  const parsesBefore = parses;
  let produced = 0;
  const extra = MAX_REQUEST_BYTES + (1024 * 1024);
  const stream = new ReadableStream({
    pull(controller) {
      if (produced >= extra) { controller.close(); return; }
      const size = Math.min(64 * 1024, extra - produced);
      controller.enqueue(new Uint8Array(size));
      produced += size;
    }
  });
  const streamed = await workerModule.default.fetch(new Request('https://worker.test/', {
    method: 'POST',
    headers: { 'X-Marg-Client-Id': 'stream', 'CF-Connecting-IP': '203.0.113.41' },
    body: stream,
    duplex: 'half'
  }), { GEMINI_API_KEY: 'TEST_NOT_REAL' });
  const streamOk = streamed.status === 413 && parses === parsesBefore && produced < extra;
  resetNetwork();
  const malformed = await post(workerModule, null, null, { Authorization: GOOD_AUTH }, '{');
  const malformedBody = await malformed.json();
  const arrayBody = await (await post(workerModule, null, { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_WORKER_VALIDATION: 'log' }, { Authorization: GOOD_AUTH }, '[]')).json();
  const numberBody = await (await post(workerModule, null, { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_WORKER_VALIDATION: 'enforce' }, { Authorization: GOOD_AUTH }, '42')).json();
  const emptyLog = await (await post(workerModule, { contents: [] }, { GEMINI_API_KEY: 'TEST_NOT_REAL' }, { Authorization: GOOD_AUTH })).json();
  const emptyEnforce = await (await post(workerModule, { contents: [] }, { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_WORKER_VALIDATION: 'enforce' }, { Authorization: GOOD_AUTH })).json();
  return headerOk && streamOk && malformed.status === 400 && malformedBody.error.status === 'INVALID_JSON' && geminiBodies.length === 0 &&
    arrayBody.error.status === 'MISSING_CONTENTS' && numberBody.status === 'INVALID_REQUEST' && numberBody.reasons.includes('BODY_NOT_OBJECT') &&
    emptyLog.error.status === 'MISSING_CONTENTS' && emptyEnforce.status === 'INVALID_REQUEST' && emptyEnforce.reasons.includes('EMPTY_CONTENTS');
});

await check('W9 seams run once around an upstream request and not on rejection', async () => {
  globalThis.__b3Before = [];
  globalThis.__b3After = [];
  resetNetwork();
  const ok = await post(seamModule, corpus.mentor, { GEMINI_API_KEY: 'TEST_NOT_REAL' }, { Authorization: GOOD_AUTH });
  const before = globalThis.__b3Before;
  const after = globalThis.__b3After;
  const once = ok.status === 200 && before.length === 1 && after.length === 1 && before[0].requestId && before[0].caller.kind === 'user' && before[0].requestClass === 'chat' && before[0].limits.maxImages === 4 && before[0].upstreamPayload.contents && before[0].estimatedInputBytes > 0 && after[0].ok === true && after[0].status === 200 && after[0].upstreamCalls === 1 && after[0].usageMetadata.promptTokenCount === 3;
  globalThis.__b3Before = [];
  globalThis.__b3After = [];
  resetNetwork();
  const rejected = await post(seamModule, images(5, 1024, 'low'), { GEMINI_API_KEY: 'TEST_NOT_REAL', MARG_WORKER_VALIDATION: 'enforce' }, { Authorization: GOOD_AUTH });
  return once && rejected.status === 400 && globalThis.__b3Before.length === 0 && globalThis.__b3After.length === 0 && geminiBodies.length === 0;
});

await check('W10 exactly one marg_worker_request log and it contains no message, token, user id, or IP sentinel', async () => {
  resetNetwork();
  const started = logs.length;
  const response = await post(workerModule, chat('SENTINEL_MESSAGE_TEXT', 1024, 'minimal'), { GEMINI_API_KEY: 'TEST_NOT_REAL' }, {
    Authorization: 'Bearer SENTINEL_BEARER_TOKEN',
    'X-Marg-Client-Id': 'SENTINEL_CLIENT',
    'CF-Connecting-IP': 'SENTINEL_IP'
  });
  const requestId = response.headers.get('X-Marg-Request-Id');
  const lines = logs.slice(started).filter((line) => line.includes('marg_worker_request') && line.includes(requestId));
  if (lines.length !== 1) return false;
  const line = lines[0];
  const record = originalParse(line);
  const forbidden = ['SENTINEL_MESSAGE_TEXT', 'SENTINEL_BEARER_TOKEN', 'SENTINEL_USER', 'SENTINEL_IP', 'SENTINEL_CLIENT'];
  const hash = createHash('sha256').update('user:SENTINEL_USER').digest('hex').slice(0, 12);
  return response.status === 200 && forbidden.every((value) => line.indexOf(value) === -1) && record.event === 'marg_worker_request' && record.callerKind === 'user' && record.authState === 'valid' && record.subjectHash === hash && record.requestClass === 'chat' && record.validationMode === 'log' && record.outputTokensSent === 1024 && record.upstreamCalls === 1 && record.usageMetadata.promptTokenCount === 3 && record.httpStatus === 200 && errors.slice().join(' ').indexOf('SENTINEL_') === -1;
});

await check('W11 resolveMaxOutputTokens matches main for the same inputs', async () => {
  const contents = [{ role: 'user', parts: [{ text: 'Explain ratios.' }] }];
  const imageContents = [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'aaaa' } }, { text: 'Solve this.' }] }];
  const practice = { system: 'Generate only valid JSON', generationConfig: { responseMimeType: 'application/json' } };
  const table = [
    [{}, contents, 500],
    [{}, contents, 2048],
    [{}, contents, 32768],
    [{}, contents, 0],
    [practice, contents, 100],
    [practice, contents, 16384],
    [{}, imageContents, 100],
    [practice, imageContents, 2000],
    [{ systemInstruction: { parts: [{ text: 'complete roadmap' }] } }, contents, 3000]
  ];
  return table.every((entry) => baselineModule.resolveMaxOutputTokens(entry[0], entry[1], entry[2]) === workerModule.resolveMaxOutputTokens(entry[0], entry[1], entry[2]));
});

originalLog((failed === 0 ? 'PASS' : 'FAIL') + ' ' + (failed === 0 ? 'all checks' : failed + ' failed'));
process.exit(failed === 0 ? 0 : 1);
