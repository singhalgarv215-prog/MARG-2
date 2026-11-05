# 23 — Phase 4, P4.1: staging project, schema, isolation tests

Branch `claude/phase4-goals` (worktree off `origin/main`, which includes Phase 3). Nothing committed, pushed, merged or deployed. **Production Supabase was only read.** The Worker file is byte-identical to `origin/main`.

## Plain-English summary and the decision needed
A separate staging database, **MARG Staging** (ref `hmgdzkszzuaivyqeeitu`, same region, $0, same organisation), now exists and mirrors production's tables, constraints, indexes, RLS policies, functions, grants, auth trigger and storage bucket. The goals schema (8 new tables, `goal_id` on the four mentor tables, 3 adoption functions) is applied **to staging only**. 44 isolation tests pass, including two accounts and two goals of one account. Three bugs in my own migration were caught by those tests and fixed. A staging network guard refuses any request to production.

**Decision for you:** (1) approve P4.2, and (2) tell me whether to prepare a production fix for a permissions problem I found in production (finding F1, below). I have not touched production.

## What was done
| Item | Result |
|---|---|
| Supabase access | Connector working. One organisation (`Marg`), one project before this work (production). |
| Staging project | Did not exist. Created `MARG Staging`. Quoted cost $0/month, so no paid upgrade. |
| Production credentials | Not used for staging. The app takes staging URL and key from a local git-ignored `staging-config.local.js` (not created; see Remaining). |
| Baseline | Production has **no migration for its base tables** (its history starts 2026-09-23). I reconstructed the baseline from catalog queries: `supabase/baseline/01–04`. |
| Parity | 11 fingerprint classes. Match exactly: columns, constraints (after fix), indexes, RLS flags, table grants, function grants, auth trigger, bucket, storage policies. Functions match after ignoring whitespace. One public policy (`community_signups`) is textually different but logically identical (parenthesis grouping). |
| Goals schema on staging | `supabase/migrations/20261104000100_goals_foundation.sql` plus its rollback. |
| Staging guard | `marg-env.js`; wired into `marg-app.js`, `landing-bootstrap.js`, `index.html`. |

## Files changed (repo, uncommitted)
Modified: `index.html` (+1 line, loads `marg-env.js` first), `landing-bootstrap.js`, `marg-app.js` (staging-aware constants; production values unchanged when no staging config).
New: `marg-env.js`, `staging-guard.test.mjs`, `.gitignore`, `supabase/baseline/{01_tables,02_functions_triggers,03_rls_grants,04_fk_actions,parity_check}.sql`, `supabase/migrations/20261104000100_goals_foundation{,.rollback}.sql`, `supabase/tests/p4_1_isolation.sql`.

## Database objects added (staging only)
Tables: `goals`, `chat_threads`, `goal_events`, `goal_context_shares`, `goal_adoptions`, `goal_adoption_items`, `profile_fact_consents` (fact key limited to `daily_hours`), `daily_loop_focus`. Columns: nullable `goal_id` on `mentor_diagnoses`, `mentor_tasks`, `mentor_task_attempts`, `mentor_diagnosis_evidence`, each with a composite foreign key `(goal_id, user_id) → goals(id, user_id)`. Functions: `preview_workspace_adoption`, `adopt_workspace`, `undo_adoption`, `goal_family_mismatches` (all security invoker). Triggers: goal cap (10 live goals), goal fixed after creation, parent/child same-goal check, owner and `adopted_at` guards. No DELETE policy or grant exists on any new table.

## Findings where the real database differs from the proposal
1. **No baseline migration exists in production.** Staging was rebuilt from the catalog, so "identical" is as good as my queries (Remaining risk 1).
2. **Foreign keys carry `ON DELETE` actions the proposal did not know**: most cascade from `auth.users`; `acquisition_funnel_events.user_id` and `referral_challenge_events.viewer_user_id` set null; `mentor_tasks → mentor_diagnoses` is **RESTRICT** (a diagnosis with tasks cannot be deleted). `chats`, `checkins`, `profiles → auth.users` are **NOT VALID** in production (existing rows were never checked; orphans are possible and unchecked). Both matter for P4.6 deletion ordering.
3. **Composite goal foreign keys use NO ACTION, not RESTRICT** as the proposal said. Reason: RESTRICT is checked immediately and can block the cascade when an account is deleted. Staging test T39 shows account deletion works. I did not test RESTRICT itself.
4. **Adoption moves a family, not single items.** A diagnosis, its tasks, their attempts and its evidence move together, because the same-goal rule would otherwise reject later updates. This narrows D3's "student chooses items": the preview must show whole families. Choosing one evidence row moves four rows (T41).
5. **Undo has a limit.** Undo is refused while newer activity in the goal depends on the adopted items (T43, T44 show nothing changes). D3 asked for reversible adoption; this is reversible only until the goal grows on top of those rows.
6. **Production has CAT content tables in a `private` schema** (`practice_blueprints` 265 rows, `practice_source_documents`, `cat_push_content`) that the P0 map did not list. They are global content, not student data, and are not goal-scoped.
7. **F1 (HIGH, defense in depth): production grants `TRUNCATE`, `REFERENCES` and `TRIGGER` to `authenticated`** on `question_images`, `image_questions`, `conversation_question_state`, `marg_response_reviews`, `product_incidents`. TRUNCATE ignores RLS. **VERIFIED on staging** (which mirrors the grants): signed in as account A, `TRUNCATE product_incidents` succeeded and deleted account B's row. **READ-ONLY for production exploitability:** I believe the Supabase REST API has no TRUNCATE verb, so it needs a direct database connection as that role, which ordinary users do not have. I could not prove that. Fix is a one-line revoke in a production migration, which I have not made.

## Bugs my own tests found (all fixed, re-tested)
1. The parent/child trigger read a column that does not exist on attempts, breaking every attempt insert.
2. Undo failed halfway through a family; adopt and undo now verify consistency at the end.
3. The consistency helper sat in a schema callers cannot reach; moved to `public` (security invoker).

## Tests
- **Isolation, ownership, adoption, rollback on staging: 44/44 pass** (`supabase/tests/p4_1_isolation.sql`; runs in one transaction that rolls itself back). Covers two accounts (T1–T5, T14, T22, T24, T33, T38), two goals of the same account (T6, T7, T10–T12), conversation goal fixed (T13, T15), counts-only audit (T16, T17), consent limited to `daily_hours` per destination incl. General Chat (T18–T22), delete forbidden (T25), goal cap (T26), adoption preview, idempotency, nothing deleted, undo, refused undo, account deletion (T27–T44).
- **Rollback script on staging:** refuses while a goal exists; with none, removes all goals objects and leaves legacy chat rows (2→2) and tasks (1→1) unchanged. Run inside a rolled-back transaction, so staging still has the schema.
- **Staging guard: 34/34**, and **16/16 mutants killed** (guards removed one by one, key checks skipped, env script deferred, and so on).
- **Existing harness: 55 suites, none failing.** Also pass: goals-nav 14/14, journey-log 10/10, inline-cards 11/11, cat-pyq-bank 8/8, predictor-claims 59/59, batch2 20/20, cat-correctness 50/50, daily-practice 103/103, worker-security all.
- **`worker-ledger` not re-run** (`timeout` is not available here, and it hung before). The Worker file is unchanged. Please run it in your terminal.
- Production checks after the work (read-only): 0 test accounts, 0 goals tables, 0 `goal_id` columns, still 5 migrations.

## What these tests do NOT cover
No browser run against staging (no LIVE check at 390px or desktop; nothing in the UI changed). No true concurrency (two sessions at once): single-session only; the advisory lock and unique idempotency key are unproven under load. Client-side scoped memory, prompt isolation, concurrent goal switching and account switching are P4.2–P4.3. Real Supabase Auth sign-in (JWT through the REST API) was simulated with role and claims in SQL, not through the HTTP API.

## Remaining risks and limits
1. Staging got the final state through several migrations; the repo migration file is the consolidated version and **was not run from scratch on an empty database**. Do that rebuild before any production use.
2. Not mirrored: `pg_cron`, `pg_net`, `supabase_vault` and `pg_stat_statements` extensions, the 3 cron jobs (deliberately, they call production endpoints), Auth settings (Google provider, redirect URLs, JWT settings; the connector cannot read them), and data.
3. To use staging in a browser you need email sign-in or Google credentials on the staging project, and a local `staging-config.local.js` (URL plus the **public** anon key; I did not write one). Staging chat has no model: the guard points the Worker at an unreachable address.
4. The guard covers the page's own network calls, not a whole-page redirect to production.
5. `checkins.goal_id` (D5) is deferred. `chats.thread_id` and permanent deletion are P4.6.
6. Orphan rows in production behind the NOT VALID foreign keys have not been counted.

## Approval needed
Reply "Approve P4.2" to continue (read-only client: goals list, adoption preview counts, scope plumbing, flag off). Separately say whether to draft the F1 production revoke for your review.
