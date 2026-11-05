// Tests for marg-env.js (staging selector and network guard) and its wiring.
// Run: node staging-guard.test.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const env = require('./marg-env.js');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, detail || ''); }
}
function throws(fn) { try { fn(); return null; } catch (e) { return e; } }

function jwt(payload) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return b({ alg: 'HS256', typ: 'JWT' }) + '.' + b(payload) + '.sig';
}
const STAGING_REF = 'hmgdzkszzuaivyqeeitu';
const PROD_REF = 'kduqtrumhveteyjkyltf';
const goodCfg = { supabaseUrl: `https://${STAGING_REF}.supabase.co`, anonKey: jwt({ iss: 'supabase', ref: STAGING_REF, role: 'anon' }) };

// ---- resolveEnv
check('E1 no staging config means production (nothing changes)', env.resolveEnv(undefined).name === 'production');
const ok = env.resolveEnv(goodCfg);
check('E2 valid staging config resolves', ok.name === 'staging' && ok.supabaseUrl === goodCfg.supabaseUrl);
check('E3 staging never points the model Worker at production', !env.isProductionUrl(ok.workerUrl));
check('E4 production URL as staging is refused', /production project/.test(String(throws(() => env.resolveEnv({ supabaseUrl: `https://${PROD_REF}.supabase.co`, anonKey: jwt({ ref: PROD_REF, role: 'anon' }) })))));
check('E5 production anon key with a staging URL is refused', /does not belong/.test(String(throws(() => env.resolveEnv({ supabaseUrl: goodCfg.supabaseUrl, anonKey: jwt({ ref: PROD_REF, role: 'anon' }) })))));
check('E6 service-role key is refused', /anon/.test(String(throws(() => env.resolveEnv({ supabaseUrl: goodCfg.supabaseUrl, anonKey: jwt({ ref: STAGING_REF, role: 'service_role' }) })))));
check('E7 missing key is refused', !!throws(() => env.resolveEnv({ supabaseUrl: goodCfg.supabaseUrl })));
check('E8 non-supabase URL is refused', !!throws(() => env.resolveEnv({ supabaseUrl: 'https://example.com', anonKey: goodCfg.anonKey })));
check('E9 http (not https) is refused', !!throws(() => env.resolveEnv({ supabaseUrl: `http://${STAGING_REF}.supabase.co`, anonKey: goodCfg.anonKey })));
check('E10 userinfo trick pointing at production is refused', !!throws(() => env.resolveEnv({ supabaseUrl: `https://${STAGING_REF}.supabase.co@${PROD_REF}.supabase.co`, anonKey: goodCfg.anonKey })));

// ---- isProductionUrl
check('U1 production Supabase host', env.isProductionUrl(`https://${PROD_REF}.supabase.co/rest/v1/chats`));
check('U2 production Worker host', env.isProductionUrl('https://marg.singhalgarv215.workers.dev/'));
check('U3 uppercase host', env.isProductionUrl(`HTTPS://${PROD_REF.toUpperCase()}.SUPABASE.CO/x`));
check('U4 userinfo trick resolves to the real host', env.isProductionUrl(`https://${STAGING_REF}.supabase.co@${PROD_REF}.supabase.co/x`));
check('U5 subdomain of production host', env.isProductionUrl(`https://x.${PROD_REF}.supabase.co/`));
check('U6 staging host is not production', !env.isProductionUrl(`https://${STAGING_REF}.supabase.co/rest/v1/goals`));
check('U7 lookalike suffix is not production', !env.isProductionUrl(`https://not${PROD_REF}.supabase.co/`));
check('U8 relative URL is not production', !env.isProductionUrl('/rest/v1/x'));

// ---- network guard
function fakeWindow() {
  const calls = [];
  class XHR { open(m, u) { calls.push(['xhr', String(u)]); } }
  class WS { constructor(u) { calls.push(['ws', String(u)]); } }
  class ES { constructor(u) { calls.push(['es', String(u)]); } }
  return {
    calls,
    fetch: async (u) => { calls.push(['fetch', typeof u === 'string' ? u : u.url]); return { ok: true }; },
    XMLHttpRequest: XHR, WebSocket: WS, EventSource: ES,
    navigator: { sendBeacon: (u) => { calls.push(['beacon', String(u)]); return true; } }
  };
}
const w = fakeWindow();
const blocked = env.installNetworkGuard(w);
const prodFetch = w.fetch(`https://${PROD_REF}.supabase.co/rest/v1/chats`);
const settled = await prodFetch.then(() => 'sent', (e) => 'blocked: ' + e.message);
check('N1 fetch to production Supabase is rejected', /^blocked/.test(settled), settled);
check('N2 fetch to production Worker is rejected', /^blocked/.test(await w.fetch('https://marg.singhalgarv215.workers.dev/').then(() => 'sent', (e) => 'blocked')));
check('N3 Request-like object to production is rejected', /^blocked/.test(await w.fetch({ url: `https://${PROD_REF}.supabase.co/auth/v1/user` }).then(() => 'sent', () => 'blocked')));
check('N4 fetch to staging goes through', (await w.fetch(`https://${STAGING_REF}.supabase.co/rest/v1/goals`).then(() => 'sent')) === 'sent');
check('N5 xhr to production is blocked', !!throws(() => new w.XMLHttpRequest().open('GET', `https://${PROD_REF}.supabase.co/`)));
check('N6 beacon to production is blocked', !!throws(() => w.navigator.sendBeacon(`https://${PROD_REF}.supabase.co/`, 'x')));
check('N7 websocket to production is blocked', !!throws(() => new w.WebSocket(`wss://${PROD_REF}.supabase.co/realtime/v1/websocket`)));
check('N8 eventsource to production is blocked', !!throws(() => new w.EventSource(`https://${PROD_REF}.supabase.co/`)));
check('N9 nothing production-bound ever reached the real transport', !w.calls.some((c) => env.isProductionUrl(c[1])), JSON.stringify(w.calls));
check('N10 every blocked attempt was recorded (for the staging run report)', blocked.length >= 6, String(blocked.length));

// ---- wiring (source level)
const app = fs.readFileSync('marg-app.js', 'utf8');
const boot = fs.readFileSync('landing-bootstrap.js', 'utf8');
const idx = fs.readFileSync('index.html', 'utf8');
check('W1 marg-app.js takes URL, key and Worker from MARG_ENV only when staging', /const SUPABASE_URL = MARG_IS_STAGING \? window\.MARG_ENV\.supabaseUrl : 'https:\/\/kduqtrumhveteyjkyltf\.supabase\.co'/.test(app) && /SUPABASE_ANON_KEY = MARG_IS_STAGING \? window\.MARG_ENV\.anonKey/.test(app) && /WORKER_URL = MARG_IS_STAGING \? window\.MARG_ENV\.workerUrl/.test(app));
check('W2 landing-bootstrap.js takes URL and key from MARG_ENV only when staging', /var SUPABASE_URL = MARG_IS_STAGING \? window\.MARG_ENV\.supabaseUrl/.test(boot) && /var SUPABASE_ANON_KEY = MARG_IS_STAGING \? window\.MARG_ENV\.anonKey/.test(boot));
check('W3 index.html loads marg-env.js synchronously before every deferred app script', idx.indexOf('/marg-env.js') > 0 && idx.indexOf('/marg-env.js') < idx.indexOf('/chat-topics.js') && !/defer[^>]*marg-env\.js/.test(idx));
check('W4 index.html never references a staging config file (production pages cannot become staging)', !/staging-config/.test(idx));
check('W5 the Google sign-in redirect is built from the configured URL', (app.match(/SUPABASE_URL \+ '\/auth\/v1\/authorize/g) || []).length + (boot.match(/SUPABASE_URL \+ '\/auth\/v1\/authorize/g) || []).length >= 2);
check('W6 no other file hardcodes the production Supabase host', ['sw.js', 'study-context.js', 'question-library.js', 'slash-tools.js', 'marg-vision.js', 'chat-topics.js'].every((f) => !fs.readFileSync(f, 'utf8').includes(PROD_REF)));

const envSrc = fs.readFileSync('marg-env.js', 'utf8');
check('W7 staging switches off production analytics (page views from test runs must not reach it)', /if \(env\.name === 'staging'\) \{ root\['ga-disable-G-VZ0N5RH912'\] = true;/.test(envSrc) && idx.includes('G-VZ0N5RH912'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
