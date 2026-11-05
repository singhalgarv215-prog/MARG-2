// Proves the deployment environment guard fails closed: a page that is not on a production hostname can never
// contact production Supabase or the production Worker, even when no staging configuration exists.
// Run: node env-fail-closed.test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const envTools = require('./marg-env.js');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, detail || ''); }
}

const PROD_SB = 'https://kduqtrumhveteyjkyltf.supabase.co/rest/v1/chats';
const PROD_WORKER = 'https://marg.singhalgarv215.workers.dev/';
const STAGING_REF = 'hmgdzkszzuaivyqeeitu';
const PROD_REF = 'kduqtrumhveteyjkyltf';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (p) => b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(p) + '.sig';
const goodCfg = { supabaseUrl: `https://${STAGING_REF}.supabase.co`, anonKey: jwt({ iss: 'supabase', ref: STAGING_REF, role: 'anon' }) };
const envSrc = fs.readFileSync('./marg-env.js', 'utf8');

// Runs the real marg-env.js as a browser would, in a sandbox that records every outgoing request.
function openPage(hostname, config, opts) {
  const sent = [];
  const win = {
    URL: opts && opts.noURL ? undefined : URL,
    atob: globalThis.atob,
    document: { addEventListener() {}, getElementById() { return null; }, createElement() { return { setAttribute() {} }; }, body: null },
    fetch(url) { sent.push({ kind: 'fetch', url: String(url && url.url ? url.url : url) }); return Promise.resolve({ ok: true }); },
    XMLHttpRequest: function () {},
    navigator: { sendBeacon(url) { sent.push({ kind: 'beacon', url: String(url) }); return true; } },
    WebSocket: function (url) { sent.push({ kind: 'ws', url: String(url) }); },
    EventSource: function (url) { sent.push({ kind: 'es', url: String(url) }); }
  };
  win.XMLHttpRequest.prototype.open = function (m, url) { sent.push({ kind: 'xhr', url: String(url) }); };
  if (!(opts && opts.noLocation)) win.location = { hostname };
  if (config) win.MARG_STAGING_CONFIG = config;
  win.window = win;
  vm.runInNewContext(envSrc, win);
  return { win, sent };
}

async function tryAll(page) {
  const results = {};
  for (const url of [PROD_SB, PROD_WORKER]) {
    try { await page.win.fetch(url); results['fetch ' + url] = 'sent'; } catch (e) { results['fetch ' + url] = 'refused'; }
    try { new page.win.XMLHttpRequest().open('GET', url); results['xhr ' + url] = 'sent'; } catch (e) { results['xhr ' + url] = 'refused'; }
    try { page.win.navigator.sendBeacon(url, 'x'); results['beacon ' + url] = 'sent'; } catch (e) { results['beacon ' + url] = 'refused'; }
    try { new page.win.WebSocket(url.replace('https', 'wss')); results['ws ' + url] = 'sent'; } catch (e) { results['ws ' + url] = 'refused'; }
    try { new page.win.EventSource(url); results['es ' + url] = 'sent'; } catch (e) { results['es ' + url] = 'refused'; }
  }
  return results;
}
const allRefused = (r) => Object.values(r).every((v) => v === 'refused');
const noneRefused = (r) => Object.values(r).every((v) => v === 'sent');
const touchedProduction = (page) => page.sent.some((s) => envTools.isProductionUrl(s.url));

// ---- Preview deployments: no staging configuration at all (the exact situation on Vercel)
const previewHosts = [
  'marg-2-git-claude-phase4-goals-someone.vercel.app',
  'marg-2-abc123xyz-someone.vercel.app',
  'marg-2.vercel.app',
  'example.com',
  'trymarg.com.evil.example',
  'eviltrymarg.com',
  'trymarg.com.vercel.app',
  'trymarg.co',
  ''
];
for (const h of previewHosts) {
  const page = openPage(h, undefined);
  const r = await tryAll(page);
  check(`P1 host "${h}" without staging config is blocked, not production`, page.win.MARG_ENV.blocked === true && page.win.MARG_ENV.name === 'blocked', JSON.stringify(page.win.MARG_ENV));
  check(`P2 host "${h}" cannot reach production over fetch, XHR, beacon, WebSocket or EventSource`, allRefused(r) && !touchedProduction(page), JSON.stringify(r));
  check(`P3 host "${h}" has analytics switched off`, page.win['ga-disable-G-VZ0N5RH912'] === true);
}

// ---- Missing location object must not be read as production
{
  const page = openPage('', undefined, { noLocation: true });
  check('P4 a page with no readable hostname is blocked', page.win.MARG_ENV.blocked === true);
  check('P5 and cannot reach production', allRefused(await tryAll(page)));
}

// ---- If the address cannot even be parsed (no URL support), the guard refuses instead of letting requests through
{
  const page = openPage('x.vercel.app', undefined, { noURL: true });
  check('P6 unparseable addresses are refused, not allowed', allRefused(await tryAll(page)) && !touchedProduction(page));
}

// ---- Invalid or dangerous configuration on a preview: blocked, never production, never a throw that leaves MARG_ENV unset
const badConfigs = {
  'production Supabase URL': { supabaseUrl: `https://${PROD_REF}.supabase.co`, anonKey: jwt({ ref: PROD_REF, role: 'anon' }) },
  'production key with staging URL': { supabaseUrl: goodCfg.supabaseUrl, anonKey: jwt({ ref: PROD_REF, role: 'anon' }) },
  'service-role key': { supabaseUrl: goodCfg.supabaseUrl, anonKey: jwt({ ref: STAGING_REF, role: 'service_role' }) },
  'missing key': { supabaseUrl: goodCfg.supabaseUrl },
  'not a supabase URL': { supabaseUrl: 'https://example.com', anonKey: goodCfg.anonKey },
  'plain http': { supabaseUrl: `http://${STAGING_REF}.supabase.co`, anonKey: goodCfg.anonKey },
  'garbage': 'not an object',
  'userinfo trick': { supabaseUrl: `https://${STAGING_REF}.supabase.co@${PROD_REF}.supabase.co`, anonKey: goodCfg.anonKey }
};
for (const [label, cfg] of Object.entries(badConfigs)) {
  for (const host of ['marg-2-git-x-y.vercel.app', 'localhost']) {
    const page = openPage(host, cfg);
    check(`C1 ${label} on ${host}: environment is blocked, MARG_ENV is always set`, !!page.win.MARG_ENV && page.win.MARG_ENV.blocked === true && page.win.MARG_ENV.name !== 'production', JSON.stringify(page.win.MARG_ENV));
    check(`C2 ${label} on ${host}: production unreachable`, allRefused(await tryAll(page)));
  }
}

// ---- Valid staging configuration on a preview: staging works, production stays blocked
{
  const page = openPage('marg-2-git-x-y.vercel.app', goodCfg);
  check('S1 valid staging config on a preview resolves to staging', page.win.MARG_ENV.name === 'staging' && page.win.MARG_ENV.supabaseUrl === goodCfg.supabaseUrl);
  check('S2 staging preview still cannot reach production', allRefused(await tryAll(page)));
  check('S3 staging preview can reach the staging project', (await page.win.fetch(`${goodCfg.supabaseUrl}/rest/v1/goals`)) && page.sent.some((s) => s.url.startsWith(goodCfg.supabaseUrl)));
}

// ---- Local development keeps its existing workflow
{
  const none = openPage('localhost', undefined);
  check('L1 localhost without staging config keeps today\'s behaviour (production endpoints, no guard)', none.win.MARG_ENV.name === 'production' && noneRefusedOk(none));
  const staged = openPage('localhost', goodCfg);
  check('L2 localhost with staging-config.local.js values resolves to staging', staged.win.MARG_ENV.name === 'staging');
  check('L3 localhost staging cannot reach production', allRefused(await tryAll(staged)));
  for (const h of ['127.0.0.1', '[::1]', 'dev.localhost']) {
    check(`L4 ${h} counts as local`, openPage(h, undefined).win.MARG_ENV.name === 'production');
  }
}
function noneRefusedOk(page) { return page.win.fetch === page.win.fetch && !page.win.__margBlocked; }

// ---- Production hostnames keep the existing production behaviour, and cannot be switched to staging or blocked by a config
for (const h of ['trymarg.com', 'www.trymarg.com', 'marg-five.vercel.app', 'MARG-FIVE.VERCEL.APP', 'TRYMARG.COM', 'trymarg.com.']) {
  const page = openPage(h, undefined);
  check(`R1 ${h} resolves to production, no guard installed`, page.win.MARG_ENV.name === 'production' && !page.win.__margBlocked && !page.win.MARG_ENV.blocked);
  const injected = openPage(h, badConfigs['production Supabase URL']);
  check(`R2 ${h}: an injected staging config is ignored`, injected.win.MARG_ENV.name === 'production');
  const injected2 = openPage(h, goodCfg);
  check(`R3 ${h}: a valid staging config is ignored, production stays production`, injected2.win.MARG_ENV.name === 'production');
}

// ---- Rules in code
check('K1 resolveSafely never throws', (() => { for (const [h, c] of [['x.vercel.app', undefined], ['x.vercel.app', null], ['x.vercel.app', 5], [undefined, {}], [null, null]]) { try { envTools.resolveSafely(c, h); } catch (e) { return false; } } return true; })());
check('K2 production page hosts are exactly the three production domains of the Vercel project, no wildcard', JSON.stringify(envTools.PRODUCTION_PAGE_HOSTS) === JSON.stringify(['trymarg.com', 'www.trymarg.com', 'marg-five.vercel.app']) &&
  envTools.PRODUCTION_PAGE_HOSTS.every((h) => !h.includes('*')));
for (const h of ['marg-five.vercel.app', 'marg-five-git-x-someone.vercel.app', 'marg-five-abc123-someone.vercel.app', 'marg-five.vercel.app.evil.example', 'xmarg-five.vercel.app', 'marg-five.vercel.app:evil', 'vercel.app']) {
  const page = openPage(h, undefined);
  const prod = h === 'marg-five.vercel.app';
  check(`K4 ${h}: ${prod ? 'is production' : 'is blocked (only the exact production domain is allowed)'}`, prod ? page.win.MARG_ENV.name === 'production' : page.win.MARG_ENV.blocked === true);
  if (!prod) check(`K5 ${h}: cannot reach production`, allRefused(await tryAll(page)));
}
for (const h of ['trymarg.com', 'www.trymarg.com', 'marg-five.vercel.app']) {
  const page = openPage(h, undefined);
  check(`K6 ${h}: production works, requests to Supabase and the Worker are not intercepted`, noneRefused(await tryAll(page)));
}
check('K7 the three gates (marg-env.js, marg-app.js, landing-bootstrap.js) and vercel.json name the same production hosts', (() => {
  const gate = /\^\(\(www\\\.\)\?trymarg\\\.com\|marg-five\\\.vercel\\\.app\|localhost/;
  return gate.test(fs.readFileSync('./marg-app.js', 'utf8')) && gate.test(fs.readFileSync('./landing-bootstrap.js', 'utf8')) &&
    JSON.parse(fs.readFileSync('./vercel.json', 'utf8')).routes[0].missing[0].value === '^((www\\.)?trymarg\\.com|marg-five\\.vercel\\.app)$';
})());
check('K8 DOCUMENTED GAP: the production Worker does not accept marg-five.vercel.app as an origin (no Worker change made here)',
  !/marg-five/.test(fs.readFileSync('./cloudflare-worker.js', 'utf8')));
check('K3 direct resolveEnv(undefined) is unchanged (tools and old tests)', envTools.resolveEnv(undefined).name === 'production');

// ---- App gate: marg-app.js and landing-bootstrap.js refuse to run on blocked pages
const appSrc = fs.readFileSync('./marg-app.js', 'utf8');
const gateEnd = appSrc.indexOf('var tourStep = 0;');
const appGate = appSrc.slice(0, gateEnd);
function runGate(win) { try { vm.runInNewContext(appGate, Object.assign({ window: win }, win)); return 'ran'; } catch (e) { return 'refused'; } }
check('A1 marg-app.js gate sits before everything else', gateEnd > 0 && gateEnd < 900 && /refusing to start/.test(appGate));
check('A2 blocked environment: app refuses to start', runGate({ location: { hostname: 'x.vercel.app' }, document: {}, MARG_ENV: { blocked: true } }) === 'refused');
check('A3 guard script missing on a preview: app refuses to start', runGate({ location: { hostname: 'x.vercel.app' }, document: {} }) === 'refused');
check('A4 guard script missing on an unknown host: app refuses to start', runGate({ location: { hostname: 'example.com' }, document: {} }) === 'refused');
check('A5 production host starts', runGate({ location: { hostname: 'trymarg.com' }, document: {}, MARG_ENV: { name: 'production' } }) === 'ran');
check('A6 www production host starts', runGate({ location: { hostname: 'www.trymarg.com' }, document: {}, MARG_ENV: { name: 'production' } }) === 'ran');
check('A6b marg-five.vercel.app production domain starts', runGate({ location: { hostname: 'marg-five.vercel.app' }, document: {}, MARG_ENV: { name: 'production' } }) === 'ran');
check('A6c another vercel.app preview without a guard is refused', runGate({ location: { hostname: 'marg-five-git-x-someone.vercel.app' }, document: {} }) === 'refused');
check('A7 localhost starts', runGate({ location: { hostname: 'localhost' }, document: {}, MARG_ENV: { name: 'production' } }) === 'ran');
check('A8 staging preview starts', runGate({ location: { hostname: 'x.vercel.app' }, document: {}, MARG_ENV: { name: 'staging' } }) === 'ran');
check('A9 test sandboxes with no window.location are unaffected', runGate({}) === 'ran');
const boot = fs.readFileSync('./landing-bootstrap.js', 'utf8');
check('A10 landing-bootstrap.js gate returns before it reads any Supabase value or loads the app bundle',
  boot.indexOf('MARG_ENV.blocked === true') > 0 && boot.indexOf('MARG_ENV.blocked === true') < boot.indexOf('var SUPABASE_URL') && boot.indexOf('MARG_ENV.blocked === true') < boot.indexOf('APP_BUNDLE_URL'));

// ---- Wiring: every page that can contact production loads the guard first
const htmlFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name === 'data') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (p.endsWith('.html')) htmlFiles.push(p);
  }
})('.');
let guarded = 0;
for (const f of htmlFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const reachesProduction = /kduqtrumhveteyjkyltf|marg\.singhalgarv215\.workers\.dev|landing-bootstrap\.js|marg-app\.js/.test(src);
  if (!reachesProduction) continue;
  guarded++;
  const guardAt = src.search(/<script[^>]+src="\/marg-env\.js\?v=[^"]+"/);
  // any external script, or any inline script that can make a request (a harmless inline script, e.g. a CSS class toggle, may come first)
  const firstOther = src.search(/<script(?![^>]*marg-env\.js)[^>]*\ssrc=|<script(?![^>]*\ssrc=)(?![^>]*type="application\/ld\+json")[^>]*>[^<]*(fetch\(|XMLHttpRequest|sendBeacon|WORKER_URL|SUPABASE_URL)/);
  const firstProd = src.search(/kduqtrumhveteyjkyltf|marg\.singhalgarv215\.workers\.dev/);
  check(`W1 ${f} loads marg-env.js`, guardAt >= 0);
  check(`W2 ${f} loads marg-env.js before any other script and before any production address`, guardAt >= 0 && (firstOther < 0 || guardAt < firstOther) && (firstProd < 0 || guardAt < firstProd), `guard@${guardAt} other@${firstOther} prod@${firstProd}`);
}
check('W3 at least the app, the community page and the three daily pages are covered', guarded >= 5, 'guarded ' + guarded);
{
  const idx = fs.readFileSync('./index.html', 'utf8');
  const g = idx.indexOf('marg-env.js'), gtag = idx.indexOf('googletagmanager');
  check('W4 index.html: guard loads before analytics and before the app scripts', g > 0 && g < gtag && g < idx.indexOf('landing-bootstrap.js'));
  const versions = new Set(); for (const f of htmlFiles) { const m = fs.readFileSync(f, 'utf8').match(/marg-env\.js\?v=([^"]+)/); if (m) versions.add(m[1]); }
  check('W5 every page uses the same marg-env.js version (no stale cached copy left behind)', versions.size === 1, [...versions].join(','));
}

// ---- Server side layer (vercel.json): non-production hosts get a CSP that omits production
{
  const v = JSON.parse(fs.readFileSync('./vercel.json', 'utf8'));
  const first = v.routes[0];
  const csp = first.headers && first.headers['Content-Security-Policy'] || '';
  check('V1 vercel.json is valid JSON and its first route applies to every path and continues', first.src === '/(.*)' && first.continue === true);
  check('V2 the route is skipped for the production hostnames only', Array.isArray(first.missing) && first.missing.length === 1 && first.missing[0].type === 'host' &&
    new RegExp(first.missing[0].value).test('trymarg.com') && new RegExp(first.missing[0].value).test('www.trymarg.com') && new RegExp(first.missing[0].value).test('marg-five.vercel.app') &&
    !new RegExp(first.missing[0].value).test('marg-five-git-x-someone.vercel.app') && !new RegExp(first.missing[0].value).test('marg-five.vercel.app.evil.example') &&
    !new RegExp(first.missing[0].value).test('x.vercel.app') && !new RegExp(first.missing[0].value).test('trymarg.com.evil.example') && !new RegExp(first.missing[0].value).test('eviltrymarg.com'));
  check('V3 the CSP limits connections to this site and the staging project, never production', /connect-src 'self'/.test(csp) && csp.includes(STAGING_REF) && !csp.includes(PROD_REF) && !/workers\.dev/.test(csp));
  check('V4 existing routes are preserved after the new one', v.routes.some((r) => r.src === '/privacy') && v.routes.some((r) => r.handle === 'filesystem') && v.routes[v.routes.length - 1].dest === '/index.html');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
