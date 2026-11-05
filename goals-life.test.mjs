// P4.6 tests: archive, bring in and permanent deletion (marg-goals-life.js). Run: node goals-life.test.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const L = require('./marg-goals-life.js');

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, detail || ''); } }
const A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', B = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';
const res = (status, body, text) => ({ ok: status < 300, status, json: async () => body, text: async () => text || '' });
function mk(opts) {
  opts = opts || {};
  const calls = [];
  let user = opts.user === undefined ? 'user-a' : opts.user;
  const client = L.createClient({ baseUrl: 'https://stg.example', getUserId: () => user, isEnabled: () => opts.enabled !== false,
    fetch: async (url, o) => { calls.push({ m: (o && o.method) || 'GET', url, body: o && o.body ? JSON.parse(o.body) : null }); return opts.onFetch ? opts.onFetch(url, o, (u) => { user = u; }) : res(200, null); } });
  return { client, calls };
}
const PREVIEW = { archived: 1, diagnoses: 2, tasks: 3, attempts: 4, evidence: 5, threads: 1, messages: 9, shares: 1, consents: 1 };

// ---- bring-in text
const loop = { diagnoses: [{ status: 'confirmed', mechanism: 'Works the method <b>too</b> slowly\nand skips checks' }, { status: 'hypothesis', mechanism: 'Maybe rushes' }, { status: 'supported', mechanism: 'Third' }, { status: 'inconclusive', mechanism: 'Fourth is dropped' }, { status: 'rejected', mechanism: 'REJECTED-ONE' }, { status: 'superseded', mechanism: 'OLD-ONE' }], attempts: [{}, {}], tasks: [{}] };
const sum = L.buildBringInSummary('Goal "A" <i>x</i>', loop);
check('S1 the summary states counts from saved rows only', /2 observed attempts, 1 saved check, 4 working reads/.test(sum));
check('S2 each read keeps its evidence level and a hypothesis is never presented as fact', /confirmed by repeated evidence\): Works the method too slowly and skips checks/.test(sum) && /a working hypothesis, not confirmed\): Maybe rushes/.test(sum) && /supported once\): Third/.test(sum));
check('S3 rejected and superseded reads are left out, and at most three reads are shown', !/REJECTED-ONE|OLD-ONE|Fourth/.test(sum));
check('S4 markup and line breaks in saved text cannot change the structure of the message', !/<b>|<i>/.test(sum) && sum.split('\n').length === 5, sum);
check('S5 it says plainly that it is a summary and not new evidence', /not new evidence/.test(sum));
check('S6 with nothing saved it says so and invents nothing', /No working read has been saved there yet/.test(L.buildBringInSummary('Empty', { diagnoses: [], attempts: [], tasks: [] })) && /0 observed attempts, 0 saved checks, 0 working reads/.test(L.buildBringInSummary('Empty', {})));
check('S7 the text is capped well under the 2000 character database limit', L.buildBringInSummary('T', { diagnoses: new Array(50).fill({ status: 'confirmed', mechanism: 'x'.repeat(500) }), attempts: [], tasks: [] }).length <= 1800);

// ---- client: off
const off = mk({ enabled: false }), so = mk({ user: null });
check('C1 flag off or signed out: no network call for any action', (await off.client.archive(A, [A])).state === 'off' && (await off.client.restore(A, [A])).state === 'off' && (await off.client.loadArchived()).state === 'off' && (await off.client.deletionPreview(A, [A])).state === 'off' && (await off.client.deletePermanently(A, 'T', [A])).state === 'off' && (await off.client.loadTombstones()).state === 'off' && (await off.client.bringIn(A, B, 'x', [A, B])).state === 'off' && (await off.client.linkThread('thread-1')).state === 'off' && (await so.client.archive(A, [A])).state === 'off' && off.calls.length === 0 && so.calls.length === 0);

// ---- archive and restore
const ar = mk({ onFetch: async () => res(204, null) });
check('A1 archive is one call to the archive function for a goal on screen', (await ar.client.archive(A, [A, B])).state === 'ok' && ar.calls.length === 1 && /rpc\/archive_goal$/.test(ar.calls[0].url) && ar.calls[0].body.p_goal === A);
check('A2 restore is one call to the restore function', (await ar.client.restore(B, [B])).state === 'ok' && /rpc\/unarchive_goal$/.test(ar.calls[1].url));
check('A3 a goal that is not on screen or a malformed id sends nothing', (await ar.client.archive(B, [A])).state === 'invalid' && (await ar.client.restore('x', ['x'])).state === 'invalid' && ar.calls.length === 2);
check('A4 hitting the live-goal limit on restore says so in plain words', /most live goals allowed/.test((await mk({ onFetch: async () => res(400, null, 'Goal limit reached (10 live goals)') }).client.restore(A, [A])).error));
check('A5 a failure says nothing changed', /Nothing changed/.test((await mk({ onFetch: async () => { throw new Error('x'); } }).client.archive(A, [A])).error));
const la = await mk({ onFetch: async () => res(200, [{ id: A, title: 'T', status: 'active', origin: 'created', archived_at: '2026-11-01T10:00:00Z' }, { id: 'bad' }, null]) }).client.loadArchived();
check('A6 archived goals load read-only, malformed rows dropped', la.state === 'ok' && la.goals.length === 1 && la.goals[0].id === A);
check('A7 a failed read of archived goals is "unavailable", not an empty list', (await mk({ onFetch: async () => res(500) }).client.loadArchived()).state === 'unavailable' && (await mk({ onFetch: async () => res(200, {}) }).client.loadArchived()).state === 'unavailable');

// ---- deletion
const dp = await mk({ onFetch: async () => res(200, PREVIEW) }).client.deletionPreview(A, [A]);
check('D1 the dry run returns counts only', dp.state === 'ok' && dp.preview.messages === 9 && dp.preview.archived === true);
check('D2 a malformed or negative dry-run answer is unavailable', (await mk({ onFetch: async () => res(200, { ...PREVIEW, tasks: -1 }) }).client.deletionPreview(A, [A])).state === 'unavailable' && (await mk({ onFetch: async () => res(200, { diagnoses: 1 }) }).client.deletionPreview(A, [A])).state === 'unavailable');
const del = mk({ onFetch: async () => res(200, { tasks: 3 }) });
check('D3 deleting posts the typed title exactly as typed, to the one deletion function', (await del.client.deletePermanently(A, '  My goal ', [A])).state === 'ok' && del.calls.length === 1 && /rpc\/delete_goal_permanently$/.test(del.calls[0].url) && del.calls[0].body.p_typed_title === '  My goal ' && del.calls[0].body.p_goal === A);
check('D4 no typed title, an unknown goal or a malformed id sends nothing', (await del.client.deletePermanently(A, '   ', [A])).state === 'invalid' && (await del.client.deletePermanently(B, 'x', [A])).state === 'invalid' && (await del.client.deletePermanently('x', 'x', ['x'])).state === 'invalid' && del.calls.length === 1);
check('D5 refusals are explained: wrong title, not archived, and anything else says nothing was deleted', /title you typed does not match/.test((await mk({ onFetch: async () => res(400, null, 'the typed title does not match') }).client.deletePermanently(A, 'x', [A])).error) && /Archive this goal first/.test((await mk({ onFetch: async () => res(400, null, 'archive the goal before deleting it permanently') }).client.deletePermanently(A, 'x', [A])).error) && /Nothing was deleted/.test((await mk({ onFetch: async () => res(500) }).client.deletePermanently(A, 'x', [A])).error));
const slowGate = (() => { let release; const gate = new Promise((r) => { release = r; }); return { gate, release }; })();
const slow = mk({ onFetch: async () => { await slowGate.gate; return res(200, {}); } });
const dp1 = slow.client.deletePermanently(A, 'x', [A]); const dp2 = await slow.client.deletePermanently(A, 'x', [A]); slowGate.release(); await dp1;
check('D6 a double press sends one request', dp2.state === 'busy' && slow.calls.length === 1);
check('D7 account switched during the delete: the result is discarded, not shown to the other account', (await mk({ onFetch: async (u, o, set) => { set('user-b'); return res(200, {}); } }).client.deletePermanently(A, 'x', [A])).state === 'stale');
const tb = await mk({ onFetch: async () => res(200, [{ goal_id: A }, { goal_id: 'x' }, null]) }).client.loadTombstones();
check('D8 tombstones load as goal ids only; a failed read is unavailable', tb.state === 'ok' && tb.goalIds.length === 1 && (await mk({ onFetch: async () => res(500) }).client.loadTombstones()).state === 'unavailable');

// ---- bring in
const bi = mk({ onFetch: async () => res(200, 'share-id') });
check('B1 bringing in is one call with the exact text', (await bi.client.bringIn(A, B, 'the text', [A, B])).state === 'ok' && bi.calls.length === 1 && bi.calls[0].body.p_summary === 'the text' && bi.calls[0].body.p_from === A && bi.calls[0].body.p_to === B);
check('B2 the same goal, an unknown goal, empty or over-long text sends nothing', (await bi.client.bringIn(A, A, 'x', [A])).state === 'invalid' && (await bi.client.bringIn(A, B, 'x', [A])).state === 'invalid' && (await bi.client.bringIn(A, B, '  ', [A, B])).state === 'invalid' && (await bi.client.bringIn(A, B, 'x'.repeat(2001), [A, B])).state === 'invalid' && bi.calls.length === 1);
check('B3 a failure says nothing was added', /Nothing was added/.test((await mk({ onFetch: async () => res(500) }).client.bringIn(A, B, 'x', [A, B])).error));
check('B4 linking a conversation validates the id', (await bi.client.linkThread('x')).state === 'invalid' && (await bi.client.linkThread('thread-0001')).state === 'ok');

// ---- screens
const gs = [{ id: A, title: 'Goal <b>A</b>', archivedAt: '2026-11-01T10:00:00Z' }, { id: B, title: 'Goal B', archivedAt: '2026-10-01T10:00:00Z' }];
const plain = L.archivedHtml(gs, null);
check('H1 each archived goal offers restore and a separate delete step; no delete screen is open by default', (plain.match(/>Restore</g) || []).length === 2 && (plain.match(/>Delete permanently[^<]*</g) || []).length === 2 && !/goal-delete"/.test(plain) && !/Type the goal/.test(plain));
const open = L.archivedHtml(gs, { goalId: A, preview: { state: 'ok', preview: { archived: true, diagnoses: 2, tasks: 3, attempts: 4, evidence: 5, threads: 1, messages: 9, shares: 1, consents: 1 } } });
check('H2 the delete screen opens for that goal only and shows the counts', (open.match(/goal-delete"/g) || []).length === 1 && /2 diagnoses, 3 saved checks, 4 attempts, 5 evidence items, 1 conversations with 9 messages, 1 progress summaries/.test(open));
check('H3 it says it cannot be undone and what else is touched (other goals, brought-in items, other devices)', /cannot be undone/.test(open) && /Your other goals and General Chat are not touched/.test(open) && /brought into another goal from this one is removed/.test(open) && /other devices the next time you sign in/.test(open));
check('H4 it discloses what is NOT removed (profile, reminders and shared links, unattached uploads, check-ins, feedback, provider and model-improvement copies, backups)', ['account profile', 'reminders and shared question links', 'check-ins', 'feedback you sent', 'AI provider', 'model improvement', 'backups until they expire'].every((t) => open.includes(t)) && /Not removed by this step/.test(open));
check('H5 the confirm button starts disabled and needs the typed title', /id="goal-delete-confirm" disabled/.test(open) && /Type the goal's title to confirm/.test(open));
const noPrev = L.archivedHtml(gs, { goalId: A, preview: { state: 'unavailable' } });
check('H6 if the dry run failed there is no confirm button and it says nothing has changed', /Could not check what would be deleted/.test(noPrev) && !/goal-delete-confirm/.test(noPrev));
check('H7 titles are escaped', !/<b>A/.test(plain) && /Goal &lt;b&gt;A&lt;\/b&gt;/.test(plain));
check('H8 every button is at least 44px tall with 16px text', [plain, open, L.manageHtml(gs), L.bringInHtml({ title: 'T' }, gs, { text: 'x' })].every((h) => (h.match(/<button[^>]*>/g) || []).length > 0 && (h.match(/<button[^>]*>/g) || []).every((b) => /min-height:44px/.test(b) && /font-size:16px/.test(b))));
const bih = L.bringInHtml({ title: 'Target' }, [{ id: A, title: 'Source <i>1</i>' }], { text: 'Exact <b>text</b>\nline two' });
check('H9 the bring-in preview shows the exact text (escaped) and nothing is added without the confirm press', /Exact &lt;b&gt;text&lt;\/b&gt;\nline two/.test(bih) && /margLifeBringInConfirm/.test(bih) && !/margLifeBringInConfirm/.test(L.bringInHtml({ title: 'T' }, [{ id: A, title: 'S' }], null)));
check('H10 with no other goal it says so and offers nothing', /no other active goal/.test(L.bringInHtml({ title: 'T' }, [], null)) && !/<button/.test(L.bringInHtml({ title: 'T' }, [], null)));
check('H11 a list of archived goals with nothing in it says so', /No archived goals/.test(L.archivedHtml([], null)));

// ---- source rules
const src = fs.readFileSync('marg-goals-life.js', 'utf8');
const rpcs = [...new Set((src.match(/rpc\('([a-z_]+)'/g) || []).map((s) => s.slice(5, -1)))].sort().join();
check('X1 it calls exactly these database functions', rpcs === ['archive_goal', 'bring_in_progress', 'delete_goal_permanently', 'goal_deletion_preview', 'link_thread_messages', 'revoke_bring_in', 'unarchive_goal'].sort().join(), rpcs);
check('X2 its own reads are the archived goals list and the tombstones, and it never sends DELETE, PATCH or PUT', !/(DELETE|PATCH|PUT)/.test(src) && JSON.stringify([...new Set(src.match(/\/rest\/v1\/[a-z_]+(\/rpc\/)?/g) || [])].sort()) === JSON.stringify(['/rest/v1/goal_tombstones', '/rest/v1/goals', '/rest/v1/rpc'].sort()));
check('X3 no exam or section names', !/\b(CAT|VARC|DILR|QA)\b/.test(src));
check('X4 plain ASCII', !/[^\x00-\x7F]/.test(src));

// ---- pre-rollout hardening (P4.7): revoke a bring-in, uploaded pages in the preview, clear messages
const SID = 'cccccccc-1111-4111-8111-cccccccccccc';
const rv = mk({ onFetch: async () => res(200, null) });
check('R1 revoking is one call with the share id', (await rv.client.revokeBringIn(SID)).state === 'ok' && rv.calls.length === 1 && /rpc\/revoke_bring_in$/.test(rv.calls[0].url) && rv.calls[0].body.p_share === SID);
check('R2 a bad id sends nothing', (await rv.client.revokeBringIn('nope')).state === 'invalid' && (await rv.client.revokeBringIn(null)).state === 'invalid' && rv.calls.length === 1);
check('R3 a failure says nothing changed', /Nothing changed/.test((await mk({ onFetch: async () => res(400, null, 'not found') }).client.revokeBringIn(SID)).error));
check('R4 flag off or signed out: no call', (await mk({ enabled: false }).client.revokeBringIn(SID)).state === 'off' && (await mk({ user: null }).client.revokeBringIn(SID)).state === 'off');
const bid = mk({ onFetch: async () => res(200, SID) });
check('R5 bringing in returns the id of the record so it can be revoked', (await bid.client.bringIn(A, B, 'x', [A, B])).shareId === SID);
const noid = await mk({ onFetch: async () => res(200, 'not-a-uuid') }).client.bringIn(A, B, 'x', [A, B]);
check('R6 an unexpected answer gives no id rather than a wrong one', noid.state === 'ok' && noid.shareId === null);
check('R7 the preview carries uploaded pages when the database reports them, and 0 when it does not', L.validPreview(Object.assign({}, PREVIEW, { images: 2 })).images === 2 && L.validPreview(PREVIEW).images === 0 && L.validPreview(Object.assign({}, PREVIEW, { images: -1 })).images === 0 && L.validPreview(Object.assign({}, PREVIEW, { images: 1.5 })).images === 0);
const withImg = L.deleteScreenHtml({ id: A, title: 'T' }, { state: 'ok', preview: L.validPreview(Object.assign({}, PREVIEW, { images: 2 })) });
check('R8 the delete screen names uploaded pages and their extracted text; with none it does not mention them', /2 uploaded question pages \(and the text read from them\)/.test(withImg) && !/uploaded question page/.test(L.deleteScreenHtml({ id: A, title: 'T' }, { state: 'ok', preview: L.validPreview(PREVIEW) })));
const dpErr = async (text) => (await mk({ onFetch: async () => res(400, null, text) }).client.deletePermanently(A, 'T', [A])).error;
check('R9 database refusals become plain sentences', /uploaded pages .* Nothing was deleted/.test(await dpErr('remove the uploaded pages of this goal first')) && /changed on another device/.test(await dpErr('the goal changed while it was being deleted; nothing was deleted')) && /Restore it first/.test(await dpErr('this goal is archived; restore it first')));
const idx = fs.readFileSync('index.html', 'utf8');
check('X5 index.html loads it before the app code', idx.indexOf('/marg-goals-life.js') > idx.indexOf('/marg-goals-share.js') && idx.indexOf('/marg-goals-life.js') < idx.indexOf('/chat-topics.js'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
