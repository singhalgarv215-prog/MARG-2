# 24 — F1 fix draft: remove TRUNCATE / REFERENCES / TRIGGER from `authenticated`

**Status: DRAFT. Not applied to production.** Production was only read (one catalog query). Nothing committed.

## Decision needed
Approve applying `f1_revoke_truncate_references_trigger.sql` to production, or tell me to hold it.

## Plain English
Five production tables let any signed-in role empty them with `TRUNCATE`, which skips row-level security. The draft removes the three unneeded powers (TRUNCATE, REFERENCES, TRIGGER) from those five tables. Normal read, insert, update and delete are untouched, so the app should not notice.

## Evidence
- **VERIFIED (production, read-only catalog query):** exactly five tables carry these grants, all to `authenticated` only (none to `anon`): `question_images`, `image_questions`, `conversation_question_state`, `marg_response_reviews`, `product_incidents`. No table in `private` has them.
- **VERIFIED (staging, rolled-back transaction):** before: 5 tables truncatable. After the revoke: 0 truncate/references/trigger grants left for `authenticated` or `anon`; `product_incidents` still holds its 4 DML privileges; `TRUNCATE` as `authenticated` is denied.
- **READ-ONLY reasoning:** the app only uses select/insert/update/delete through the REST API, so nothing depends on the removed privileges. I did not grep the Worker or edge code for direct SQL; the Worker uses REST. The `service_role` and `postgres` roles are not affected.

## Files (uncommitted, in the `claude/phase4-goals` worktree)
- `supabase/production-drafts/f1_revoke_truncate_references_trigger.sql` — the fix (idempotent), plus a default-privileges revoke so future tables do not inherit the grant.
- `supabase/production-drafts/f1_revoke_truncate_references_trigger.rollback.sql` — restores the old grants (emergency only).
- `supabase/tests/f1_revoke_check.sql` — staging test; rolls itself back.

## Limits
- The test ran on staging, not production. Staging still has the old grants (I rolled the test back to keep parity).
- I did not check whether the default-privileges line matches the actual defaults in production; it is a no-op if none exist. Drop that line if you want the smallest possible change.
- It does not fix whether other roles (e.g. `PUBLIC`) hold the same grants: the query covered `anon`, `authenticated` and `public` and found only the five above.
- Applying to production is a deploy-type action. I will not do it without your explicit instruction, and it should be a reviewed migration, not a manual SQL run.
