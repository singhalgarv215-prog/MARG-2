-- DRAFT, NOT APPLIED TO PRODUCTION. For founder review (finding F1).
-- Removes TRUNCATE, REFERENCES and TRIGGER from role "authenticated" on the five
-- tables where production grants them. SELECT/INSERT/UPDATE/DELETE are untouched,
-- so the app (which only uses those) is unaffected; RLS still governs them.
-- Idempotent: REVOKE of a privilege not held is a no-op.
revoke truncate, references, trigger on table
  public.question_images,
  public.image_questions,
  public.conversation_question_state,
  public.marg_response_reviews,
  public.product_incidents
from authenticated;
-- Also stop future tables inheriting the over-broad grant (no-op if none set).
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;
