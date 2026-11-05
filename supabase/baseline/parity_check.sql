-- Read-only schema parity fingerprint. Run the SAME statement on production and staging
-- and compare the rows. Class-level md5 plus counts; if a class differs, drill into it.
select 'columns' as class, count(*) n, md5(string_agg(table_schema||'.'||table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,''), '|' order by table_schema, table_name, column_name)) h
  from information_schema.columns where table_schema in ('public','private')
union all select 'constraints', count(*), md5(string_agg(conrelid::regclass::text||'.'||conname||':'||pg_get_constraintdef(oid), '|' order by conrelid::regclass::text, conname))
  from pg_constraint where connamespace in ('public'::regnamespace,'private'::regnamespace)
union all select 'indexes', count(*), md5(string_agg(indexdef, '|' order by indexname))
  from pg_indexes where schemaname in ('public','private')
union all select 'policies_public', count(*), md5(string_agg(tablename||'.'||policyname||':'||cmd||':'||array_to_string(roles,',')||':'||coalesce(qual,'')||':'||coalesce(with_check,''), '|' order by tablename, policyname))
  from pg_policies where schemaname='public'
union all select 'policies_storage', count(*), md5(string_agg(policyname||':'||cmd||':'||array_to_string(roles,',')||':'||coalesce(qual,'')||':'||coalesce(with_check,''), '|' order by policyname))
  from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'question_images%'
union all select 'functions', count(*), md5(string_agg(pg_get_functiondef(p.oid), '|' order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
union all select 'rls_flags', count(*), md5(string_agg(c.relnamespace::regnamespace::text||'.'||c.relname||':'||c.relrowsecurity||':'||c.relforcerowsecurity, '|' order by c.relnamespace::regnamespace::text, c.relname))
  from pg_class c where c.relkind='r' and c.relnamespace in ('public'::regnamespace,'private'::regnamespace)
union all select 'table_grants', count(*), md5(string_agg(table_name||':'||grantee||':'||privilege_type, '|' order by table_name, grantee, privilege_type))
  from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')
union all select 'function_grants', count(*), md5(string_agg(routine_name||':'||grantee, '|' order by routine_name, grantee))
  from information_schema.routine_privileges where routine_schema='public' and grantee in ('anon','authenticated','PUBLIC')
union all select 'auth_signup_trigger', count(*), md5(string_agg(pg_get_triggerdef(t.oid), '|'))
  from pg_trigger t where t.tgname='ensure_marg_profile_after_auth_signup'
union all select 'bucket', count(*), md5(string_agg(id||public::text||file_size_limit::text||allowed_mime_types::text, '|'))
  from storage.buckets;
