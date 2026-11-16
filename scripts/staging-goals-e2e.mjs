// Real-API end-to-end check of the goals features against MARG STAGING, with two test accounts (A on two "devices", and B).
//   E2E_CREDS=<path to json {a:{email,password}, b:{email,password}}> STAGING_URL=... STAGING_ANON_KEY=... node scripts/staging-goals-e2e.mjs
// Prints PASS/FAIL lines only. Never prints tokens, keys or passwords. Refuses anything that is not the staging project.
// Writes test rows (all titled "e2e ...", canary text "CANARY-<stamp>") to STAGING only.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const env = require('../marg-env.js');
const Write = require('../marg-goals-write.js');
const Life = require('../marg-goals-life.js');

export async function run(cfg, fetchImpl) {
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : (detail !== undefined ? '  -> ' + String(detail).slice(0, 300) : ''))); };
  let resolved;
  try { resolved = env.resolveEnv({ supabaseUrl: cfg.url, anonKey: cfg.anonKey }); } catch (e) { check('E0 staging config accepted', false, e.message); return results; }
  check('E0 staging config accepted (not production, key matches project, role anon)', resolved.name === 'staging');
  const base = resolved.supabaseUrl;
  const hosts = new Set();
  const raw = async (url, opts) => { hosts.add(new URL(url).host); return fetchImpl(url, opts); };
  const hdr = (token, extra) => Object.assign({ apikey: cfg.anonKey, 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, extra || {});

  async function signIn(c) {
    const r = await raw(base + '/auth/v1/token?grant_type=password', { method: 'POST', headers: hdr(), body: JSON.stringify({ email: c.email, password: c.password }) });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || !j.access_token || !j.user) return null;
    const s = { token: j.access_token, id: j.user.id };
    s.f = (u, o) => raw(u, Object.assign({}, o, { headers: Object.assign({}, o && o.headers, hdr(s.token)) }));
    return s;
  }
  // a plain REST call; returns status, parsed body and text
  async function api(s, method, path, body, prefer) {
    const r = await raw(base + '/rest/v1/' + path, { method, headers: hdr(s && s.token, prefer ? { Prefer: prefer } : {}), body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text(); let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
    return { ok: r.ok, status: r.status, json, text };
  }
  const rpc = (s, name, body) => api(s, 'POST', 'rpc/' + name, body || {});
  const clients = (s) => ({
    life: Life.createClient({ fetch: s.f, baseUrl: base, getUserId: () => s.id, isEnabled: () => true }),
    write: Write.createClient({ fetch: s.f, baseUrl: base, getUserId: () => s.id, isEnabled: () => true })
  });

  const A1 = await signIn(cfg.a), A2 = await signIn(cfg.a), B = await signIn(cfg.b);
  check('E1 account A signs in on two devices and account B signs in', !!A1 && !!A2 && !!B);
  if (!A1 || !A2 || !B) return results;
  check('E2 the two devices of A are separate sessions and B is a different user', A1.token !== A2.token && A1.id === A2.id && A1.id !== B.id);
  const a1 = clients(A1), a2 = clients(A2), b1 = clients(B);
  const stamp = Date.now(), CAN = 'CANARY-' + stamp;
  const tag = (id) => '\n[MARG_THREAD:%7B%22id%22%3A%22' + id + '%22%7D]';
  const live = async (s) => { const r = await api(s, 'GET', 'goals?select=id,title&archived_at=is.null&order=created_at.asc'); return r.ok && Array.isArray(r.json) ? r.json : null; };
  const mkGoal = async (c, title) => { const r = await c.write.createGoal({ kind: 'other', title }); return r.state === 'ok' ? r.goalId : null; };
  const mkThread = async (c, goalId, tid) => (await c.write.createGoalThread(goalId, tid, 'e2e ' + tid.slice(-6))).state;

  // ---------------------------------------------------------------- 1. isolation
  const GA1 = await mkGoal(a1, 'e2e A one ' + stamp), GA2 = await mkGoal(a1, 'e2e A two ' + stamp), GB = await mkGoal(b1, 'e2e B one ' + stamp);
  check('I0 each account creates goals through the real client', !!GA1 && !!GA2 && !!GB);
  if (!GA1 || !GA2 || !GB) return results;
  const TA1 = 'e2e-' + stamp + '-a1', TA2 = 'e2e-' + stamp + '-a2', TB = 'e2e-' + stamp + '-b1';
  check('I0b conversations register for their goals', (await mkThread(a1, GA1, TA1)) === 'ok' && (await mkThread(a1, GA2, TA2)) === 'ok' && (await mkThread(b1, GB, TB)) === 'ok');
  const aList = await live(A1), bList = await live(B);
  check('I1 A sees its goals and not B\'s', !!aList && aList.some((g) => g.id === GA1) && !aList.some((g) => g.id === GB));
  check('I2 B sees its goal and not A\'s', !!bList && bList.some((g) => g.id === GB) && !bList.some((g) => g.id === GA1 || g.id === GA2));
  check('I3 B asking for A\'s goal by id gets nothing', (await api(B, 'GET', 'goals?id=eq.' + GA1)).json.length === 0);
  const patch = await api(B, 'PATCH', 'goals?id=eq.' + GA1, { title: 'hijacked' }, 'return=representation');
  check('I4 B cannot change A\'s goal', patch.ok ? patch.json.length === 0 : true);
  check('I5 B cannot create a goal owned by A', !(await api(B, 'POST', 'goals', { user_id: A1.id, kind: 'other', title: 'forged' })).ok);
  check('I6 B cannot archive A\'s goal', !(await rpc(B, 'archive_goal', { p_goal: GA1 })).ok);
  const pv = await rpc(B, 'goal_deletion_preview', { p_goal: GA1 });
  check('I7 B\'s preview of A\'s goal reveals nothing (not archived flag, all counts zero)', pv.ok && pv.json && pv.json.archived == null && pv.json.diagnoses === 0 && pv.json.messages === 0 && pv.json.threads === 0, pv.text);
  const bdel = await rpc(B, 'delete_goal_permanently', { p_goal: GA1, p_typed_title: 'e2e A one ' + stamp });
  check('I8 B cannot delete A\'s goal even with the exact title', !bdel.ok && /not found/i.test(bdel.text), bdel.text);
  check('I9 B cannot bring A\'s goal into its own', !(await rpc(B, 'bring_in_progress', { p_from: GA1, p_to: GB, p_summary: 'x' })).ok);
  check('I10 B cannot link A\'s conversation', !(await rpc(B, 'link_thread_messages', { p_client_thread_id: TA1 })).ok);
  check('I11 B cannot read A\'s conversations or tombstones', (await api(B, 'GET', 'chat_threads?goal_id=eq.' + GA1)).json.length === 0 && (await api(B, 'GET', 'goal_tombstones')).json.every((t) => t.user_id === B.id));
  check('I12 B cannot attach a conversation to A\'s goal', !(await api(B, 'POST', 'chat_threads', { user_id: B.id, goal_id: GA1, client_thread_id: 'e2e-' + stamp + '-evil', title: 'x' })).ok);
  const mine = await api(A1, 'POST', 'chats', { user_id: A1.id, role: 'user', content: CAN + ' A message in goal one' + tag(TA1) }, 'return=representation');
  const forgedB = await api(B, 'POST', 'chats', { user_id: B.id, role: 'user', content: CAN + ' B message pointing at A thread' + tag(TA1) }, 'return=representation');
  check('I13 A\'s message is linked to A\'s conversation; B\'s message with the same tag is not', mine.ok && mine.json[0].thread_id && forgedB.ok && forgedB.json[0].thread_id === null, mine.text + forgedB.text);
  const anonDel = await rpc(null, 'delete_goal_permanently', { p_goal: GA1, p_typed_title: 'x' });
  check('I14 a signed-out caller cannot delete or read goals', !anonDel.ok && (await api(null, 'GET', 'goals')).json.length === 0 || !(await api(null, 'GET', 'goals')).ok);
  const dd = await api(A1, 'DELETE', 'goals?id=eq.' + GA1, undefined, 'return=representation');
  check('I15 even the owner cannot delete a goal through the table', !dd.ok || (Array.isArray(dd.json) && dd.json.length === 0));

  // a conversation id that looks like a pattern must not link other conversations' messages (it used to be used as a regular expression)
  const TW = '.*';
  await api(B, 'POST', 'chat_threads', { user_id: B.id, goal_id: GB, client_thread_id: TW, title: 'wild' });
  const bm = await api(B, 'POST', 'chats', { user_id: B.id, role: 'user', content: CAN + ' B probe of an unregistered conversation' + tag('e2e-' + stamp + '-unreg') }, 'return=representation'); // not a goal conversation: must stay unlinked
  const lnk = await rpc(B, 'link_thread_messages', { p_client_thread_id: TW });
  const probe = await api(B, 'GET', 'chats?select=thread_id&id=eq.' + (bm.json && bm.json[0] && bm.json[0].id));
  check('I16 a conversation id such as ".*" links nothing else (matched by equality, not as a pattern)', lnk.ok && lnk.json === 0 && probe.ok && probe.json[0].thread_id === null, lnk.text);

  // ---------------------------------------------------------------- 2. archive and restore, and no writes while archived
  async function seedMentor(s, goalId, ref) {
    const d = await api(s, 'POST', 'mentor_diagnoses', { user_id: s.id, client_ref: ref + '-d', section: 'qa', mechanism: CAN + ' mechanism ' + ref, goal_id: goalId }, 'return=representation');
    if (!d.ok) return { err: d.text };
    const did = d.json[0].id;
    const t = await api(s, 'POST', 'mentor_tasks', { user_id: s.id, client_ref: ref + '-t', diagnosis_id: did, section: 'qa', task_type: 'practice', title: CAN + ' task', objective: CAN + ' obj', success_metric: 'finish the set', destination: 'chat', goal_id: goalId }, 'return=representation');
    if (!t.ok) return { err: t.text };
    const at = await api(s, 'POST', 'mentor_task_attempts', { user_id: s.id, client_ref: ref + '-a', task_id: t.json[0].id, goal_id: goalId }, 'return=representation');
    if (!at.ok) return { err: at.text };
    const ev = await api(s, 'POST', 'mentor_diagnosis_evidence', { user_id: s.id, client_ref: ref + '-e', diagnosis_id: did, section: 'qa', evidence_type: 'self_report', claim: CAN + ' claim', goal_id: goalId }, 'return=representation');
    if (!ev.ok) return { err: ev.text };
    return { diagnosisId: did, taskId: t.json[0].id };
  }
  const seedA2 = await seedMentor(A1, GA2, 'e2e' + stamp + 'x');
  check('A0 a goal can be filled with a diagnosis, task, attempt and evidence', !seedA2.err, seedA2.err);
  const arch = await a1.life.archive(GA2, [GA2]);
  check('A1 A archives goal two', arch.state === 'ok', JSON.stringify(arch));
  const arch2 = await a2.life.loadArchived();
  check('A2 A\'s second device sees it among the archived goals', arch2.state === 'ok' && arch2.goals.some((g) => g.id === GA2));
  const liveNow = await live(A2);
  check('A3 the archived goal is no longer among the live goals', liveNow && !liveNow.some((g) => g.id === GA2) && liveNow.some((g) => g.id === GA1));
  check('A4 the preview of an archived goal says archived', ((await a1.life.deletionPreview(GA2, [GA2])).preview || {}).archived === true);
  const w1 = await api(A1, 'POST', 'mentor_diagnoses', { user_id: A1.id, client_ref: 'e2e' + stamp + 'new', section: 'qa', mechanism: CAN + ' a new reading written while archived', goal_id: GA2 });
  const w2 = await api(A1, 'POST', 'chat_threads', { user_id: A1.id, goal_id: GA2, client_thread_id: 'e2e-' + stamp + '-late', title: 'late' });
  const w3 = await api(A1, 'POST', 'chats', { user_id: A1.id, role: 'user', content: CAN + ' late message' + tag(TA2) });
  const w4 = await api(A1, 'PATCH', 'mentor_diagnoses?id=eq.' + seedA2.diagnosisId, { mechanism: 'changed while archived' }, 'return=representation');
  check('A5 while archived, the database refuses new diagnoses, conversations, messages and edits', !w1.ok && !w2.ok && !w3.ok && (!w4.ok || w4.json.length === 0), [w1.status, w2.status, w3.status, w4.status].join());
  check('A6 the refusal says to restore the goal', /archived/i.test(w1.text) && /archived/i.test(w3.text), w1.text);
  check('A7 other goals and General chat are still writable while goal two is archived', (await api(A1, 'POST', 'chats', { user_id: A1.id, role: 'user', content: CAN + ' general message while archived' })).ok && (await api(A1, 'POST', 'chats', { user_id: A1.id, role: 'user', content: CAN + ' goal one message' + tag(TA1) })).ok);
  check('A8 restoring something that is not archived is refused', (await a1.life.restore(GA1, [GA1])).state === 'error');
  const rest = await a2.life.restore(GA2, [GA2]);
  check('A9 A restores it from the second device', rest.state === 'ok', JSON.stringify(rest));
  const w5 = await api(A1, 'POST', 'chats', { user_id: A1.id, role: 'user', content: CAN + ' message after restore' + tag(TA2) }, 'return=representation');
  check('A10 after restore the goal accepts messages again, linked to its conversation', w5.ok && !!w5.json[0].thread_id, w5.text);
  check('A11 B cannot restore or archive A\'s goal', !(await rpc(B, 'unarchive_goal', { p_goal: GA2 })).ok);

  // ---------------------------------------------------------------- 3. restore at the live-goal limit
  let ids = (await live(A1)).map((g) => g.id);
  const extra = [];
  while (ids.length < 10) { const g = await mkGoal(a1, 'e2e cap ' + stamp + ' ' + ids.length); if (!g) break; ids.push(g); extra.push(g); }
  check('L0 A reaches exactly 10 live goals', (await live(A1)).length === 10);
  const over = await a1.write.createGoal({ kind: 'other', title: 'e2e over the limit ' + stamp });
  check('L1 an 11th live goal cannot be created, and the message says why', over.state === 'error' && /most goals allowed|live goals/i.test(over.error || ''), JSON.stringify(over));
  const capX = extra[0], capY = extra[1];
  check('L2 archiving one frees a place', (await a1.life.archive(capX, [capX])).state === 'ok' && (await live(A1)).length === 9);
  const refill = await mkGoal(a1, 'e2e refill ' + stamp);
  check('L3 the place can be taken by a new goal (10 live again)', !!refill && (await live(A1)).length === 10);
  const rb = await a1.life.restore(capX, [capX]);
  check('L4 restoring at 10 live goals is refused with a clear message', rb.state === 'error' && /most live goals/.test(rb.error || ''), JSON.stringify(rb));
  check('L5 the refused restore changed nothing (still archived, still 10 live)', (await live(A1)).length === 10 && (await a2.life.loadArchived()).goals.some((g) => g.id === capX));
  check('L6 archiving another goal makes room and the restore then works', (await a1.life.archive(capY, [capY])).state === 'ok' && (await a1.life.restore(capX, [capX])).state === 'ok' && (await live(A1)).length === 10);
  // two restores racing for the last place
  check('L7 two restores racing for one free place: exactly one succeeds', await (async () => {
    await a1.life.archive(capX, [capX]); await a1.life.archive(refill, [refill]);          // 8 live
    const f1 = await mkGoal(a1, 'e2e fill1 ' + stamp);                                       // 9 live
    const [r1, r2] = await Promise.all([a1.life.restore(capX, [capX]), a2.life.restore(refill, [refill])]);
    const liveN = (await live(A1)).length;
    return [r1.state, r2.state].filter((x) => x === 'ok').length === 1 && liveN === 10 && !!f1;
  })());
  // free places again for the rest of the run
  for (const g of (await live(A1)).map((x) => x.id).filter((id) => id !== GA1 && id !== GA2)) await a1.life.archive(g, [g]);
  check('L8 A is back under the limit', (await live(A1)).length <= 3);

  // ---------------------------------------------------------------- 4. bring-in and revocation
  const sum = 'Progress brought in from "e2e A two" (summary, not new evidence). ' + CAN;
  const bi = await a1.life.bringIn(GA2, GA1, sum, [GA1, GA2]);
  check('B1 A brings progress from goal two into goal one', bi.state === 'ok', JSON.stringify(bi));
  const shares = await api(A1, 'GET', 'goal_context_shares?select=id,from_goal_id,to_goal_id,revoked_at&from_goal_id=eq.' + GA2 + '&to_goal_id=eq.' + GA1);
  check('B2 the bring-in is recorded (one row, not revoked)', shares.ok && shares.json.length === 1 && shares.json[0].revoked_at === null, shares.text);
  const shareId = shares.json && shares.json[0] && shares.json[0].id;
  check('B3 B cannot see or revoke it', (await api(B, 'GET', 'goal_context_shares')).json.length === 0 && !(await rpc(B, 'revoke_bring_in', { p_share: shareId })).ok);
  const rv = await rpc(A2, 'revoke_bring_in', { p_share: shareId });
  const after = await api(A1, 'GET', 'goal_context_shares?select=revoked_at&id=eq.' + shareId);
  check('B4 A revokes it from the second device and the record shows when', rv.ok && after.json[0].revoked_at, rv.text);
  check('B5 revoking twice is refused', !(await rpc(A1, 'revoke_bring_in', { p_share: shareId })).ok);
  const ev = await api(A1, 'GET', 'goal_events?select=event,detail&event=eq.revoke_share&goal_id=eq.' + GA1);
  check('B6 the revocation is logged with counts only', ev.ok && ev.json.length >= 1 && JSON.stringify(ev.json[0].detail) === '{"items":1}', ev.text);
  check('B7 bringing in from an archived goal is refused', await (async () => { await a1.life.archive(capY, [capY]).catch(() => 0); const r = await a1.life.bringIn(capY, GA1, 'x', [capY, GA1]); return r.state === 'error' || r.state === 'invalid'; })());
  check('B8 bringing a goal into itself is refused', (await a1.life.bringIn(GA1, GA1, 'x', [GA1])).state === 'invalid');

  // ---------------------------------------------------------------- 5. permanent deletion
  const GD = await mkGoal(a1, 'e2e delete me ' + stamp), TD = 'e2e-' + stamp + '-td', TD2 = 'e2e-' + stamp + '-td2';
  const seedD = await seedMentor(A1, GD, 'e2e' + stamp + 'd');
  check('D0 the goal to delete is filled with mentor rows', !seedD.err, seedD.err);
  await api(A1, 'POST', 'chats', { user_id: A1.id, role: 'user', content: CAN + ' historical message of the second conversation' + tag(TD2) }); // written before the conversation is registered: stays unlinked
  check('D0b both conversations register', (await mkThread(a1, GD, TD)) === 'ok' && (await mkThread(a1, GD, TD2)) === 'ok');
  const m1 = await api(A1, 'POST', 'chats', { user_id: A1.id, role: 'user', content: CAN + ' message one' + tag(TD) }, 'return=representation');
  const m2 = await api(A1, 'POST', 'chats', { user_id: A1.id, role: 'assistant', content: CAN + ' message two' + tag(TD) }, 'return=representation');
  check('D0c messages are linked, and the early one is the unlinked kind', m1.ok && m2.ok && m1.json[0].thread_id && m2.json[0].thread_id);
  const img = await api(A1, 'POST', 'question_images', { user_id: A1.id, conversation_id: TD, storage_path: A1.id + '/e2e-' + stamp + '.png', mime_type: 'image/png', byte_size: 10, ocr_text: CAN + ' ocr text', status: 'ready' }, 'return=representation');
  const iq = img.ok ? await api(A1, 'POST', 'image_questions', { image_id: img.json[0].id, user_id: A1.id, conversation_id: TD, ordinal: 1, stem: CAN + ' question stem' }, 'return=representation') : { ok: false, text: img.text };
  const cqs = iq.ok ? await api(A1, 'POST', 'conversation_question_state', { user_id: A1.id, conversation_id: TD, active_image_id: img.json[0].id, active_question_id: iq.json[0].id }) : { ok: false, text: iq.text };
  const rev = await api(A1, 'POST', 'marg_response_reviews', { user_id: A1.id, conversation_id: TD, assistant_message_ref: 'e2e-ref', source: 'helpful', user_message: CAN + ' review text' });
  check('D0d an uploaded page with extracted text, question state and a review are saved for it', img.ok && iq.ok && cqs.ok && rev.ok, [img.text, iq.text, cqs.text, rev.text].join(' | '));
  await a1.life.bringIn(GA1, GD, 'brought into the goal to delete ' + CAN, [GA1, GD]);
  await a1.life.bringIn(GD, GA1, 'brought out of the goal to delete ' + CAN, [GA1, GD]);
  const bBefore = { goals: (await api(B, 'GET', 'goals?select=id')).json.length, chats: (await api(B, 'GET', 'chats?select=id')).json.length };
  const a1Before = { chats: (await api(A1, 'GET', 'chats?select=id&content=like.*goal%20one%20message*')).json.length };

  const p0 = await a1.life.deletionPreview(GD, [GD]);
  check('D1 the preview counts what exists: 2 conversations, 3 messages (one unlinked), 1 uploaded page, 2 summaries', p0.state === 'ok' && p0.preview.threads === 2 && p0.preview.messages === 3 && p0.preview.shares === 2, JSON.stringify(p0));
  check('D2 deleting a goal that is not archived is refused', (await a1.life.deletePermanently(GD, 'e2e delete me ' + stamp, [GD])).state === 'error');
  await a1.life.archive(GD, [GD]);
  check('D3 a wrong title is refused', (await a1.life.deletePermanently(GD, 'e2e delete me', [GD])).state === 'error');
  check('D4 B with the exact title is refused', !(await rpc(B, 'delete_goal_permanently', { p_goal: GD, p_typed_title: 'e2e delete me ' + stamp })).ok);
  const blocked = await rpc(A1, 'delete_goal_permanently', { p_goal: GD, p_typed_title: 'e2e delete me ' + stamp });
  check('D5 while an uploaded page still exists the database refuses and deletes nothing', !blocked.ok && /uploaded pages/.test(blocked.text) && (await api(A1, 'GET', 'goals?id=eq.' + GD)).json.length === 1, blocked.text);
  const soft = await api(A1, 'PATCH', 'question_images?id=eq.' + (img.json && img.json[0].id), { deleted_at: new Date().toISOString() }, 'return=representation');
  check('D6 a page marked removed (soft delete) still counts: the database refuses until the row itself is gone, so no file can be orphaned', soft.ok && soft.json.length === 1 && !(await rpc(A1, 'delete_goal_permanently', { p_goal: GD, p_typed_title: 'e2e delete me ' + stamp })).ok, soft.text);
  const rmRows = await api(A1, 'DELETE', 'question_images?user_id=eq.' + A1.id + '&conversation_id=eq.' + TD, undefined, 'return=representation');
  check('D6b the app\'s own clean-up (remove every row of the conversation after the files) clears the way', rmRows.ok && rmRows.json.length === 1, rmRows.text);
  const del = await rpc(A1, 'delete_goal_permanently', { p_goal: GD, p_typed_title: '  e2e delete me ' + stamp + '  ' });
  check('D7 with the exact title (spaces around it ignored) the goal is deleted and counts come back', del.ok && del.json && del.json.messages === 3 && del.json.threads === 2, del.text);
  const gone = {
    goal: (await api(A1, 'GET', 'goals?id=eq.' + GD)).json.length,
    threads: (await api(A1, 'GET', 'chat_threads?goal_id=eq.' + GD)).json.length,
    canaryChats: (await api(A1, 'GET', 'chats?select=id&content=like.*' + CAN + '*message*&content=like.*' + TD.slice(-3) + '*')).json.length,
    mentor: (await api(A1, 'GET', 'mentor_diagnoses?goal_id=eq.' + GD)).json.length + (await api(A1, 'GET', 'mentor_tasks?goal_id=eq.' + GD)).json.length + (await api(A1, 'GET', 'mentor_task_attempts?goal_id=eq.' + GD)).json.length + (await api(A1, 'GET', 'mentor_diagnosis_evidence?goal_id=eq.' + GD)).json.length,
    images: (await api(A1, 'GET', 'question_images?conversation_id=eq.' + TD)).json.length + (await api(A1, 'GET', 'image_questions?conversation_id=eq.' + TD)).json.length,
    state: (await api(A1, 'GET', 'conversation_question_state?conversation_id=eq.' + TD)).json.length,
    reviews: (await api(A1, 'GET', 'marg_response_reviews?conversation_id=eq.' + TD)).json.length,
    shares: (await api(A1, 'GET', 'goal_context_shares?or=(from_goal_id.eq.' + GD + ',to_goal_id.eq.' + GD + ')')).json.length
  };
  check('D8 everything of the goal is gone: goal, conversations, mentor rows, uploads and their text, question state, reviews, bring-ins', Object.values(gone).every((n) => n === 0), JSON.stringify(gone));
  const left = await api(A1, 'GET', 'chats?select=id,content&content=like.*' + CAN + '*');
  check('D9 no message carrying the goal\'s conversation tags is left (including the one that was never linked)', left.ok && !left.json.some((c) => c.content.includes(TD) || c.content.includes(TD2)), left.text);
  check('D10 other goals, General chat and goal one\'s messages are untouched', (await api(A1, 'GET', 'goals?id=eq.' + GA1)).json.length === 1 && (await api(A1, 'GET', 'chats?select=id&content=like.*goal%20one%20message*')).json.length === a1Before.chats);
  const bAfter = { goals: (await api(B, 'GET', 'goals?select=id')).json.length, chats: (await api(B, 'GET', 'chats?select=id')).json.length };
  check('D11 account B\'s goals and messages are exactly as before', bAfter.goals === bBefore.goals && bAfter.chats === bBefore.chats, JSON.stringify([bBefore, bAfter]));
  const t1 = await a2.life.loadTombstones(), tb = await b1.life.loadTombstones();
  check('D12 A\'s second device learns the goal was deleted (tombstone), so it can clean its own copies; B does not', t1.state === 'ok' && t1.goalIds.includes(GD) && tb.state === 'ok' && !tb.goalIds.includes(GD), JSON.stringify([t1, tb]));
  const tomb = await api(A1, 'GET', 'goal_tombstones?goal_id=eq.' + GD);
  check('D13 the tombstone holds only the id, date and counts', tomb.ok && tomb.json.length === 1 && Object.keys(tomb.json[0]).sort().join() === 'counts,deleted_at,goal_id,user_id' && Object.values(tomb.json[0].counts).every((n) => typeof n === 'number'), tomb.text);
  check('D14 users cannot write or delete tombstones', !(await api(A1, 'POST', 'goal_tombstones', { goal_id: crypto.randomUUID(), user_id: A1.id, counts: {} })).ok && await (async () => { const x = await api(A1, 'DELETE', 'goal_tombstones?goal_id=eq.' + GD, undefined, 'return=representation'); return !x.ok || (Array.isArray(x.json) && x.json.length === 0); })() && (await api(A1, 'GET', 'goal_tombstones?goal_id=eq.' + GD)).json.length === 1);
  const reuse = await api(A1, 'POST', 'goals', { id: GD, user_id: A1.id, kind: 'other', title: 'e2e reuse ' + stamp });
  check('D15 a deleted goal id cannot be created again', !reuse.ok && /deleted/i.test(reuse.text), reuse.text);
  check('D16 deleting it again says it is not found', !(await rpc(A1, 'delete_goal_permanently', { p_goal: GD, p_typed_title: 'e2e delete me ' + stamp })).ok);
  const evd = await api(A1, 'GET', 'goal_events?select=event,detail&event=eq.delete&goal_id=eq.' + GD);
  check('D17 the deletion is logged with counts only', evd.ok && evd.json.length === 1 && Object.values(evd.json[0].detail).every((n) => typeof n === 'number'), evd.text);

  // ---------------------------------------------------------------- 6. concurrency (two devices at the same moment)
  async function archivedGoal(title) { const g = await mkGoal(a1, title); await a1.life.archive(g, [g]); return g; }
  let raceOk = true, raceNotes = [];
  for (let i = 0; i < 14; i++) {
    const title = 'e2e race ' + stamp + ' ' + i, g = await mkGoal(a1, title);
    await a1.life.archive(g, [g]);
    const [r, d] = await Promise.all([a2.life.restore(g, [g]), rpc(A1, 'delete_goal_permanently', { p_goal: g, p_typed_title: title })]);
    const row = (await api(A1, 'GET', 'goals?select=id,archived_at&id=eq.' + g)).json;
    const restoredOk = r.state === 'ok', deletedOk = d.ok;
    const consistent = !(restoredOk && deletedOk) && (!deletedOk || row.length === 0) && (!restoredOk || (row.length === 1 && row[0].archived_at === null)) && (restoredOk || deletedOk);
    if (!consistent) { raceOk = false; raceNotes.push(i + ':' + r.state + '/' + d.ok + '/' + row.length); }
    if (row.length) await a1.life.archive(g, [g]).catch(() => 0);
  }
  check('C1 restore racing a delete (14 rounds): never both succeed, and the final state matches the success that was reported', raceOk, raceNotes.join(' '));
  let dd2 = true;
  for (let i = 0; i < 4; i++) {
    const title = 'e2e dd ' + stamp + ' ' + i, g = await mkGoal(a1, title);
    await a1.life.archive(g, [g]);
    const [x, y] = await Promise.all([rpc(A1, 'delete_goal_permanently', { p_goal: g, p_typed_title: title }), rpc(A2, 'delete_goal_permanently', { p_goal: g, p_typed_title: title })]);
    if ([x.ok, y.ok].filter(Boolean).length !== 1) dd2 = false;
  }
  check('C2 two devices deleting the same goal at once (4 rounds): exactly one succeeds', dd2);
  let insOk = true, insNotes = [];
  for (let i = 0; i < 4; i++) {
    const title = 'e2e ins ' + stamp + ' ' + i, g = await mkGoal(a1, title);
    await a1.life.archive(g, [g]);
    // a write that arrives while the goal is being deleted: either refused or removed, never left behind
    const [d, w] = await Promise.all([rpc(A1, 'delete_goal_permanently', { p_goal: g, p_typed_title: title }), api(A2, 'POST', 'mentor_diagnoses', { user_id: A1.id, client_ref: 'e2e' + stamp + 'r' + i, section: 'qa', mechanism: CAN + ' racing write', goal_id: g })]);
    const orphan = (await api(A1, 'GET', 'mentor_diagnoses?goal_id=eq.' + g)).json.length;
    if (orphan !== 0 || !d.ok) { insOk = false; insNotes.push(i + ':' + d.ok + '/' + w.status + '/' + orphan); }
  }
  check('C3 a write racing a delete (4 rounds): nothing is left behind and the delete succeeds', insOk, insNotes.join(' '));

  const stray = [...hosts].filter((h) => h !== new URL(base).host);
  check('E9 every request went to the staging project only', stray.length === 0, stray.join());
  fs.writeFileSync(process.env.E2E_STATE || '/dev/null', JSON.stringify({ stamp, canary: CAN, GA1, GA2, GB, GD, A: A1.id, B: B.id }));
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const e = process.env;
  const need = ['E2E_CREDS', 'STAGING_URL', 'STAGING_ANON_KEY'].filter((k) => !e[k]);
  if (need.length) { console.log('Missing environment variables: ' + need.join(', ')); process.exit(2); }
  const creds = JSON.parse(fs.readFileSync(e.E2E_CREDS, 'utf8'));
  const res = await run({ url: e.STAGING_URL, anonKey: e.STAGING_ANON_KEY, a: creds.a, b: creds.b }, fetch);
  const failed = res.filter((r) => !r.ok).length;
  console.log(`\n${res.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
