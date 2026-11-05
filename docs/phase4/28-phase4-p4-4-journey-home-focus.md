# 28: Phase 4, P4.4 (per-goal Journey, Home goal cards, explicit Daily Loop focus)

Branch `claude/phase4-goals` (worktree). Nothing committed, pushed, merged or deployed. **No database change in P4.4** (the `daily_loop_focus` table from P4.1 is used as built). Production only read (no goals tables, no `goal_id` columns). Worker unchanged. Real staging API verification remains DEFERRED. The review 26 UX changes are NOT implemented. P4.5 not started.

## Plain-English summary and decision needed
With the goals switch on (staging plus opt-in only):
- **Home** shows each active goal as its own card: title, status, last saved activity, one next step, and three buttons (Open journey, New chat in this goal, Use for my Daily Loop), plus "Use no goal for my Daily Loop".
- **The Daily Loop focus is explicit.** Until the student presses a button, Home asks "Which goal is your Daily Loop for? Marg does not guess" and marks no goal. A saved "no goal" is a real choice, different from "nothing chosen". Showing Home never writes a focus.
- **Journey has a goal picker** (General workspace plus each goal). By default it follows the open conversation. Choosing another goal shows that goal's own rows and memory without changing the open conversation or any stored memory.

**Decision:** approve P4.5 (sharing settings), or change anything here first.

## How it works
- New module `marg-goals-home.js`: reads (one goal's four tables with `goal_id=eq.<id>`, or the unassigned ones; one cards query; the focus row), one write (the student's own focus row, an upsert), and the card and picker HTML. No exam names. A failed read is "unavailable", never an empty list or an empty journey; a partial answer (any of the four reads failing) is unavailable too.
- `marg-app.js`: `margBuildJourneyForScope` swaps every global the Journey builder reads (open scope, rows, diagnostic memory and topic, plan, conversation) for the other goal's, builds, and restores them exactly, even if the builder throws. The open scope's own "what's next" recommendation is not shown in another goal's view. A goal made from the existing workspace keeps the workspace's mock-history entries; a new goal gets none. A slow load for an earlier choice cannot overwrite a newer one. An account change forgets the chosen view.
- Last activity and next step come from saved tasks only: the newest saved update, and the newest open task. Nothing is invented; if activity could not be loaded the card does not claim "no activity".
- Check-ins are still account-level. The focus is stored and shown but does not yet change how check-ins are saved (`checkins.goal_id` stays deferred, as noted in P4.1).

## Found by the browser check (fixed)
The notes on the cards (including the "Which goal is your Daily Loop for?" question) reused an existing Home class that is **hidden on small screens**, so a phone would have shown unlabelled buttons. They now use their own visible styling at 15px. Test K11.

## Tests
- `goals-home.test.mjs` **42/42** (helpers, client, focus, cards, picker, source rules).
- Harness suite `runGoalsJourneyTests` **24/24**: another goal's Journey shows only its rows and memory; every global restored; no storage writes; recommendation of the open scope not leaked; adapter rule; failure still restores; end-to-end loads with the network stubbed; stale load dropped; unlisted goal refused; failed load never shown as empty; focus saved only for a listed goal, changes neither scope nor memory; rendering Home makes no write and asks which goal when nothing is chosen; flag off is inert; account change clears the view.
- Staging SQL (rolled back, `supabase/tests/p4_4_focus.sql`): no focus row until chosen; upsert to own goal; "no goal" is stored; another account's goal refused; a focus row for another user refused; each account sees only its own row.
- Breaking tests: 17/17 caught for P4.4 (`mut_home.py`); also still 19/19 (goal saves), 12/12 (write client), 15/15 (read client), 16/16 (staging guard); 19 of the 27 older contract set apply (8 superseded earlier). Two weak tests were found and strengthened (a vacuous Home no-write check; the open conversation's plan could have leaked into another goal's view).
- Existing: complete harness 0 failures; contract 51/51; two-tab 22/22; goals-client 39, goals-write 39, goals-contract 9, staging-guard 35, staging-rest-check 8; goals-nav 14, journey-log 10, inline-cards 11, cat-pyq-bank 8, predictor-claims 59, batch2 20, cat-correctness 50, daily-practice 103. `worker-ledger` not run (Worker unchanged).
- Browser (stubbed data, staging-mode page): Home cards, focus button (one write on the press), Journey picker and another goal's journey at **390px** (no overflow, no control under 44px) and at **1280px** (cards and picker render, no overflow).

## Not verified / limits
- Real staging API and a real sign-in (deferred). All server answers in the browser check were stubbed.
- Journey for another goal builds without that goal's "what's next" suggestion; it shows the goal's own open tasks under "planned".
- The goal's "last activity" is the latest saved task update, not every kind of activity.
- The pressed focus button is shown disabled ("Daily Loop focus"); its contrast is the browser default and was not tuned.
- `checkins.goal_id` is deferred, so the focus does not yet label saved check-ins.
- My test page loads the app through a rewritten document, which showed garbled punctuation in existing text; this is a property of that test method, not of the app.
- Archive and "bring in" remain P4.6.

## Approval needed
Reply "Approve P4.5" to continue.
