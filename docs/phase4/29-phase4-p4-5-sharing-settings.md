# 29: Phase 4, P4.5 (sharing settings: allowlist, consent, revoke)

Branch `claude/phase4-goals` (worktree). Nothing committed, pushed, merged or deployed. **No database change in P4.5** (`profile_fact_consents` from P4.1 is used as built). Production only read (no goals tables, no `goal_id` columns). Worker unchanged. Real staging API verification remains DEFERRED. Review 26 UX changes NOT implemented. P4.6 not started.

## Plain-English summary and decision needed
With the goals switch on (staging plus opt-in only), My Goals has a "Sharing between goals" section. The only thing that can ever be shared into a goal is the student's **study hours per day**, it is **off for every goal by default**, it is chosen **per goal**, and it can be turned off at any time. Turning it off takes effect on the very next turn.

**Decision:** approve P4.6 (bring in, archive, permanent deletion with `chats.thread_id`), or change anything here first.

## How it works
- New module `marg-goals-share.js`: the allowlist (exactly one fact, `daily_hours`, matching the database check), the consent client, the settings screen and the prompt block. No exam names.
- **Consent is read fresh at the start of every turn** in a goal. A failed read, a timeout (2.5 s), a switch of conversation during the read, a grant older than 20 seconds, a grant for another goal, or a fact that is not on the allowlist all mean "share nothing". So revoking in this tab or another applies to the next turn.
- The shared line is quoted data: cleaned (markup, quotes, line breaks removed), capped at 40 characters, labelled "shared by the student", with nothing else of the profile attached.
- A goal made from the existing workspace already reads the profile (decision from P4.3), so it shows "Already included" and has no switch. A new goal reads none of the profile unless the student switched on the study hours for it.
- **General Chat is unchanged**: it keeps reading the account profile as before, makes no consent read, and gets no shared block. (The database allows a consent row with "General Chat" as destination; the screen does not offer it, because General already reads the profile.)
- Each switch states what it will do ("Share my study hours with this goal" asks to turn on; "Sharing study hours: on. Turn off" asks to turn off). The app checks the server first and sends nothing if it already agrees, so an out-of-date button (for example after another tab changed it) can never do the opposite of what it says. Found while testing the screen; fixed and tested (T6, T7).
- Revoking sets `revoked_at` on the consent row. Nothing is ever deleted; turning it on again later makes a new live row.

## Tests
- `goals-share.test.mjs` **36/36**.
- Harness suite `runGoalsSharingTests` **22/22**: no consent means no hours and none of the profile; consent adds the quoted hours and nothing else (weakest section, mock history absent); turning it off removes it from the next turn; failed read shares nothing; a consent for goal A never reaches goal B (even a stale grant for A while B is open); non-allowlisted fact ignored; old grant ignored; switching conversation drops grants; injection in the value cannot escape the quote; workspace-made goals and General make no consent read and get no shared block; the screen creates one consent for the right account, fact and goal, revokes by setting `revoked_at`, deletes nothing, refuses a goal not on screen, changes no stored memory; stale buttons send nothing; flag off is inert.
- Staging SQL (rolled back, `supabase/tests/p4_5_consents.sql`): no consent by default; one live consent per goal and fact; a second is refused; a fact off the allowlist is refused; a consent for another account's goal or for another user is refused; revoke updates one row and keeps it as a record; turning on again after a revoke works; a consent cannot be redirected or un-revoked; deleting is refused; another account sees none and revokes none.
- Breaking tests: **20/20 caught** for P4.5 (one equivalent change dropped, because with a single allowed fact it behaves identically); still 17/17 (journey/home), 19/19 (goal saves), 12/12 (write), 15/15 (read), 16/16 (guard).
- Existing: complete harness 0 failures (contract 51/51, journey 24/24, sharing 22/22, nav 21/21); two-tab 22/22; goals-home 42, goals-client 39, goals-write 39, goals-contract 9, staging-guard 35, staging-rest-check 8; goals-nav 14, journey-log 10, inline-cards 11, cat-pyq-bank 8, predictor-claims 59, batch2 20, cat-correctness 50, daily-practice 103. `worker-ledger` not run (Worker unchanged).
- Browser (stubbed data, staging-mode page): the section at **390px** (no overflow, no note hidden, no control under 44px, defaults off, adopted goal explained) and **1280px** (no overflow). Pressing the switches sent one POST then one PATCH and no DELETE.

## Not verified / limits
- Real staging API and a real sign-in (deferred); server answers in the browser check were stubbed. One stub slip (an invalid 204 body) made the first revoke look failed; the request itself was correct and the app showed "unchanged".
- Only one fact exists today. Situation, time zone and language from the earlier proposal are not stored or not eligible; adding one later needs a new migration on purpose.
- The consent is read once per turn, so a revoke made while a reply is already being generated applies from the next turn.
- The shared line reaches the model like any other prompt text; the model provider sees it for that turn, as with all prompt content.
- Data export and deletion of consent rows follow P4.6.

## Approval needed
Reply "Approve P4.6" to continue.
