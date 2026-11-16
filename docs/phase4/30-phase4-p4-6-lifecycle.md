# 30: Phase 4, P4.6 (archive, bring in, permanent deletion, chats.thread_id)

Branch `claude/phase4-goals` (worktree). Nothing committed, pushed, merged or deployed. **Database changes are on MARG Staging only** (migrations `p4_6_goal_lifecycle`, `p4_6_tombstone_grants`; repo file `supabase/migrations/20261105000300_goal_lifecycle.sql`). Production only read (no goals tables, no `goal_id` or `thread_id` columns). Worker unchanged. Real staging API verification remains DEFERRED. Review 26 UX changes NOT implemented. P4.7 not started.

## Plain-English summary and decision needed
With the goals switch on (staging plus opt-in only), My Goals can now:
- **Archive a goal** (reversible, keeps all history, hides it from Home and recommendations) and **restore** it.
- **Delete an archived goal permanently**, in a separate screen: a dry run shows counts of what goes, the student must type the goal's exact title, and the database checks it again. Other goals, General Chat and other accounts are untouched. It leaves a content-free record (goal id, date, counts) so the student's other devices clean up on their next sign-in.
- **Bring in** a short summary of one goal into the open conversation of another: the exact text is shown first, nothing is added until the student confirms, it is added as a visible message and recorded.

**Decisions needed:** (1) approve P4.7 (rollout), and (2) the open retention and legal inputs below, which the founder has still not given. Permanent deletion should not be offered to real students until those are settled.

## What the deletion removes, and what it does not
Mapped to the approved dependency map (reviews/22 section 16):
- **Removed:** this goal's diagnoses, saved checks, attempts, evidence (1 to 4 and 5 to 8); its conversations and every message linked to them (rows 1 and 2 and 4); question state and response reviews of those conversations (15, 17); progress summaries brought into or out of the goal (10); sharing choices (11); the adoption record (9); the Daily Loop focus if it pointed here (12, so Home asks again); uploaded pages attached to its conversations (16, through the app's existing per-conversation cleanup, before the server deletes); this device's copies and, via the tombstone, other devices' copies (24).
- **Audit:** one `delete` event and one tombstone, both counts only (26). A canary scan of every table in `public` after deleting a goal full of planted text found **zero hits**.
- **NOT removed yet (shown to the student on the delete screen):** account profile fields held for the goal (14), check-ins (13), reminder text (18), shared question links (20), uploads with no conversation link, feedback text (23), engagement events (21), text already sent to the AI provider (28), copies the student allowed for model improvement, and backups until they expire (29). General Chat conversations are never touched.

## What was built
- **Database (staging):** `chats.thread_id` (nullable, indexed, composite foreign key added NOT VALID) filled by a trigger when a message of a registered goal conversation is inserted, plus `link_thread_messages` for earlier messages; `archive_goal`, `unarchive_goal`, `bring_in_progress`, `goal_deletion_preview`, `delete_goal_permanently`; table `goal_tombstones` (read-only for users).
- **Client:** `marg-goals-life.js` (calls, the screens, the bring-in text) and wiring in `marg-app.js`. The delete order never leaves the server half-done: read conversations, link their messages, remove uploads, delete on the server in one transaction, and only then remove this device's copies. A failure at any earlier step stops before anything later happens.
- **Home:** a Daily Loop focus on a goal that was archived or deleted is no longer shown as chosen; Home asks again.

## Where this differs from the approved plan (please read)
1. **A SECURITY DEFINER function was added.** The plan said "no definer function". Deletion needs one: users have no delete right on goals, goal conversations or tombstones, so a goal can only be deleted through `delete_goal_permanently`. It pins `search_path`, takes the user only from the signed-in token, limits every statement to that user and goal, requires the goal to be archived, requires the typed title, and takes a per-user lock. It should have an independent security review before production.
2. **Users can still delete their own individual mentor rows and messages directly** (existing production grants, unchanged). So "deletion only through the function" holds for goals, conversations and tombstones, not for single rows.
3. **`chats.thread_id` is filled only for goal conversations**, not for every conversation (the plan registered every thread). General messages stay null on purpose.
4. **The foreign key on `chats` is NOT VALID** and must be validated, and the old messages of any conversation adopted into a goal must be linked, before production. Staging has no messages, so the volume, lock time and backfill rehearsals (V1 to V14 in reviews/22) are NOT done.
5. **Retention is still undecided** (legal minimums, backup expiry, whether model-improvement copies fall under the promise). Tombstones are kept without a time limit for now (the proposal said 12 months).

## Tests
- Staging SQL (rolled back, `supabase/tests/p4_6_lifecycle.sql`, 40+ checks): a message of a goal conversation gets its `thread_id` from its tag; linking an earlier message works and is repeatable; General messages stay unlinked; two bring-ins recorded with counts-only events; same-goal and over-long summaries refused; archive keeps every row, a second archive is refused, archive and restore leave three events; deletion refused when not archived, with a wrong or missing title, or by another account; a goal cannot be deleted directly; the deletion returns counts and leaves goal two, General data, other messages, account B and the unrelated bring-in untouched; one tombstone and one event; canary scan zero hits. A follow-up run checked that a response review of a goal conversation is deleted and a review of another conversation is kept, and that users cannot delete or change tombstones.
- `goals-life.test.mjs` **43/43**; harness `runGoalsLifecycleTests` **26/26** (purge removes only that goal's keys for this account; conversation removed from list, messages, state and registry; open deleted conversation moves to a remaining one; other-device cleanup; the exact delete order; each failure stops early and keeps local copies; wrong title, busy reply and unlisted goal make no call; bring-in preview sends nothing, confirm records exactly the previewed text and adds it as a saved visible message, cancel and a changed conversation do nothing; flag off is inert).
- Breaking tests: **27/27 caught** for P4.6 (`mut_life.py`; one weak check, the "what is not removed" heading, was found and strengthened); still 20/20 sharing, 17/17 journey/home, 19/19 saves, 12/12 write, 15/15 read, 16/16 guard.
- Existing: complete harness 0 failures (contract 51, journey 24, sharing 22, lifecycle 26, nav 21); two-tab 22; goals-home 43, goals-client 39, goals-write 39, goals-contract 9, staging-guard 35, staging-rest-check 8; goals-nav 14, journey-log 10, inline-cards 11, cat-pyq-bank 8, predictor-claims 59, batch2 20, cat-correctness 50, daily-practice 103. `worker-ledger` not run (Worker unchanged).
- Browser (stubbed data, staging-mode page): archive moves a goal to Archived; the delete screen shows counts and the disclosures; the confirm button stays disabled for a near-miss title and enables for the exact one; the delete ran in the right order and the goal left both lists. At **390px**: no overflow, no hidden note, no control under 44px. At **1280px**: renders, no overflow.

## Not verified / limits
- Real staging API and a real sign-in (deferred); every server answer in the browser check was stubbed. The SQL functions were run under role switching, not through the REST API.
- No rehearsal at production scale: lock time, backfill, rollback of `chats.thread_id`, and the rollback script for this migration (not written).
- Conversations inside an archived goal can still be opened and written to; archiving hides the goal but does not lock it.
- The bring-in message goes to the model like any message. Revoking a bring-in (the table has `revoked_at`) has no screen yet; deleting either goal removes the record.
- Restoring a goal can fail if the student already has 10 live goals; the screen says so.
- Deleting a goal does not clear fields on the account profile that the goal's type may have filled (row 14); that needs the goal-type step and the founder's column decisions.

## Approval needed
Reply "Approve P4.7" to continue (rollout), and please answer the retention questions (backup period, legal minimums, model-improvement copies) before deletion is offered to real students.
