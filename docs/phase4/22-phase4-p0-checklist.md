# 22 — Phase 4, P0 prerequisite checklist

Companion to `reviews/21-phase4-goals-architecture.md` (Revision 2). P0 is **checking and collecting, not building**. No migration is written, no Supabase object is changed, no source file is changed, nothing is deployed, committed or pushed. P4.1 starts only on explicit founder approval after P0 is complete and reviewed.

## Plain-English summary
Before any database work, Marg needs a real staging copy of the database and the true facts about it. The repo does not contain the schema, the policies or any staging settings, and one production Supabase address is hardcoded in three files. So P0 answers nine things: does a staging project exist, what is the real schema, do the security policies really stop one student reading another's rows, what shape is the existing data, what do we need to roll back safely, and how will we prove two goals of the same student never mix. Every step below says who does it, what the output is, and the pass condition. **Items marked FOUNDER need your dashboard access; I cannot and should not do them.**

**Revision 2 (after founder review):** sections 11–18 answer seven clarifications: staging isolation, schema parity, sharing permissions, a deletion dependency map, a proposed retention policy, production safety, and the `chats.thread_id` plan. The main findings: today **no staging path exists at all** in the code; only **two of the four allowlisted facts are actually stored** (time zone is hardcoded and language is not stored); and deletion has **five places where "no sensitive content left behind" is not yet guaranteed** (check-ins, reminder text, shared referral questions, free-text feedback, and the model provider). Fifteen blockers are listed in section 18; the first is whether a staging project exists.

## Decisions that gate P0
| Needed from founder | Why |
|---|---|
| Does a staging Supabase project exist? (step 1) | decides whether step 1b (create one) is needed |
| Who has dashboard and SQL access, and may a read-only role be used on production for counts and catalog queries only? | steps 2, 5 |
| Is copying real student data into staging allowed? **I recommend no**: use synthetic fixtures built from the production shape counts | privacy; step 5 |
| Retention rules that apply to student records and deletion | step 9, goal deletion design |
| Allowlist of shareable facts (study hours, situation, time zone, language) | consent design |

## 1. Staging project availability
**1a. Establish whether one exists (FOUNDER).**
- Open the Supabase dashboard and list projects. Record: project name, reference id, region, plan, Postgres version, created date, who owns it.
- Confirm that the staging project's reference id is **different from** `kduqtrumhveteyjkyltf` (the production id hardcoded in `marg-app.js`, `landing-bootstrap.js` and `cloudflare-worker.js`).
- Pass: a written yes or no, with the reference id if yes.

**1b. If none exists, what must be created (FOUNDER, then verified by me from the outputs):**
- A new Supabase project, same region, plan and Postgres version as production.
- Same Auth settings: providers, email confirmation, redirect URLs (staging site address), password rules, JWT expiry, email templates.
- The same extensions, storage buckets and their policies, and database functions and cron jobs (for example the RPCs `append_my_mock_history_v…`, `record_referral_share`, `claim_referral_signup`, `get_my_referral_stats`).
- A staging copy of the app served at its own address, and a way for it to use the staging Supabase URL and key. **That needs a code change (a configurable URL and key), which is a P4.1 deliverable, not P0.**
- No Cloudflare Worker is needed for database or RLS tests: they call Supabase directly. **The Worker and its spend ledger stay untouched.**
- Rules: staging holds no production secrets, no service-role key outside the staging owner, and no real student data.
- Pass: project exists, owner confirmed, settings checklist ticked.

**1c. Access plan.** Two **test student accounts per scenario** plus one admin: `acct_A`, `acct_B`, `acct_C_empty` (new user), `acct_D_legacy` (old-shape CAT data). Passwords only in a password manager, never in this repo.

## 2. Real schema export
Source of truth is the **database catalog**, taken first from production read-only (catalog only, no row data), used to build staging, then taken again **from staging** and diffed.
- **2a. Production schema-only copy (FOUNDER or DBA):** a schema-only dump of the `public` schema (and `auth` references), no data. Used only to build staging.
- **2b. Build staging from it, then export staging's catalog** with the read-only queries in the appendix (A1–A9).
- **2c. Parity diff:** production catalog vs staging catalog, table by table: columns and types, defaults, constraints, indexes, triggers, functions, grants, policies. Pass: **zero differences**, or each difference listed and accepted.
- **2d. Reconcile with the code.** Compare the real schema with the inferred one in `reviews/21` section 1.1. List every difference. Specifically confirm:
  - `chats` columns (is there a thread or metadata column I missed?);
  - unique constraints `(user_id, client_ref)` on `mentor_diagnoses`, `mentor_tasks`, `mentor_task_attempts`, `mentor_diagnosis_evidence` (the code's `on_conflict` requires them);
  - `profiles.user_id` is unique and what its primary key is;
  - the real columns of `mentor_*` and `checkins` (is there a unique `(user_id, date)`?);
  - the real name and signature of the mock-history RPC;
  - foreign keys from `mentor_*` to `auth.users` and between themselves, and their delete rules;
  - any existing trigger (for example `updated_at`).
- Deliverable: `reviews/23-phase4-real-schema.md` containing the raw outputs and the diff. Pass: reviewed by the founder.

## 3. Constraints, indexes, triggers, grants
For every table the feature touches (`chats`, `profiles`, `mentor_diagnoses`, `mentor_diagnosis_evidence`, `mentor_tasks`, `mentor_task_attempts`, `checkins`, `engagement_events`, `conversation_question_state`):
- primary keys, unique constraints, foreign keys with `on delete` behaviour, check constraints;
- indexes, and whether `(user_id, <order column>)` ordering used by the app's queries is covered (the app orders by `updated_at`, `completed_at`, `occurred_at`, `created_at`);
- triggers and the functions they call;
- **grants**: which roles (`anon`, `authenticated`, `service_role`) have `select/insert/update/delete`; confirm `anon` has no access to student tables.
- Pass: a table per table with each item filled, and any grant to `anon` on a student table raised as a finding.

## 4. RLS policies and WITH CHECK verification
This is the highest-risk unknown. Do not trust a "RLS enabled" tick.
- **4a. For each table:** is `relrowsecurity` on, is `relforcerowsecurity` set, list every policy with command, roles, `USING` and `WITH CHECK` expressions (query A8).
- **4b. Required findings per table:** a SELECT policy limited to `user_id = auth.uid()`; INSERT and UPDATE policies that **also have `WITH CHECK (user_id = auth.uid())`**; no policy with `true`; no policy granted to `anon` on student data; DELETE policy present only where the app deletes.
- **4c. Behavioural proof, on staging with real tokens** (not only reading the policy text):
  1. `acct_A` reads its own rows (expect rows).
  2. `acct_A` reads `acct_B`'s rows by id and by filter (expect none).
  3. `acct_A` inserts a row with `user_id = acct_B` (expect refusal).
  4. `acct_A` updates a row it owns to set `user_id = acct_B` (expect refusal; this is the `WITH CHECK` test).
  5. `acct_A` updates and deletes `acct_B`'s row (expect zero rows changed).
  6. A request with no token and with an expired token (expect refusal).
- **4d. RPCs:** for each existing RPC, is it `security definer` or `invoker`, who can execute it, and can it write another user's row.
- Pass: every table passes 4b and 4c. Any table that fails is fixed **before** P4.1, as its own item.

## 5. Existing user data shape
Counts and shapes only. **No message text, no names, no scores leave the database.** Run read-only on production (counts), and reproduce the shapes in synthetic staging fixtures.
- Per table: row count, accounts with at least one row, largest account's row count, oldest and newest row.
- `chats`: rows with a `[MARG_THREAD:` tail, rows with `[MARG_INTERNAL:` by kind (`EXERCISE`, `BEHAVIOR`, `HYPOTHESIS`, `MENTOR_EVIDENCE`, `PERSONAL_GOAL`, `PLAN`, `PROFILE_CONTEXT`), rows with no tail (the `legacy` thread), threads per account, accounts with more than 20 threads, maximum content length.
- Orphans: attempts whose task is missing, evidence whose diagnosis is missing, tasks whose diagnosis is missing, rows with null `user_id`, duplicate `(user_id, client_ref)` if the constraint is absent.
- `profiles`: accounts with a row, how many have each CAT column filled, the JSON shape of `mock_history` (list or object, keys per entry, whether entries have ids, entries per account). **Item-level adoption of mock records depends on this answer.**
- Accounts by data pattern: chats only; chats plus attempts; mock history only; full. This drives the preview's expected size.
- Local-only memory (learning record, behavioural memory, diagnostic memory, exercise archive) is in browsers and **cannot be counted from the database**. State this limit in the report and plan a client-side counting aid in P4.2.
- Deliverable: a shape report with counts and the fixture design for `acct_D_legacy` (one fixture per pattern). Pass: founder confirms the fixtures represent production.

## 6. Migration and rollback prerequisites
- **6a. Backups:** confirm production backups and point-in-time recovery are on; record the restore procedure and who can run it; do a **restore drill into a throwaway project** and time it.
- **6b. Snapshot plan:** before any production migration, export the affected tables and the catalog (steps 2 and 3 outputs) with a date.
- **6c. Migration tooling:** decide how migrations are stored and applied (a `supabase/migrations` folder in the repo, applied by the CLI, versioned) so every change is reviewable and repeatable on staging first. There is no migration history today.
- **6d. Rollback contract (design, not code):** each P4.1 migration ships with a tested down script; the app flag `BETA_GOALS_PERSIST` off restores old behaviour; `undo_adoption` restores adopted rows to unassigned; destructive steps (dropping columns) happen only a full release after the flag flip and after an export.
- **6e. Rehearsal rules:** every migration is run on staging against the synthetic fixtures, then rolled back, then run again; row counts compared at each step; production only after founder sign-off.
- **6f. Old clients:** list cached script versions in circulation (`marg-app.js?v=…`, service worker `sw.js`) and confirm old clients keep working with the new nullable columns (a staging test with an old build).
- **6g. Maintenance window and monitoring:** lock behaviour of `alter table … add column` on the largest table, expected duration, and an owner watching error rates.
- Pass: backups confirmed, restore drill timed, tooling chosen, rollback contract accepted.

## 7. Two-account and two-goal isolation test design
Written now, run in P4.1 onward. Fixtures: users `A`, `B`; goals `A1`, `A2` (both belong to `A`) and `B1`; General Chat threads for `A` and `B`; a legacy `acct_D` with unassigned history. Every goal gets **canary strings**: distinctive text planted in each memory source, so any leak is visible by search.

**7a. Database tests (staging, real tokens)**
| # | Test | Expected |
|---|---|---|
| DB1 | `A` creates `A1`, `A2`; `B` reads goals | `B` sees none of `A`'s |
| DB2 | `A` inserts a task with `goal_id = B1` | refused (composite foreign key) |
| DB3 | `A` updates a task to `goal_id = B1` | refused |
| DB4 | `A` inserts an attempt for `A1`'s task with `goal_id = A2` | refused (consistency trigger) |
| DB5 | evidence goal differs from its diagnosis's goal | refused |
| DB6 | `A` changes `chat_threads.goal_id` from `A1` to `A2` | refused (fixed at creation) |
| DB7 | `A` sets `goal_id` on a null-goal thread once (adoption) | allowed; a second change refused |
| DB8 | `A` queries tasks with `goal_id = A1` | no `A2` rows and no null-goal rows |
| DB9 | `A` queries `goal_id is null` | only unassigned rows |
| DB10 | delete a goal that still has rows | refused (`on delete restrict`) |
| DB11 | `A` creates a `goal_context_shares` row from `A1` to `B1` | refused (both goals must be `A`'s) |
| DB12 | `A` writes `daily_loop_focus` pointing at `B1` | refused |
| DB13 | `profile_fact_consents` with a key outside the allowlist | refused |
| DB14 | no token, expired token on every new table | refused |
| DB15 | goal-count cap (if approved) | refused beyond the cap |

**7b. Adoption, undo, archive, deletion**
| # | Test | Expected |
|---|---|---|
| AD1 | preview on `acct_D` | counts match the fixture; nothing written |
| AD2 | adopt a chosen subset only | only chosen rows get the `goal_id`; others unchanged |
| AD3 | repeat the same adoption | no change, no duplicates (idempotent) |
| AD4 | two tabs adopt at once | one succeeds, the other is a no-op |
| AD5 | failure injected mid-transaction | nothing adopted; before and after counts equal |
| AD6 | `undo_adoption` | exactly the adopted rows return to null; **zero rows deleted**; messages identical |
| AD7 | adopt, add new goal data, undo | new goal data remains with the goal; adopted rows return |
| AR1 | archive `A1` | excluded from Home cards and recommendations; history readable |
| AR2 | permanent delete without archive or without typed title | refused |
| AR3 | permanent delete of `A1` | `A1`'s rows gone; `A2`, General Chat and `B` untouched; event holds counts only |

**7c. Application tests (local harness, no network)**
| # | Test | Expected |
|---|---|---|
| APP1 | **scope contract**: every memory accessor requires an explicit scope; a scan fails on any direct read of a memory key outside the accessor | pass |
| APP2 | prompt for `A1` with canaries in `A1`, `A2`, General | contains only `A1`'s canary |
| APP3 | prompt for `A2` | only `A2`'s canary |
| APP4 | prompt for General Chat | no goal canary at all |
| APP5 | shared fact not consented | absent from every prompt |
| APP6 | shared fact consented, then revoked | present, then absent from the next prompt |
| APP7 | goal-specific data (a weakness, a diagnosis) is never shared even with consent on | absent |
| APP8 | bring in a summary from `A1` to `A2` | appears only in `A2`, visibly, with a recorded share; revoke removes it from the next turn |
| APP9 | switch `A1` → `A2` → `A1` | no key overwritten; `A1` history intact |
| APP10 | a conversation started in `A1` stays in `A1` after switching | pass |
| APP11 | goal title, description or outcome containing instructions or markup | treated as quoted data, escaped, length-capped |
| APP12 | two goals of the same kind in one account (if allowed) | separate memory |
| APP13 | Journey and Home cards for `A1` and `A2` | each shows only its own entries |
| APP14 | Daily Loop focus unset | Home asks; never infers from last use |
| APP15 | goal-scoped browser keys on shared device: sign out and clear | all goal keys cleared |
| APP16 | old conversations with the previous format and the `legacy` thread | open and render unchanged |

**7d. Live (browser, 390px and 1280px)**: the same scenarios with two accounts and two goals each, including reload mid-adoption, reload mid-question inside `A1`, and a failed question load. Each result is labelled LIVE or CODE.

**7e. Mutation tests**: each isolation rule gets a mutant (accessor ignores scope; filter dropped; consent ignored; revoke ignored; goal change allowed; foreign key removed in a staging-only copy). Every mutant must be killed.

## 8. Security review inputs
- List of every place a model prompt is built (the `buildMentorTurnContext` path and each other prompt builder), so each can be checked against the scope contract.
- List of every `localStorage` and `sessionStorage` key that holds student content, with its current scope.
- Confirm no service-role key is present in any client file or the repo.
- Review the privacy page and data-export or delete paths for goals.

## 9. Retention and legal inputs (FOUNDER)
State, in writing: which records must be kept for how long, what a student's permanent deletion request must remove, whether backups are in scope, and who handles requests. Without this the permanent-deletion workflow cannot be finalised.

## 10. P0 exit criteria (all must be true)
1. Staging exists, differs from production by project id, holds no real student data.
2. Schema parity diff is clean or accepted, and `reviews/23` is written and reviewed.
3. Every student table passes the RLS and `WITH CHECK` checks, or the failures are listed and scheduled first.
4. The shape report exists, including the `mock_history` shape and orphan counts.
5. Backups confirmed and a restore drill timed; migration tooling chosen.
6. The isolation test design in section 7 is accepted.
7. Retention rules and the allowlist are stated.
8. Founder gives explicit approval to start P4.1.
9. **(Revision 2)** Staging isolation is evidenced (section 11) and the production-safety safeguards are agreed (section 12).
10. **(Revision 2)** The extended parity table (section 13) is clean or accepted.
11. **(Revision 2)** The sharing design (section 14) and allowlist are agreed, with sharing off by default.
12. **(Revision 2)** The retention policy (section 15) is agreed, and the deletion dependency map (section 16) has every "P0 checks" item answered.
13. **(Revision 2)** The `chats.thread_id` plan (section 17) is accepted with its verification tests and a rehearsed rollback on staging.
14. Blockers B1–B15 (section 18) are closed or consciously accepted.

## Revision 2 — founder clarifications (all seven)
Everything below is **planning only**. It supersedes any earlier text it conflicts with. Nothing is implemented; the retention policy in section 15 is a proposal awaiting agreement.

## 11. Staging isolation (clarification 1)
**Confirmation I can give from the code:** today the app **cannot** talk to any staging project, because the production address is hardcoded in three files. So the current guarantee is "no staging path exists", not "staging is walled off". The walls below must be **built and proved in P4.1**; I cannot confirm them until a staging project exists.

**What "completely separate" means. Each item must differ from production, and each difference must be shown by evidence:**
| Item | Required | Evidence (never print a secret) |
|---|---|---|
| Project reference and URL | different | the two addresses side by side |
| Database and password | different instance and password | separate connection strings held by different people or vaults |
| `anon`/publishable key and `service_role` key | different, staging service key never in the repo or any client file | a short hash prefix of each key, compared; repo scan finds no service key |
| JWT signing secret | different | a token signed by staging is rejected by production and the reverse (see below) |
| Auth configuration | own providers, redirect URLs, email templates, site URL, rate limits | exported auth settings, side by side |
| Storage buckets and their policies | own | bucket list and policy dump |
| Edge functions, cron jobs, webhooks, SMTP, push keys | own, or switched off | list with owners |
| Browser origin | different host, so tokens and `localStorage` never mix | the staging address differs from production |
| Test identities | fixed marker, for example emails ending `@staging.invalid` | used in the production-safety check (section 12) |

**Demonstrating that staging tests cannot write to production (tests to run in P4.1):**
1. **Token rejection:** a staging-signed token sent to the production REST address is refused, and a production token sent to staging is refused. This is a request that must fail and changes nothing; run only with the founder's agreement (decision below). The alternative needing no production call: compare JWT-secret fingerprints held by the dashboard owner and show they differ.
2. **Staging build guard (P4.1 code):** the app picks its project from an environment name, never from a literal. A staging build refuses to start if its configured host is the production host, and shows a visible STAGING banner.
3. **Network wall:** a staging page's Content-Security-Policy `connect-src` lists only the staging project; a test attempts a request to the production host from the staging page and expects it blocked.
4. **No model traffic in staging:** the Worker validates tokens against the production address, so staging tokens would be refused there anyway. Staging app tests use a stubbed model (as the audit stub did). **The Worker and its ledger receive no staging traffic and are not changed.**
5. **Marker check:** after every staging test run, a read-only query on production for the staging marker (section 12) returns **zero** rows.

**Decision for founder:** allow the one failing cross-project request in test 1, or accept fingerprint comparison only.

## 12. Production safety (clarification 6)
| Risk | Safeguard | Proof |
|---|---|---|
| A migration run against the wrong project | migration tool requires an explicit environment name and a project reference; it **refuses** unless the reference matches that environment's allowlisted value; it prints the target host first | dry-run output; a test that feeds the production reference with `--env staging` and sees refusal |
| Production credentials present where staging work happens | staging work uses a separate machine profile or CI job with **only staging credentials**; production credentials are held only by the founder and used for a deliberate, separately named step | credential inventory; shell or CI shows no production variables during staging jobs |
| Production applied before staging | the plan requires a staging rehearsal record (counts before, after, rollback rehearsed) before the production step is even offered | signed rehearsal checklist |
| A catalog or count query changing data | a dedicated **read-only role** for production inspection (read access to catalog and `select` on counts only, `default_transaction_read_only = on`) | the role fails a test write |
| Test data leaking into production | staging fixtures carry the marker; production is checked for it | zero-row marker query after each run |
| Staging service key leaks to production-bound clients | no service-role key in any client file or repo; secret scanning on the repo | scan result |
| Accidental production change despite the above | point-in-time recovery enabled and a **timed restore drill** done beforehand; policy and table-count snapshot before any production step, compared after | drill record; before and after snapshots |
| Worker changed | the Worker files are out of scope for the whole feature | `git diff` shows no change to `cloudflare-worker.js` or `worker-ledger-memory.mjs` on any Phase 4 branch |
| Production migration run by mistake from a laptop | production migrations run only from a single, named procedure with a typed confirmation of the project reference | the procedure document |

## 13. Schema parity, extended (clarification 2)
Beyond tables, columns, constraints, indexes, functions, triggers and RLS (steps 2–4), parity must also cover **extensions, enum and custom types, sequences, views, publications, `auth` triggers, storage buckets and policies, scheduled jobs, role grants, and settings that are not in SQL (auth configuration)**.
- Method: export each catalog object normalised (stable order, no oids), hash it, and compare production against staging object by object. Output is a table: object, production hash, staging hash, same or different, reason.
- Pass: zero differences, or each one listed with a reason and accepted by the founder.
- **Triggers on `auth.users` matter most** (for example one that creates a `profiles` row at sign-up). If one exists and staging lacks it, new test users will have no profile and results will mislead.
- Auth configuration and edge settings are not catalog data: record them from the dashboard or the management interface side by side.
- Additional queries A10–A15 are added to the appendix.

## 14. Sharing permissions (clarification 3) — D4 clarified
**Sharing stays disabled by default. Nothing is shared until the student turns on a specific fact for a specific destination.**

**Who receives a shared fact (and who never does):**
- **Receives:** only the mentoring prompt of **one other destination of the same student**: a different goal, or General Chat if the student chooses it. The text is put into that prompt as a labelled line ("the student said…") and the model reads it.
- **Never receives:** any other student, the community, referral recipients, analytics, advertisers, or other goals the student did not choose. The fact is not copied into another goal's stored history and is not displayed to anyone but the student. (Normal operator access to stored data is governed by the privacy policy, as for all account data.)

**The four proposed facts, and what the code actually has:**
| Fact | Purpose when shared | Stored today? |
|---|---|---|
| Study hours per day | size plans realistically in another goal | yes: `profiles.daily_hours` |
| Work-or-study situation | set tone and time limits | yes: `profiles.situation` |
| Time zone | time reminders and "today" | **no**: the app hardcodes `Asia/Kolkata`; nothing is stored per student |
| Preferred language | reply language | **no**: not stored anywhere I can find |

**Finding:** two of the four facts do not exist as stored data. Sharing them would mean collecting new data. **Recommendation:** start the allowlist with the two that exist, and add the others only when the product collects them, as a separate approval.

**Consent, review and revocation:**
- **Individual consent:** one consent per **fact and destination**. For example "share study hours from my CAT goal with Goal B". No bundled "share everything" switch. Consent table: `profile_fact_consents (user_id, fact_key, to_goal_id nullable for General Chat, granted_at, revoked_at)`, composite-keyed to the destination goal. This **replaces** the earlier one-row-per-key design.
- **Default:** no row means no sharing. A new goal starts with all sharing off. Creating a second goal may show one neutral, unticked choice; it never pre-ticks.
- **Review:** a Sharing settings screen shows a grid of facts by destination, the current value, when each was shared, and **the exact line the model will see**.
- **Revocation:** switching a cell off stops that fact from the destination's **next** prompt. Text already sent to the model in earlier turns cannot be recalled, and the screen says so. A master "turn off all sharing" control revokes every consent at once. Revocation is recorded without storing the value.
- **Edits:** the value is read live from its owner, so an edited value updates; the student sees that before consenting, and may revoke at any time.
- **Never shareable, even with consent:** attempts, weaknesses, diagnoses, hypotheses, experiments, interventions, evidence, mock records, learning records, wrong-answer logs, the CAT-specific columns, and goal title, description and outcome. Goal-to-goal "bring in" (D2) is a separate explicit action, not part of this allowlist.
- **Open question:** whether a consent should expire (for example after 12 months) and be re-asked.

## 15. Retention policy proposal (clarification 5) — PROPOSED, NOT IMPLEMENTED
Needs founder and counsel agreement before any build. Bracketed values are proposals.
| State | Content retained | Recommendations and Home | Retention |
|---|---|---|---|
| **Active, paused, completed** | all goal data | active appears; paused and completed do not drive the Daily Loop | kept while the account exists |
| **Archived** | all goal data, read-only | excluded | kept until the student deletes it; **no automatic deletion**; optional yearly reminder to review, off by default |
| **Permanently deleted** | goal content removed from live tables in one transaction; derived stores in section 16 cleaned within [24 hours]; browser copies removed on each device's next sign-in | gone | a **content-free tombstone** (goal id, deleted time, counts) kept [12 months] to sync other devices and to replay deletions after any backup restore; nothing else |
| **Account deleted** | all goals deleted as above | — | cascade within [30 days] |
| **Backups** | deleted data persists in Supabase backups until they expire ([7–30 days], P0 confirms the plan's period) and is never restored selectively | — | after any restore, tombstones are replayed so deleted goals are deleted again |
| **Audit events** | counts and event names only; no titles, no text | — | [12 months] |
| **Records already outside our control** | model-improvement copies the student consented to, referral challenges already shared, text sent to the model provider | — | disclosed in the deletion screen; we delete our copy and cannot recall others |
Inputs needed (FOUNDER, section 9): legal minimums, the backup expiry period, and whether model-improvement copies fall under the deletion promise.

## 16. Deletion dependency map (clarification 4)
Every place goal content or a reference to it can live, and what permanent deletion does. "Link" is how the record is tied to a goal; "needs" is what must exist first.
| # | Store | What it holds | Link to goal | Deletion action | Residual risk |
|---|---|---|---|---|---|
| 1 | `chats` messages | the conversation | `thread_id` → thread → goal (**needs `chats.thread_id`**) | delete rows of the goal's threads | tails inside `content` go with the row |
| 2 | `chats` hidden rows `[MARG_INTERNAL:EXERCISE/BEHAVIOR/HYPOTHESIS/MENTOR_EVIDENCE/PLAN]` | full questions with answers, behaviour, hypotheses, plan | same thread tag | deleted with the thread | none |
| 3 | `chats` hidden rows `PERSONAL_GOAL`, `PROFILE_CONTEXT` | the student's goal text and profile facts | thread tag, but they may be **account-level facts saved inside a goal's thread** | **do not blindly delete**: P0 classifies them; account-level ones are re-homed first | deleting the only copy of an account fact, or keeping goal text |
| 4 | `chat_threads` | title, purpose | `goal_id` | delete | none |
| 5 | `mentor_tasks` | task text; `action_payload.artifact_snapshot` holds the full question, options, results | `goal_id` | delete | none |
| 6 | `mentor_task_attempts` | counts, answers, selections, interactions in `behaviour_data` | `goal_id` | delete | none |
| 7 | `mentor_diagnoses` | working hypotheses, mechanisms | `goal_id` | delete | none |
| 8 | `mentor_diagnosis_evidence` | the student's own claims and payload | `goal_id` | delete | none |
| 9 | `goal_adoptions` and `goal_adoption_items` | which rows were adopted (keys only) | `goal_id` | delete | none (no content) |
| 10 | `goal_context_shares` | **copied summaries or facts**, as source and as target | `from_goal_id`, `to_goal_id` | delete rows where the deleted goal is **either** side; the dry run tells the student that items brought into another goal will also be removed | a derived copy surviving in the other goal if missed |
| 11 | `profile_fact_consents` | consent, no values | `to_goal_id` | delete | none |
| 12 | `daily_loop_focus` | pointer | `goal_id` | set to null | Home asks again |
| 13 | `checkins` | hours studied per day | **no goal link today**; needs a nullable `goal_id` if a check-in belongs to a goal | delete goal-linked rows; leave account-level ones | cannot separate old check-ins |
| 14 | `profiles` CAT columns (`attempt_number`, `months_left`, `weakest_section`, `*_cognitive_pattern`, `last_task`, `last_insight`, `mock_history`, practice topic log) | **goal content held on the account row** | none (one row per account) | the goal-type adapter **clears these fields** on deletion of that goal; account-level columns stay | a missed column; P0 classifies every column |
| 15 | `conversation_question_state` | active question per conversation | `conversation_id` = thread id | delete by thread | none |
| 16 | `question_images`, `image_questions` and Storage objects | the student's uploaded pages and scorecards | unknown: P0 checks whether rows carry a conversation or goal link | delete rows **and** stored files | **files orphaned in Storage**, if no link |
| 17 | `marg_response_reviews` | feedback; **full user and assistant message text when the student allowed model improvement** | `conversation_id` = thread id | delete by thread | copies already used for model improvement cannot be recalled |
| 18 | `push_notification_queue` | reminder `title` and `body` written from a goal task | **no goal id today** (only `dedupe_key`, `target_path`) | add a link or match by reminder identity; delete pending and sent rows | reminder text surviving after deletion |
| 19 | `web_push_subscriptions` | device endpoints | none, device-level | **keep** | none |
| 20 | `referral_challenges` | **a shared copy of a question, options, explanation, with a public share token** | no goal id | delete the creator's rows made from this goal and disable their tokens | other people's already-opened copies and attempts cannot be recalled |
| 21 | `engagement_events` | event type and metadata (used for community eligibility) | none | P0 checks metadata for content; keep counts, strip topic strings if any | eligibility changes if events are removed |
| 22 | `product_incidents` | technical metadata only: section, topic, stage, short technical message | none | P0 verifies no student text; otherwise keep | topic words only |
| 23 | `feedback` | free text, may mention goals | none | **cannot be linked**; disclosed | text surviving |
| 24 | Browser storage | learning record, behavioural and diagnostic memory, exercise archive, active plan, wrong answers, topic progression, **session summary signature**, thread index and per-thread state, study context, progressive profile | key includes goal id (after P4.3) | removed on the device; **other devices are cleaned on next sign-in using the tombstone** | a device that never signs in again |
| 25 | `sessionStorage` referral cache; service-worker caches | cached challenge data | none | P0 checks what `sw.js` caches (no cache calls found in a quick scan) | stale cache |
| 26 | `goal_events` audit | event name, counts, ids | goal id | **must hold no title, text or kind**; deleted goal leaves one tombstone row | content leaking into the audit |
| 27 | Cloudflare Worker logs and spend ledger | request ids, subject hash, token counts | none | **not touched** | P0 verifies logs hold no prompt text |
| 28 | Model provider | prompts in transit | none | **cannot be deleted by Marg**; governed by the provider's terms | disclosed |
| 29 | Backups | everything above | none | expire on schedule; tombstones replay deletions after a restore | data lives until expiry |

**Statement on audit logs and derived records (clarification 4):** deletion removes content from rows 1–17 and 24. Audit data (row 26) is designed to hold **only ids, event names and counts**, never goal titles, outcomes, message text or `kind`. That claim is **verified by a canary scan**: plant distinctive strings in every content field of a test goal, delete it, then search every table (including JSON columns and storage, the tombstone, `goal_events`, incidents and engagement metadata) and every browser key. **Zero hits** is the pass condition. Rows 13, 18, 20, 23 and 28 show where this is **not yet guaranteed** and what must be added or disclosed.

## 17. `chats.thread_id` migration plan (clarification 7) — design only
**Today:** `chats` has no thread column. A message's thread is a trailing `[MARG_THREAD:{…}]` tag on `content`; untagged rows are the `legacy` thread. The tag id is either `legacy` or a 36-character uuid. The real table and any existing column must be confirmed in step 2d first.

**Steps (each rehearsed on staging against fixtures before production):**
- **A. Add the column (additive).** `thread_id uuid null`, no default, no constraint. In current Postgres this changes only the catalog and does not rewrite the table; it needs a very short exclusive lock, so run with a lock timeout and retry. Create the index `(user_id, thread_id, created_at)` in a separate step that does not hold writes.
- **B. Thread registry.** Create `chat_threads` (`reviews/21`, section 3.2). `legacy` maps to a deterministic per-user uuid with `client_thread_id = 'legacy'`.
- **C. Backfill in small batches.** For rows with `thread_id is null`: read the last `[MARG_THREAD:…]` tag with an anchored pattern, decode, and take its id; no tag becomes the legacy uuid; a malformed tag becomes legacy and its row id is logged to an exceptions list (ids only). Batches of about [1,000] rows by primary key, committing each batch, safe to stop and resume, run off-peak. **`content` is never modified.**
- **D. Keep new writes consistent.** The new client writes `thread_id` and keeps the tag for old clients. A database trigger fills `thread_id` from the tag when an **old client** inserts without it; if the tag cannot be read the column stays null. (Decision for P4.1.)
- **E. Constraint after coverage.** Add a composite foreign key `(thread_id, user_id) → chat_threads (id, user_id)` as not valid, then validate (no long lock). The column stays **nullable permanently** so old clients keep working.
- **F. Cutover.** The app reads threads through `thread_id` only when the flag is on **and** coverage is complete; until then the tag remains the source of truth.

**Impact on existing records:** one new empty column and an index. No row's `content`, id, owner or time changes. Row-level security is unaffected because policies use `user_id`. Old clients receive an extra field from `select=*` and must be shown to ignore it (test V9). Size grows by a few bytes a row plus the index. Reads through the tag are unchanged.

**A misfiling risk to note:** a modified client could write a tag naming any thread of the **same** user. The composite key means it can only misfile its own messages, never another student's.

**Rollback (lossless, because the column is derived):** (1) turn the flag off so reads return to the tag; (2) drop the trigger; (3) set `thread_id` to null or drop the column and its index. Nothing is lost because `content` was never changed. Rehearse this on staging (V14). Dropping the column is done only a full release after the flag flip.

**Verification tests:**
| # | Test | Pass |
|---|---|---|
| V1 | before migration: total rows, rows per account, a checksum over `(id, md5(content))` | recorded |
| V2 | after step A: same totals and the **same checksum** | identical |
| V3 | after backfill: every tagged row's `thread_id` equals the id parsed again independently in SQL | 0 mismatches |
| V4 | untagged rows | all legacy uuid for their owner |
| V5 | malformed tails | listed by id, counted, reviewed |
| V6 | run the backfill again | 0 rows changed |
| V7 | stop it midway and resume | same final state |
| V8 | an old-format insert while the trigger is on | `thread_id` filled correctly |
| V9 | old client build on staging against the migrated table | loads the same threads and messages as before |
| V10 | differential test: new client by `thread_id` versus tag parsing for every fixture account | identical threads and message counts |
| V11 | insert with a `thread_id` belonging to another user | refused |
| V12 | `EXPLAIN` of the conversation load with and without the index | index used, time recorded |
| V13 | lock time and total time on a staging table sized like production | within the agreed window |
| V14 | full rollback rehearsal | app unchanged, checksum equals V1 |
| V15 | deletion by thread after backfill | deleted count equals the expected count |
| V16 | writes arriving during the backfill | all covered by the trigger or a final sweep |

## 18. Remaining blockers
| # | Blocker | Owner | Blocks |
|---|---|---|---|
| B1 | Does a staging project exist (step 1)? | founder | everything database-related |
| B2 | Proof of separate credentials, auth settings and keys (section 11) | founder, then me | P4.1 |
| B3 | Agreement to the one cross-project rejection test, or fingerprints only | founder | section 11 test 1 |
| B4 | Read-only production role, and who runs the catalog and count queries | founder or DBA | steps 2, 5 |
| B5 | Real schema, constraints, triggers (including on `auth.users`), grants, policies | staging export | the whole design |
| B6 | RLS `WITH CHECK` results for every student table | staging tests | P4.1 |
| B7 | `profiles` column classification (account-level or goal-level) and the `mock_history` shape | staging export and counts | adoption, deletion, sharing |
| B8 | Allowlist: only two of four facts exist as stored data | founder | D4 |
| B9 | Retention policy (section 15) agreed, with legal inputs and the backup expiry | founder and counsel | deletion workflow |
| B10 | Where uploaded images link to a conversation or goal; Storage object ownership | staging export | deletion |
| B11 | Whether model-improvement copies fall under the deletion promise | founder and counsel | deletion |
| B12 | Referral-challenge deletion semantics (public tokens, recipients) | founder | deletion |
| B13 | `PERSONAL_GOAL` and `PROFILE_CONTEXT` rows: account-level or goal-level | founder, then me | adoption and deletion |
| B14 | Worker logs hold no prompt text (read-only check of the Worker's logging) | founder | deletion claim |
| B15 | Decide the old-client trigger (step 17 D) and the consent-expiry question | founder | P4.1 |
Everything is blocked first on B1. B5–B7 cannot be answered until staging exists and is exported.

## Appendix: read-only catalog queries (for the founder or DBA)
These only read the system catalog. They change nothing. Run them on staging, and on production only under a read-only role.
- **A1 columns:** `select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' order by table_name, ordinal_position;`
- **A2 constraints:** `select conrelid::regclass, conname, contype, pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace order by 1,2;`
- **A3 indexes:** `select tablename, indexname, indexdef from pg_indexes where schemaname='public' order by 1,2;`
- **A4 triggers:** `select event_object_table, trigger_name, action_timing, event_manipulation, action_statement from information_schema.triggers where trigger_schema='public';`
- **A5 functions:** `select p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef, pg_get_functiondef(p.oid) from pg_proc p where pronamespace='public'::regnamespace;`
- **A6 grants:** `select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema='public' order by 1,2,3;`
- **A7 RLS flags:** `select relname, relrowsecurity, relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r';`
- **A8 policies:** `select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' order by 1,2;`
- **A9 sizes:** `select relname, n_live_tup from pg_stat_user_tables order by n_live_tup desc;`
- **A10 extensions:** `select extname, extversion from pg_extension order by 1;`
- **A11 types, sequences, views:** `select n.nspname, t.typname, t.typtype from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype in ('e','d','c');` and `select sequence_name from information_schema.sequences where sequence_schema='public';` and `select table_name from information_schema.views where table_schema='public';`
- **A12 triggers on auth users:** `select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal;`
- **A13 storage:** `select id, name, public from storage.buckets;` and `select policyname, cmd, qual, with_check from pg_policies where schemaname='storage';`
- **A14 scheduled jobs:** `select jobname, schedule, command from cron.job;` (only if `pg_cron` is installed).
- **A15 publications and roles:** `select pubname, puballtables from pg_publication;` and `select rolname, rolcanlogin, rolbypassrls from pg_roles where rolname !~ '^pg_';`
- **Shape counts (production, counts only):** for example `select count(*) filter (where content like '%[MARG_THREAD:%') as tagged, count(*) filter (where content like '[MARG_INTERNAL:%') as internal, count(*) as total, count(distinct user_id) as users from chats;` and the matching count queries for the orphan checks in step 5. Do not select `content`.
