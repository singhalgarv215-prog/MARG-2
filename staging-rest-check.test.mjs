// Self-test for scripts/staging-rest-check.mjs using an in-memory fake of the staging API (no network).
// A correct fake must give all PASS; fakes with a deliberate leak must make the script FAIL.
import { run } from './scripts/staging-rest-check.mjs';

const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const REF = 'hmgdzkszzuaivyqeeitu';
const KEY = b({ alg: 'HS256' }) + '.' + b({ ref: REF, role: 'anon' }) + '.sig';
const cfg = { url: `https://${REF}.supabase.co`, anonKey: KEY, aEmail: 'a@x.invalid', aPassword: 'pa', bEmail: 'b@x.invalid', bPassword: 'pb' };

function fake(opts) {
  opts = opts || {};
  const users = { 'a@x.invalid': { pw: 'pa', id: 'a0000000-0000-4000-8000-00000000000a', tok: 'tokA' }, 'b@x.invalid': { pw: 'pb', id: 'b0000000-0000-4000-8000-00000000000b', tok: 'tokB' } };
  const byTok = Object.fromEntries(Object.values(users).map((u) => [u.tok, u]));
  const rows = [];
  let n = 0;
  const res = (status, body) => ({ ok: status < 300, status, json: async () => body });
  return async (url, o) => {
    o = o || {};
    const u = new URL(url);
    if (u.host !== `${REF}.supabase.co`) throw new Error('unreachable');
    const auth = (o.headers && (o.headers.Authorization || '')).replace('Bearer ', '');
    const me = byTok[auth];
    const m = o.method || 'GET';
    if (u.pathname === '/auth/v1/token') { const q = JSON.parse(o.body); const us = users[q.email]; return us && us.pw === q.password ? res(200, { access_token: us.tok, user: { id: us.id } }) : res(400, {}); }
    if (u.pathname === '/rest/v1/goals') {
      if (!me && !opts.anonReads) return res(200, []);
      if (me === undefined && auth) return res(401, {});
      if (m === 'POST') { const r = JSON.parse(o.body); if (r.user_id !== me.id && !opts.allowForge) return res(403, {}); const row = { id: 'c0000000-0000-4000-8000-' + String(++n).padStart(12, '0'), user_id: r.user_id, kind: r.kind, title: r.title, status: 'active', origin: 'created', archived_at: null }; rows.push(row); return res(201, [row]); }
      if (m === 'PATCH') { const id = u.searchParams.get('id').replace('eq.', ''); const mine = rows.filter((x) => x.id === id && (x.user_id === me.id || opts.allowCrossWrite)); mine.forEach((x) => Object.assign(x, JSON.parse(o.body))); return res(200, mine); }
      if (m === 'DELETE') return res(403, {});
      let list = opts.leak ? rows.slice() : rows.filter((x) => me && x.user_id === me.id);
      const idq = u.searchParams.get('id'); if (idq) list = list.filter((x) => x.id === idq.replace('eq.', ''));
      return res(200, list);
    }
    if (u.pathname === '/rest/v1/rpc/preview_workspace_adoption') return me ? res(200, { diagnoses: 0, tasks: 0, attempts: 0, evidence: 0, first_activity: null, last_activity: null }) : res(401, {});
    return res(404, {});
  };
}
async function runQuiet(f, c) { const log = console.log; console.log = () => {}; try { return await run(c || cfg, f); } finally { console.log = log; } }

let pass = 0, fail = 0;
const check = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n); };

const good = await runQuiet(fake());
check('T1 a correct staging API passes every check', good.length >= 18 && good.every((r) => r.ok));
if (!(good.length >= 18 && good.every((r) => r.ok))) console.log('   failing:', good.filter((r) => !r.ok).map((r) => r.name).join(' | '), 'count', good.length);
const leak = await runQuiet(fake({ leak: true }));
check('T2 a list that leaks the other account\'s goals is caught', leak.some((r) => !r.ok && /S5|S6/.test(r.name)));
const cross = await runQuiet(fake({ allowCrossWrite: true }));
check('T3 a cross-account edit is caught', cross.some((r) => !r.ok && /S9/.test(r.name)));
const forge = await runQuiet(fake({ allowForge: true }));
check('T4 forging a goal for another user is caught', forge.some((r) => !r.ok && /S10/.test(r.name)));
const anon = await runQuiet(fake({ anonReads: true, leak: true }));
check('T5 signed-out reads of goals are caught', anon.some((r) => !r.ok && /S12/.test(r.name)));
const prod = await runQuiet(fake(), Object.assign({}, cfg, { url: 'https://kduqtrumhveteyjkyltf.supabase.co' }));
check('T6 a production URL is refused before any request', prod.length === 1 && !prod[0].ok);
let calls = 0; const counting = async () => { calls++; throw new Error('x'); };
await runQuiet(counting, Object.assign({}, cfg, { url: 'https://kduqtrumhveteyjkyltf.supabase.co' }));
check('T7 no request at all is made for a production URL', calls === 0);
const badPw = await runQuiet(fake(), Object.assign({}, cfg, { aPassword: 'wrong' }));
check('T8 wrong password stops with a clear failure and no data call', badPw.some((r) => !r.ok && /S1/.test(r.name)) && badPw.length <= 3);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
