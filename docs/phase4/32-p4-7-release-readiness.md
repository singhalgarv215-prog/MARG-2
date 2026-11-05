# P4.7 pre-rollout hardening: release-readiness report

Scope: MARG Staging only. Production was not changed. The Worker spending ledger was not touched. Nothing is committed, pushed, merged or deployed. All work is in the worktree `claude/phase4-goals`.

Test accounts: two accounts were created on STAGING for this phase (`p47-a-...@example.test`, `p47-b-...@example.test`). Their passwords are in a private file in the session scratchpad and were never printed. Staging also holds rehearsal data (about 55,000 messages, test goals, tombstones). Remove them before any real use: see section 9.

## Summary table

| # | Release blocker | Result |
|---|---|---|
| 1 | Independent security review of the deletion function | **PASS, with conditions** (see 1) |
| 2 | chats.thread_id: validate FK, backfill, rollback, rehearse on non-empty data | **PASS on staging**; production rehearsal NOT VERIFIED (see 2) |
| 3 | Real authenticated staging REST verification, two accounts | **PASS** 76/76 (see 3) |
| 4 | Retention policy documented without inventing guarantees | **PASS as documentation**; the policy itself is NOT DECIDED (see 4) |
| 5 | Lifecycle gaps | Archived writes: **PASS (fixed)**. Restore at the limit: **PASS (fixed, was a real bug)**. Bring-in revocation: **PASS for data and client; no screen**. Profile fields: **documented, not changed** (see 5) |

## 1. Independent review of the SECURITY DEFINER deletion function

Who reviewed: a fresh AI reviewer (the read-only `marg-reviewer` agent) with no access to my reasoning, a database or the network. It is independent of me but **it is not a human security engineer**. I checked the facts it could not (owner, ACL, search path, schema privileges) on the live staging catalog.

Live facts (Verified, staging): function owner `postgres` (bypasses RLS, not superuser); `search_path` is empty; execute granted to `authenticated` and `service_role` only (not `anon`, not `public`); `authenticated` has no CREATE on schema `public` and no USAGE on schema `private`. The Supabase advisor lists the function once as "signed-in users can execute a SECURITY DEFINER function", which is the intended design.

Findings and what happened:

| # | Reviewer finding | Severity | Result |
|---|---|---|---|
| 1 | Uploaded question pages and their extracted text survived deletion (`question_images`, `image_questions`) | HIGH | Fixed. The database now deletes the rows, refuses if any uploaded-page row remains (the app removes files first), and the preview counts pages. Real-API checks D5, D6, D8 |
| 2 | Messages not linked to their conversation survived and reappeared under General | MODERATE | Fixed. Deletion also finds messages by their conversation tag. Check D9 (including a message written before the conversation existed) |
| 3 | A concurrent restore could be overtaken by a delete (permanent loss of a goal the student had just restored) | MODERATE | Fixed with a row lock plus a final re-check. Check C1 |
| 4 | A deleted goal id could be created again, making that goal impossible to delete | MODERATE | Fixed. Tombstone key is (user, goal); creating a tombstoned id is refused. Check D15 |
| 5 | The preview helper resolved names from `public` before `pg_catalog` | MINOR | Fixed (search path order) |
| 6 | Titles with leading or trailing spaces could never match | MINOR | Fixed (both sides trimmed). Check D7 |
| 7 | `link_thread_messages` built a regular expression from user text | MINOR | Fixed (equality). Check I16 |
| 8 | Users can forge rows in `goal_events` | MINOR | Not changed. `goal_events` is not evidence; the tombstone table is. Documented in report 31 |

What the reviewer checked and found sound: every statement is scoped by user and goal; `client_thread_id` collisions between users cannot cross; search path inside the function; ACL; no delete triggers; FK ordering; concurrent child inserts roll back safely; double delete is serialised.

Re-review of the fixes (same reviewer, second pass, read-only): findings 3 to 7 closed; 1 and 2 closed for the real app paths with narrow gaps; 8 accepted. It also found:
- **[MODERATE] The backfill could not resume** (it always reprocessed the first N users). **Fixed**: it now takes a cursor (`backfill_chat_thread_ids(after_user, max_users)` returns `linked`, `last_user`, `done`). Verified on staging one user per call: 5,000, then 30,028, then `done`.
- **[MINOR] Soft-deleted upload rows could be removed by the function while their files stay in storage.** **Fixed**: the database now refuses while ANY upload row of the goal's conversations exists, soft-deleted or not (the app deletes all rows after the files). Real-API checks D6 and D6b.
- **[MINOR] An upload committed in the instant between the check and the delete** could be deleted as a row with its file orphaned (that table has no foreign key to goals, so the goal lock does not stop it). **Not fixed; accepted** (needs a stale device uploading to a goal at the moment of deletion).
- **[MINOR] A rare deadlock** (a device updating a task and then inserting an attempt at the very moment of deletion): one of the two sessions fails cleanly with code 40P01 and nothing is half-done. **Accepted.**
- **[MINOR] Conversation ids that are not plain UUIDs** (containing `%`, `]` or characters the app URL-encodes) cannot be matched by tag, and untagged "legacy" messages added after linking have no thread link; the app only creates UUID ids today. **Accepted, documented.**
- Locking order, the archived-write triggers against adoption/undo/delete, the inline pattern and the tombstone key change: no problem found. Stale offline devices writing to an archived goal will get a 23514 refusal; the app's save queue retries and then shows "gave up".

Reviewer's verdict: ship to staging for the next test round; before production make the backfill resumable (done), cover soft-deleted files (done), and decide on the accepted deadlock and refusals.

Condition: get one human security review before production. Also still open from the reviewer's list of "could not check": what other triggers exist on `chats` in production, whether any cron or edge function purges storage, and the contents of `marg_eval_cases`.

## 2. chats.thread_id migration

Verified on staging with non-empty data (55,000 messages: 30,000 in three goal conversations for account A, 5,000 for account B, 20,000 General):

- **Backfill**: linked 35,000 messages; General left at 0 linked; second run linked 0 (idempotent). The first version took 50 s because of a regex repetition bound `{1,160}`; with the bound removed and each message's tag read once it takes **2.5 s**. The same fix makes the insert-time trigger fast (5,000 tagged inserts in 0.58 s).
- **Foreign key validation**: `validate constraint chats_thread_fk` took 0.06 s and succeeded after the backfill.
- **Rollback (hardening)**: `20261106000100_prerollout_hardening.rollback.sql` was generated from the exact earlier definitions and run on the full data inside a transaction that was then rolled back: 55,000 messages, 35,000 links, 3 goals, 4 conversations unchanged; earlier definitions restored; FK stayed valid.
- **Rollback and re-apply of the thread_id migration** (`...goal_lifecycle.rollback.sql`, new): dropping the column and adding it back on the same 55,000-row table succeeded (all structural steps are metadata-only), links reset to 0 as expected, data intact. Rolled back afterwards.
- The migration file and the live staging functions were compared by hash of the function bodies: identical (three differ only by comments). A history row `p4_7_prerollout_hardening` was added to staging's migration table.

Not verified: the rehearsal used generated data. Production's real message volume, lock behaviour under live traffic, and any production-only triggers on `chats` are unknown. Rehearse on a restored copy of production, not on production. Run the backfill in batches (`select private.backfill_chat_thread_ids();` then again with the returned `last_user` until `done`), then validate the FK.

## 3. Real authenticated staging API verification

`scripts/staging-goals-e2e.mjs`: signs in A on **two separate sessions (two devices)** and B, calls the real REST API with the real client modules (no stubs). **75 passed, 0 failed.** All requests went to the staging host only.

Covered:
- **Isolation** (I1 to I16): lists, direct reads, patches, forged owners, archive, preview, delete (even with the exact title), bring-in, link, conversations, tombstones, signed-out calls, direct table delete.
- **Archive and restore** (A1 to A11), including the second device seeing the archive and the restore, and the database refusing new diagnoses, conversations, messages and edits while archived, while other goals and General stay writable.
- **Live-goal limit** (L0 to L8): at 10 live goals an 11th is refused with a clear message; restore at 10 is refused with a clear message and changes nothing; two restores racing for the last place: exactly one wins.
- **Bring-in** (B1 to B8): record, other account cannot see or revoke, revoke from the second device, revoking twice refused, event logged with counts only, from an archived goal refused.
- **Deletion** (D0 to D17): full goal with mentor rows, two conversations, an unlinked message, an uploaded page with extracted text, question state, a review, bring-ins both ways. Refused when not archived, wrong title, other account, live uploaded page. Then deleted: everything gone, other goal / General / account B untouched, tombstone visible to the second device and not to B, tombstone contains only id, date and counts, users cannot write or delete tombstones, deleted id cannot be reused, deleting twice refused.
- **Concurrency** (C1 to C3): restore racing delete (14 rounds), two devices deleting at once (4 rounds), a write racing a delete (4 rounds).
- Canary scan afterwards: 234 columns, hits only the goal id inside `goal_events` (3) and `goal_tombstones` (1).

Mutation check (deliberately breaking the database, then running the real-API test): restore cap removed, caught (L4 to L7); archive guards removed, caught (A5, A6); row lock and re-check removed, caught by C1 **in 1 of 2 runs at 6 rounds** (race detection is probabilistic, so I raised it to 14 rounds); tombstone-reuse guard and message-tag deletion removed, caught (D8, D9, D15). All functions were restored and the final clean run is 76/76. A mutation of the images guard was not run.

Not covered: the browser app against real staging (no browser sign-in is set up for the staging project), so the user-visible screens were not exercised against the real API. The "device 2 removes its own local copies" step is covered by the app's stubbed tests and by the tombstone read here, not by two real browsers.

## 4. Retention policy

See `reviews/31-retention-policy-draft.md`. It records what is verified, and lists five open decisions (tombstone duration, backup period, legal minimums, quality-test copies, privacy page). **Nothing was invented.** The Supabase organization reports plan `free`; backup availability and period could not be read from here.

## 5. Lifecycle gaps

- **Archived conversations stayed writable**: fixed in the database (refuses writes) and in the app (their conversations are hidden from the chat lists, the open one switches to another conversation, restoring brings them back, a failed read hides nothing). Tests: checks A5 to A10 on the real API; harness Q1 to Q10; contract check P4.7.
- **Restoring at the live-goal limit**: this was a real bug, not just a missing message. The cap applied only to creating a goal, so restoring an archived goal at 10 live goals succeeded and went over the limit (mutation run proved the old behaviour). Fixed for restore and for reopening a completed goal. The app's message ("most live goals allowed") now appears for both create and restore (checks L1, L4).
- **Bring-in revocation**: `revoke_bring_in` exists, is logged with counts only, and the client has `revokeBringIn` and returns the record id from `bringIn`. **No screen lists bring-ins to revoke** (part of the later frontend task). Revoking marks the record revoked; **the text already added to the conversation remains** (it is the student's own message; deleting that message or conversation removes it).
- **Account-profile fields left behind**: not changed. They belong to the account, not to the goal. The delete screen already says so. Whether to clear any of them on goal deletion is a product decision.

## 6. Code and test changes made in this phase

New: `supabase/migrations/20261106000100_prerollout_hardening.sql` and `.rollback.sql`, `20261105000300_goal_lifecycle.rollback.sql`, `scripts/staging-goals-e2e.mjs`. Changed: `marg-goals-life.js` (revoke, uploaded-page count, clearer refusals), `marg-goals-write.js` (limit message), `marg-app.js` and `chat-topics.js` (archived conversations hidden), tests (`goals-life.test.mjs` 52, `goals-contract.test.mjs` 10, lifecycle harness 35).

## 7. Test results (this session, final)

Complete harness: 0 failures (nav 21, contract 51, journey 24, sharing 22, lifecycle 35). Module tests: goals-life 52, goals-share 36, goals-home 43, goals-client 39, goals-write 39, goals-contract 10, staging-guard 35, staging-rest-check 8, two-tab 22, goals-nav 14, journey-log 10, inline-cards 11, cat-pyq-bank 8, predictor-claims 59, batch2 20, cat-correctness 50, daily-practice 103. Mutation set for the lifecycle code: 34 of 34 caught. `worker-ledger` and `worker-security` were not run (Worker unchanged).

## 8. NOT VERIFIED

- Production state this phase: a read-only check of production was **blocked by the permission system and I did not retry**. No production call was made. The last read-only check (end of P4.6) showed no goal tables or columns.
- The F1 production revoke is still only a draft; consolidated migrations have not been rebuilt on an empty database; the independent review was by an AI reviewer; real-browser sign-in against staging; production-scale timing; backups; legal retention; quality-test copies.

## 9. Cleanup of staging (needs your yes, I did not do it)

Rehearsal rows and the two test accounts remain on staging. Say the word and I will remove them (SQL on staging only).

## 10. Decision needed

Production rollout is **not** requested. Before it, you would need: a human security review; the five retention decisions; a production-copy rehearsal of the backfill; the privacy page update; the frontend task (reviews/26) including a bring-in list.
