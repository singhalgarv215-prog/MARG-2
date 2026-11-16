// Real-API check of the read-only goals client against MARG STAGING, with two test accounts.
// Run by a person (passwords never pass through an assistant):
//   read -s A_PASSWORD; read -s B_PASSWORD; export A_PASSWORD B_PASSWORD
//   STAGING_URL=https://<staging-ref>.supabase.co STAGING_ANON_KEY=<staging anon key> \
//   A_EMAIL=... B_EMAIL=... node scripts/staging-rest-check.mjs
// Prints PASS/FAIL lines only. Never prints tokens, keys or passwords.
// Writes two goal rows (one per account) to STAGING. Users cannot delete goals, so they remain until removed in the SQL editor.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const env = require('../marg-env.js');
const goals = require('../marg-goals.js');

export async function run(cfg, fetchImpl) {
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : (detail ? '  -> ' + detail : ''))); };
  const seen = [];
  const f = async (url, opts) => { seen.push(new URL(url).host); return fetchImpl(url, opts); };

  // 0. refuse anything that is not clearly staging
  let resolved;
  try { resolved = env.resolveEnv({ supabaseUrl: cfg.url, anonKey: cfg.anonKey }); } catch (e) { check('S0 staging config accepted (not production, key matches project, role anon)', false, e.message); return results; }
  check('S0 staging config accepted (not production, key matches project, role anon)', resolved.name === 'staging');
  const base = resolved.supabaseUrl;
  const host = new URL(base).host;
  const hdr = (token) => Object.assign({ apikey: cfg.anonKey, 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {});

  async function signIn(email, password) {
    const r = await f(base + '/auth/v1/token?grant_type=password', { method: 'POST', headers: hdr(), body: JSON.stringify({ email, password }) });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.access_token && j.user ? { token: j.access_token, id: j.user.id } : null;
  }
  const A = await signIn(cfg.aEmail, cfg.aPassword);
  const B = await signIn(cfg.bEmail, cfg.bPassword);
  check('S1 both test accounts sign in to staging', !!A && !!B, 'sign-in failed: check the emails and passwords, and that email sign-in is enabled on the staging project');
  if (!A || !B) return results;
  check('S2 the two accounts are different users', A.id !== B.id);

  const stamp = Date.now();
  async function makeGoal(who, title) {
    const r = await f(base + '/rest/v1/goals', { method: 'POST', headers: Object.assign(hdr(who.token), { Prefer: 'return=representation' }), body: JSON.stringify({ user_id: who.id, kind: 'check', title }) });
    const j = r.ok ? await r.json() : null;
    return Array.isArray(j) && j[0] ? j[0] : null;
  }
  const ga = await makeGoal(A, 'P4.2 check A ' + stamp);
  const gb = await makeGoal(B, 'P4.2 check B ' + stamp);
  check('S3 each account can create its own goal row', !!ga && !!gb);
  if (!ga || !gb) return results;

  // the real client code, over the real API
  const clientFor = (who, urlBase) => goals.createClient({ baseUrl: urlBase || base, getUserId: () => who.id, isEnabled: () => true, fetch: (u, o) => f(u, Object.assign({}, o, { headers: Object.assign({}, o && o.headers, hdr(who.token)) })) });
  const ra = await clientFor(A).load();
  const rb = await clientFor(B).load();
  check('S4 account A loads and sees its own goal', ra.state === 'ok' && ra.goals.some((g) => g.id === ga.id));
  check('S5 account A does NOT see account B\'s goal', ra.state === 'ok' && !ra.goals.some((g) => g.id === gb.id));
  check('S6 account B does NOT see account A\'s goal', rb.state === 'ok' && !rb.goals.some((g) => g.id === ga.id) && rb.goals.some((g) => g.id === gb.id));
  check('S7 the preview returns counts only', ra.state === 'ok' && Object.keys(ra.preview).sort().join() === 'attempts,diagnoses,evidence,firstActivity,lastActivity,tasks');

  // direct attempts by B against A's row
  const direct = await (await f(base + '/rest/v1/goals?id=eq.' + ga.id + '&select=id', { headers: hdr(B.token) })).json();
  check('S8 B asking for A\'s goal by id gets nothing', Array.isArray(direct) && direct.length === 0);
  const patch = await f(base + '/rest/v1/goals?id=eq.' + ga.id, { method: 'PATCH', headers: Object.assign(hdr(B.token), { Prefer: 'return=representation' }), body: JSON.stringify({ title: 'hijacked' }) });
  const patched = patch.ok ? await patch.json() : [];
  check('S9 B cannot change A\'s goal', Array.isArray(patched) && patched.length === 0);
  const forged = await f(base + '/rest/v1/goals', { method: 'POST', headers: hdr(B.token), body: JSON.stringify({ user_id: A.id, kind: 'check', title: 'forged for A' }) });
  check('S10 B cannot create a goal owned by A', !forged.ok);
  const delr = await f(base + '/rest/v1/goals?id=eq.' + ga.id, { method: 'DELETE', headers: Object.assign(hdr(A.token), { Prefer: 'return=representation' }) });
  const delj = delr.ok ? await delr.json() : [];
  check('S11 even the owner cannot delete a goal through the API (deletion is a later, controlled step)', !delr.ok || (Array.isArray(delj) && delj.length === 0));

  // signed out
  const anonGoals = await f(base + '/rest/v1/goals?select=id', { headers: hdr(null) });
  const anonBody = anonGoals.ok ? await anonGoals.json() : null;
  check('S12 a signed-out caller gets no goals', !anonGoals.ok || (Array.isArray(anonBody) && anonBody.length === 0));
  const anonPrev = await f(base + '/rest/v1/rpc/preview_workspace_adoption', { method: 'POST', headers: hdr(null), body: '{}' });
  check('S13 a signed-out caller cannot call the preview', !anonPrev.ok);

  // failures must not look like an empty list
  const bad = await clientFor({ id: A.id, token: 'not-a-real-token' }).load();
  check('S14 an invalid session is "unavailable", never an empty goal list', bad.state === 'unavailable' && !bad.goals);
  const gone = await clientFor(A, 'https://nonexistent-' + stamp + '.invalid').load().catch(() => ({ state: 'threw' }));
  check('S15 an unreachable server is "unavailable", never an empty goal list', gone.state === 'unavailable' && !gone.goals);
  const html = goals.panelHtml(bad);
  check('S16 the screen text for a failure does not say there are no goals', !/no saved goals/i.test(html) && /could not be loaded/.test(html));

  // every request went to staging
  const stray = [...new Set(seen)].filter((h) => h !== host && !h.startsWith('nonexistent-'));
  check('S17 every request went to the staging project only', stray.length === 0, 'other hosts: ' + stray.join(','));
  check('S18 the deliberately unreachable test host was the only other address used', [...new Set(seen)].every((h) => h === host || h.startsWith('nonexistent-')));
  console.log('\nRows created in STAGING (remove later): goal ids ' + ga.id + ' and ' + gb.id);
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const e = process.env;
  const need = ['STAGING_URL', 'STAGING_ANON_KEY', 'A_EMAIL', 'A_PASSWORD', 'B_EMAIL', 'B_PASSWORD'].filter((k) => !e[k]);
  if (need.length) { console.log('Missing environment variables: ' + need.join(', ')); process.exit(2); }
  const res = await run({ url: e.STAGING_URL, anonKey: e.STAGING_ANON_KEY, aEmail: e.A_EMAIL, aPassword: e.A_PASSWORD, bEmail: e.B_EMAIL, bPassword: e.B_PASSWORD }, fetch);
  const failed = res.filter((r) => !r.ok).length;
  console.log(`\n${res.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
