-- Run on STAGING only. Self-rolling-back. Proves: before revoke account can TRUNCATE; after, cannot; DML still allowed.
do $$
declare r text := ''; mig text; ok boolean;
begin
  -- before
  select count(*) = 5 into ok from information_schema.role_table_grants
   where grantee='authenticated' and privilege_type='TRUNCATE' and table_schema='public'
     and table_name in ('question_images','image_questions','conversation_question_state','marg_response_reviews','product_incidents');
  r := r || 'before: 5 tables truncatable=' || ok || E'\n';
  revoke truncate, references, trigger on table public.question_images, public.image_questions,
    public.conversation_question_state, public.marg_response_reviews, public.product_incidents from authenticated;
  select count(*) into mig from information_schema.role_table_grants
   where grantee in ('authenticated','anon') and table_schema='public' and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER');
  r := r || 'after: remaining truncate/references/trigger grants=' || mig || E'\n';
  select count(*) into mig from information_schema.role_table_grants
   where grantee='authenticated' and table_schema='public' and table_name='product_incidents' and privilege_type in ('SELECT','INSERT','UPDATE','DELETE');
  r := r || 'after: product_incidents DML privileges kept=' || mig || E'\n';
  perform set_config('role','authenticated',true);
  begin truncate public.product_incidents; r := r || 'TRUNCATE as authenticated: STILL ALLOWED' || E'\n';
  exception when insufficient_privilege then r := r || 'TRUNCATE as authenticated: denied' || E'\n'; end;
  raise exception '%', r;
end $$;
