# 27: Phase 4, P4.3 (create and adopt, scoped memory, goal conversations, contract tests)

Branch `claude/phase4-goals` (worktree). Nothing committed, pushed, merged or deployed. All database changes are on MARG Staging only. Production was only read (goals tables: 0, goal_id columns: 0). Worker unchanged. The frontend UX changes in review 26 are NOT implemented.

## Plain-English summary and decision needed
With the goals switch on (staging plus opt-in only), a student can create a goal, save selected earlier work as a goal (nothing ticked for them), and start a conversation inside a goal. Browser memory is now kept per goal, and a General chat never reads a goal's memory. 35 contract checks for rules I1 to I10 and all existing suites pass.

Testing found one real problem, F2, and I fixed it on staging. The app saves diagnoses by "student plus pattern name", so the same pattern saved from another scope silently overwrote the first scope's row. Verified on staging. Fix: adopted rows get a goal-specific reference. Saving from inside a goal is still paused (see limits), which needs a decision before P4.4.

**Decision:** approve P4.4, and say whether goal-scoped server saves (so a goal chat stores its own diagnoses and tasks) should be built before P4.4 or inside it. Recommendation: before, because Journey per goal reads those rows.

## What was built (switch off everywhere by default)
- `marg-goals-write.js` (new): create goal; list earlier work to choose from; adopt (one database function, retry-safe key); undo; create a goal conversation; load which conversations belong to which goal. No way to change a conversation's goal.
- `marg-goals.js`: pure helpers added: memory key registry, scoped key suffix, required scope, quoted goal text for prompts (markup and line breaks stripped, length capped). The read client still has no write calls.
- `marg-app.js`: scoped keys (15 memory names get a per-goal key; General keeps today's names); scope follows the open conversation; switching reloads memory and clears the other scope's topic; a prompt must state its scope and it must match the open conversation; goal text goes in as quoted data; account-level profile facts reach only General and adopted goals; adoption copies (never moves) browser memory; durable mentor-row saves are paused inside a goal; account change clears scope.
- `chat-topics.js`: two one-line hooks so opening a conversation sets its scope.
- Forms on My Goals (switch on only): create, save earlier work (unticked checkboxes), new chat in a goal.
- Database (staging only): migration `20261105000100_goals_adoption_refs.sql` and rollback. Staging also holds one harmless empty placeholder migration named `p4_3_goals_adoption_refs` from a slip of mine.

## Tests
- Harness contract suite `runGoalsContractTests`: 35/35, covering I1 to I10, with positive controls (goal A's own memory does reach goal A's prompt, the profile does reach General). The strongest probe asks "what do you remember about me" in General and goal B: no goal A text appears.
- `goals-write.test.mjs` 39/39, `goals-contract.test.mjs` 7/7, `goals-client.test.mjs` 39/39, `staging-guard` 35/35, `staging-rest-check` self-test 8/8.
- Breaking tests: 17/17 contract mutants, 12/12 write-client mutants killed.
- Existing: full harness passes, 0 failures; goals-nav 14/14, journey-log 10/10, inline-cards 11/11, cat-pyq-bank 8/8, predictor-claims 59/59, batch2 20/20, cat-correctness 50/50, daily-practice 103/103. `worker-ledger` not run (Worker unchanged).
- Staging SQL (one transaction, rolled back): 52 checks pass: the 44 isolation checks plus 9 new ones (goal references, F2 fix, undo restoring references, undo refused on a clash, long references). F2 itself was reproduced first: a goal B save overwrote goal A's row.
- Browser, stubbed data, 390px: forms render, no overflow, nothing pre-ticked, every control at least 44px. Not checked at 1280px for the new forms.

## Limits and risks (plain)
1. **Saves from inside a goal are paused.** In a goal conversation the diagnosis, task, attempt and evidence saves are skipped (no error). Student sees no loss on screen, but the goal's server record does not grow, so per-goal Journey (P4.4) has nothing new to show until this is built.
2. **Real staging API check is still deferred** (your decision). Everything above used stubs, in-memory fakes and SQL under row-level security.
3. **Goal conversations across devices:** if the thread list cannot load from the server on a new device, a goal conversation is briefly treated as General until it loads. Staging only.
4. **Adoption moves whole diagnoses** (with tasks, attempts, evidence), and the form lists diagnoses only; orphan tasks without a diagnosis cannot be chosen. Adoption does not yet move conversations or mock history (the database function supports it; the form does not).
5. **Account-level data not yet scope-aware:** the profile-based context (mock history, student state) is not separated per goal beyond the profile gate above. Rule I8 consent sharing is P4.5.
6. **Deleting a goal conversation** still cleans General's exercise archive key (`chat-topics.js`), not the goal's. Belongs to P4.6.
7. **Rollback script for the new migration is untested.** The undo path is tested.
8. The goal quote and profile gate treat "adopted workspace" as the CAT workspace; no exam names are in shared code.
9. Earlier items unchanged: F1 production revoke is drafted only; consolidated migrations not rebuilt on an empty database.

## Files
New: `marg-goals-write.js`, `goals-write.test.mjs`, `goals-contract.test.mjs`, `supabase/migrations/20261105000100_goals_adoption_refs{,.rollback}.sql`, `supabase/tests/p4_3_isolation.sql` (generated from the executed checks, not run verbatim). Modified: `marg-app.js`, `marg-goals.js`, `chat-topics.js`, `index.html`, `scripts/run-marg-tests.cjs`, `goals-client.test.mjs`.

## Approval needed
Reply "Approve P4.4" (per-goal Journey and Home goal cards), and tell me whether to build goal-scoped server saves first.

---

# Addendum: goal-scoped server saves (built, as chosen: "Saves first")

Limit 1 above is resolved. Staging only; nothing committed; production untouched; no database change in this step.

**What it does.** Inside a goal conversation, every save to the four mentor tables (diagnoses, tasks, attempts, evidence) is stamped with the open goal and given a goal-specific reference (`g` + 8 hex + `~` + the original). The app still sees the original reference: it is put back on the server's answer and on loaded rows. One boundary does this (`authenticatedSupabaseFetch` in `marg-app.js` now wraps the old function, renamed `authenticatedSupabaseFetchRaw`), so none of the seven save functions changed. It replaces the "pause" guard from the first P4.3 report.

**Safety rules in the boundary**
- A caller cannot aim a save at another goal: the goal is always the open one.
- A task whose diagnosis is outside this goal is saved without that link; evidence or an attempt whose parent is outside this goal is not saved (the database would refuse it).
- Updates by id cannot state a goal. An unreadable body is never sent.
- References are shortened to fit each table's length limit. General saves are untouched (no goal, original reference).
- A goal made by adoption uses the same prefix, so new saves continue the adopted rows instead of duplicating them.

**Verified**
- Staging SQL, rolled back: the same pattern saved from goal A (twice), goal B and General gives 3 separate rows, each with its own text; goal A's task and attempt save; a goal B task on a goal A diagnosis is refused; the adoption preview still counts only General.
- Harness contract suite 43/43 (was 35), including an end-to-end save through the real `persistMentorDiagnosis` with the network stubbed: stamped with the goal, prefixed on the wire, original reference back in the app, General unchanged.
- `goals-contract.test.mjs` 9/9; 27/27 contract mutants killed (was 17); goals-write 39/39, goals-client 39/39, staging-guard 35/35, rest-check self-test 8/8.
- Full harness: 0 failures. goals-nav 14/14, journey-log 10/10, inline-cards 11/11, cat-pyq-bank 8/8, predictor-claims 59/59, batch2 20/20, cat-correctness 50/50, daily-practice 103/103.

**Changed tests (disclosed).** Three checks that asserted "saves are paused in a goal" were replaced by stricter ones that assert "saves are scoped" (and one asserting the pause guard no longer exists). No security check was removed or weakened.

**Not verified**
- No real HTTP save against staging (deferred as before); the network and the browser's fetch were stubbed. No browser run of a goal chat saving.
- Rows saved from a goal show a goal-specific reference in the database; any server-side code or report reading `client_ref` directly would see the prefix.
- Truncation of a very long reference could in theory merge two different references of the same goal (rare; same rule as adoption).
- Two tabs open on different goals at once: scope is per open conversation per tab, and a thread switch is blocked while a reply is in flight, but there is no cross-tab test.
- Attempts and evidence created before their diagnosis or task is saved inside the goal are skipped, not queued, so a very first save in a brand-new goal may lose the earliest attempt if its task was not saved first.

**Next:** P4.4 (per-goal Journey and Home goal cards with the explicit Daily Loop focus), pending your approval.

---

# Addendum 2: three P4.3 fixes (dependent saves, two tabs, collision-safe references)

Staging only. Nothing committed. Production read only (no goals tables, no `goal_id` columns). Worker unchanged. Real staging API verification stays DEFERRED. P4.4 not started.

## 1. Dependent saves are no longer skipped
- An attempt or evidence row whose parent (task or diagnosis) is not known yet now **waits** for the goal's rows to finish loading (up to 3 seconds) and for any parent save still in progress, then looks again.
- If the parent is still unknown it goes into a **per-goal retry queue** stored on the device (key `marg_goal_save_queue_<account>__g_<goal>`, cleared by "clear this device"). It is retried when the goal's rows load and after each successful diagnosis or task save. After 8 failed tries it is marked **gave up** and stays in the queue, visible through `margGoalSaveStatus(goalId)`. Nothing is removed silently. Queue holds at most 60 entries per goal (a warning is logged if it overflows).
- A task whose diagnosis is not in this goal is saved without the link (as before), but only after waiting. An attempt cannot be saved without a task (database rule), so it is queued instead.
- Waits cannot deadlock: tasks wait only for diagnoses, attempts only for tasks, evidence only for diagnoses.

## 2. Two tabs, one account
- The goal is fixed when a save **starts** and is used for the stamp, the reference, the retry queue and the checks, so opening another goal (or another conversation) meanwhile cannot move it.
- A parent that exists in another goal never counts as a parent.
- A goal conversation created in one tab is found by another tab through the shared registry; the registry merge no longer overwrites conversations another tab added during loading.
- New test `scripts/two-tab-goals.test.cjs` runs three separate copies of the app (tab 1 goal A, tab 2 goal B, tab 3 General) on shared browser storage and a fake database that enforces the real rules (unique reference, goal fixed once set, task in the same goal as its diagnosis). 22/22: same pattern saved in all three at once gives three separate rows; each tab reads only its own goal's rows with original references; separate local memory per goal; prompts carry only that tab's goal memory and title (control included); a prompt for the wrong goal is refused; a save held for its parent in goal A is not sent into goal B when the tab switches, stays in A's queue, and is sent stamped A afterwards; General saves never get a goal or prefix.

## 3. References are collision-safe and never shortened
- The app and `adopt_workspace` no longer truncate. A goal reference is the full original plus the 10 character prefix, so it is unique per goal and the original is always recoverable.
- Migration `20261105000200_goal_ref_limits.sql` (+ rollback) widens the four reference limits by exactly 10 (170, 190, 210, 210) and replaces the truncating adoption function. Applied to staging only; the rollback is untested.
- Staging SQL (rolled back): two 160-character references that differ only in their last 5 characters stay distinct and complete after adoption; a 200-character attempt reference and a 180-character task reference are complete; undo restores the exact originals; a 211-character reference is still refused. `supabase/tests/p4_3_ref_limits.sql`.

## Readers return the original reference
The only readers of the four tables are the four loads in `loadMentorExecutionLoop`; all go through the prefix remover, and every save and queue-retry answer is cleaned the same way. Checked in the harness (loaded rows, save answers) and in the two-tab test (all three tabs see `diagnosis:qa:slow_method`).

## Tests
- Harness contract suite `runGoalsContractTests` **51/51** (was 43), including an end-to-end task saved while its diagnosis is still in flight (keeps its link), held attempt sent after the task appears, orphan evidence kept and reported as given up, goal fixed against a mid-save switch, and a parent in goal B not counting for goal A.
- Two-tab test 22/22; `goals-contract.test.mjs` 9/9; `goals-write` 39/39; `goals-client` 39/39; `staging-guard` 35/35; `staging-rest-check` self-test 8/8.
- Breaking tests: new boundary 19/19 caught (`mut_goalsave.py`), older contract set 19/19 of those still applicable (8 superseded by the new set), write client 12/12, read client 15/15, staging guard 16/16. Two weak spots turned up and were fixed in the tests (given-up saves silently removed; a stamp taken from the open goal at send time).
- **Complete existing harness: 0 failures** ("all selected suites passed"); goals-nav 14/14, journey-log 10/10, inline-cards 11/11, cat-pyq-bank 8/8, predictor-claims 59/59, batch2 20/20, cat-correctness 50/50, daily-practice 103/103. `worker-ledger` not run (Worker unchanged).

## Not verified / limits
- Real browser tabs and the real staging API (deferred): the two-tab test uses copies of the app in one process and a fake database, not two browser windows.
- A held save lives in the browser. If the person clears site data before it is retried, it is lost (same as any local state).
- Queue length 60 per goal; entries older than that are dropped with a console warning.
- `chat-topics.js` still saves the whole chat list per tab (existing behaviour); a conversation created in one tab can still be missing from another tab's chat list until it reloads.
- Deleting a goal conversation cleaning the goal's archive remains P4.6.

## Approval needed
Reply "Approve P4.4" to continue. I have not started it.
