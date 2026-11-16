-- MARG P4.1: persistent goals foundation. ADDITIVE. Applied to STAGING only.
-- Production has not been touched. Nothing here deletes, rewrites or backfills existing rows.
-- Design source: reviews/21-phase4-goals-architecture.md (D1-D6). Divergences from that text are listed
-- in reviews/23-phase4-p4-1-staging-schema.md.

-- ---------------------------------------------------------------- helpers (private schema)
create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- Counts-only guard for the audit table: no string value longer than 40 characters, size bounded.
create or replace function private.detail_is_counts_only(d jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(d) = 'object'
     and octet_length(d::text) <= 2048
     and not jsonb_path_exists(d, '$.** ? (@.type() == "string" && @ like_regex "^.{41}")')
$$;

-- ---------------------------------------------------------------- goals
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (length(kind) between 1 and 40),
  title text not null check (length(btrim(title)) between 1 and 120),
  description text check (description is null or length(description) <= 1000),
  desired_outcome text check (desired_outcome is null or length(desired_outcome) <= 500),
  status text not null default 'active' check (status in ('active','paused','completed')),
  origin text not null default 'created' check (origin in ('created','adopted_workspace')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  adopted_at timestamptz,
  archived_at timestamptz,
  unique (id, user_id)
);
create index goals_user_status_idx on public.goals (user_id, status) where archived_at is null;
create index goals_user_created_idx on public.goals (user_id, created_at desc);

create trigger goals_touch before update on public.goals
  for each row execute function private.touch_updated_at();

-- cap: at most 10 live (not archived, not completed) goals per user; serialised per user
create or replace function private.goals_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('marg.goals.cap.' || new.user_id::text, 0));
    if new.archived_at is null and new.status <> 'completed'
       and (select count(*) from public.goals g where g.user_id = new.user_id and g.archived_at is null and g.status <> 'completed') >= 10 then
      raise exception 'Goal limit reached (10 live goals)' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then raise exception 'goal owner cannot change' using errcode = '23514'; end if;
    if new.kind <> old.kind then raise exception 'goal kind cannot change' using errcode = '23514'; end if;
    if new.origin <> old.origin then raise exception 'goal origin cannot change' using errcode = '23514'; end if;
  end if;
  if new.adopted_at is distinct from (case when tg_op = 'UPDATE' then old.adopted_at else null end)
     and coalesce(current_setting('marg.adopting', true), '') <> 'adopt' then
    raise exception 'adopted_at can only be set by adoption' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger goals_guard before insert or update on public.goals
  for each row execute function private.goals_guard();

-- ---------------------------------------------------------------- chat_threads
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid,
  client_thread_id text not null check (length(client_thread_id) between 1 and 160),
  title text not null check (length(title) <= 80),
  purpose_key text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (user_id, client_thread_id),
  constraint chat_threads_goal_owner_fk foreign key (goal_id, user_id) references public.goals (id, user_id)
);
create index chat_threads_user_goal_idx on public.chat_threads (user_id, goal_id, updated_at desc);
create trigger chat_threads_touch before update on public.chat_threads
  for each row execute function private.touch_updated_at();

-- D2: a conversation's goal is fixed at creation. Only adoption may set it from null, only undo may clear it.
create or replace function private.guard_goal_id_change() returns trigger
language plpgsql set search_path = '' as $$
declare mode text := coalesce(current_setting('marg.adopting', true), '');
begin
  if new.user_id <> old.user_id then raise exception 'owner cannot change' using errcode = '23514'; end if;
  if new.goal_id is distinct from old.goal_id then
    if (old.goal_id is null and mode = 'adopt') or (new.goal_id is null and mode = 'undo') then
      return new;
    end if;
    raise exception 'goal_id is fixed once set' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger chat_threads_goal_fixed before update on public.chat_threads
  for each row execute function private.guard_goal_id_change();

-- ---------------------------------------------------------------- goal_id on the four mentor tables
alter table public.mentor_diagnoses          add column goal_id uuid;
alter table public.mentor_tasks              add column goal_id uuid;
alter table public.mentor_task_attempts      add column goal_id uuid;
alter table public.mentor_diagnosis_evidence add column goal_id uuid;

alter table public.mentor_diagnoses          add constraint mentor_diagnoses_goal_owner_fk          foreign key (goal_id, user_id) references public.goals (id, user_id);
alter table public.mentor_tasks              add constraint mentor_tasks_goal_owner_fk              foreign key (goal_id, user_id) references public.goals (id, user_id);
alter table public.mentor_task_attempts      add constraint mentor_task_attempts_goal_owner_fk      foreign key (goal_id, user_id) references public.goals (id, user_id);
alter table public.mentor_diagnosis_evidence add constraint mentor_diagnosis_evidence_goal_owner_fk foreign key (goal_id, user_id) references public.goals (id, user_id);

create index mentor_diagnoses_goal_idx          on public.mentor_diagnoses (user_id, goal_id, updated_at desc);
create index mentor_tasks_goal_idx              on public.mentor_tasks (user_id, goal_id, updated_at desc);
create index mentor_task_attempts_goal_idx      on public.mentor_task_attempts (user_id, goal_id, completed_at desc);
create index mentor_diagnosis_evidence_goal_idx on public.mentor_diagnosis_evidence (user_id, goal_id, occurred_at desc);
create index mentor_diagnoses_unassigned_idx          on public.mentor_diagnoses (user_id) where goal_id is null;
create index mentor_tasks_unassigned_idx              on public.mentor_tasks (user_id) where goal_id is null;
create index mentor_task_attempts_unassigned_idx      on public.mentor_task_attempts (user_id) where goal_id is null;
create index mentor_diagnosis_evidence_unassigned_idx on public.mentor_diagnosis_evidence (user_id) where goal_id is null;

create trigger mentor_diagnoses_goal_fixed          before update on public.mentor_diagnoses          for each row execute function private.guard_goal_id_change();
create trigger mentor_tasks_goal_fixed              before update on public.mentor_tasks              for each row execute function private.guard_goal_id_change();
create trigger mentor_task_attempts_goal_fixed      before update on public.mentor_task_attempts      for each row execute function private.guard_goal_id_change();
create trigger mentor_diagnosis_evidence_goal_fixed before update on public.mentor_diagnosis_evidence for each row execute function private.guard_goal_id_change();

-- A child row must live in the same goal as its parent (same user, same goal id, or both unassigned).
create or replace function private.mentor_parent_goal_match() returns trigger
language plpgsql set search_path = '' as $$
declare
  j jsonb := to_jsonb(new);  -- one function serves three tables with different columns
  diag uuid := nullif(j->>'diagnosis_id', '')::uuid;
  task uuid := nullif(j->>'task_id', '')::uuid;
  parent_goal uuid; parent_found boolean := false;
begin
  -- adopt/undo move a whole family in several statements; those RPCs call public.goal_family_mismatches() at the end
  if coalesce(current_setting('marg.adopting', true), '') in ('adopt', 'undo') then return new; end if;
  if tg_table_name in ('mentor_tasks', 'mentor_diagnosis_evidence') then
    if diag is null then return new; end if;
    select true, d.goal_id into parent_found, parent_goal from public.mentor_diagnoses d where d.id = diag and d.user_id = new.user_id;
  elsif tg_table_name = 'mentor_task_attempts' then
    select true, t.goal_id into parent_found, parent_goal from public.mentor_tasks t where t.id = task and t.user_id = new.user_id;
  else
    return new;
  end if;
  if parent_found and new.goal_id is distinct from parent_goal then
    raise exception 'row and its parent must belong to the same goal' using errcode = '23514';
  end if;
  return new;
end $$;
-- public (not private): the RPCs run as the caller, who has no access to the private schema. Security invoker, so RLS applies.
create or replace function public.goal_family_mismatches(p_user uuid) returns int
language sql stable security invoker set search_path = '' as $$
  select (select count(*) from public.mentor_tasks t join public.mentor_diagnoses d on d.id = t.diagnosis_id and d.user_id = t.user_id
            where t.user_id = p_user and t.goal_id is distinct from d.goal_id)
       + (select count(*) from public.mentor_diagnosis_evidence e join public.mentor_diagnoses d on d.id = e.diagnosis_id and d.user_id = e.user_id
            where e.user_id = p_user and e.goal_id is distinct from d.goal_id)
       + (select count(*) from public.mentor_task_attempts a join public.mentor_tasks t on t.id = a.task_id and t.user_id = a.user_id
            where a.user_id = p_user and a.goal_id is distinct from t.goal_id)
$$;

create trigger mentor_tasks_parent_goal              before insert or update of goal_id, diagnosis_id on public.mentor_tasks              for each row execute function private.mentor_parent_goal_match();
create trigger mentor_diagnosis_evidence_parent_goal before insert or update of goal_id, diagnosis_id on public.mentor_diagnosis_evidence for each row execute function private.mentor_parent_goal_match();
create trigger mentor_task_attempts_parent_goal      before insert or update of goal_id, task_id      on public.mentor_task_attempts      for each row execute function private.mentor_parent_goal_match();

-- ---------------------------------------------------------------- audit, shares, adoption, consent, focus
create table public.goal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid, -- deliberately no FK: the audit row must survive permanent deletion; it holds counts only
  event text not null check (event in ('create','adopt','undo_adopt','pause','resume','complete','archive','unarchive','share','revoke_share','consent_grant','consent_revoke','focus_set','delete')),
  detail jsonb not null default '{}'::jsonb check (private.detail_is_counts_only(detail)),
  created_at timestamptz not null default now()
);
create index goal_events_user_idx on public.goal_events (user_id, created_at desc);

create table public.goal_context_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_goal_id uuid not null,
  to_goal_id uuid not null,
  kind text not null check (kind in ('fact','summary')),
  content text not null check (length(content) between 1 and 2000),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (from_goal_id <> to_goal_id),
  constraint goal_context_shares_from_fk foreign key (from_goal_id, user_id) references public.goals (id, user_id),
  constraint goal_context_shares_to_fk   foreign key (to_goal_id, user_id)   references public.goals (id, user_id)
);
create index goal_context_shares_to_idx on public.goal_context_shares (user_id, to_goal_id) where revoked_at is null;

create table public.goal_adoptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 120),
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  unique (user_id, idempotency_key),
  unique (id, user_id),
  constraint goal_adoptions_goal_fk foreign key (goal_id, user_id) references public.goals (id, user_id)
);
create table public.goal_adoption_items (
  adoption_id uuid not null,
  user_id uuid not null,
  table_name text not null check (table_name in ('mentor_diagnoses','mentor_tasks','mentor_task_attempts','mentor_diagnosis_evidence','chat_threads','mock_history')),
  row_key text not null check (length(row_key) between 1 and 200),
  primary key (adoption_id, table_name, row_key),
  constraint goal_adoption_items_adoption_fk foreign key (adoption_id, user_id) references public.goal_adoptions (id, user_id) on delete cascade
);

-- D4 / founder decision: only profiles.daily_hours is eligible. Adding a key later needs a new migration, on purpose.
create table public.profile_fact_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fact_key text not null check (fact_key in ('daily_hours')),
  to_goal_id uuid, -- null = General Chat
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint profile_fact_consents_goal_fk foreign key (to_goal_id, user_id) references public.goals (id, user_id)
);
create unique index profile_fact_consents_live_uq on public.profile_fact_consents
  (user_id, fact_key, coalesce(to_goal_id, '00000000-0000-0000-0000-000000000000'::uuid)) where revoked_at is null;

create table public.daily_loop_focus (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goal_id uuid,
  updated_at timestamptz not null default now(),
  constraint daily_loop_focus_goal_fk foreign key (goal_id, user_id) references public.goals (id, user_id)
);
create trigger daily_loop_focus_touch before update on public.daily_loop_focus
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------- RLS and grants (new tables)
do $$
declare t text;
begin
  foreach t in array array['goals','chat_threads','goal_events','goal_context_shares','goal_adoptions','goal_adoption_items','profile_fact_consents','daily_loop_focus']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t||'_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t||'_insert_own', t);
  end loop;
  foreach t in array array['goals','chat_threads','goal_context_shares','goal_adoptions','profile_fact_consents','daily_loop_focus']
  loop
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t||'_update_own', t);
  end loop;
end $$;
-- No DELETE policy or grant anywhere: permanent deletion arrives in P4.6 as one audited function.
grant select, insert on public.goals, public.chat_threads, public.goal_events, public.goal_context_shares,
  public.goal_adoptions, public.goal_adoption_items, public.profile_fact_consents, public.daily_loop_focus to authenticated;
grant update (title, description, desired_outcome, status, archived_at) on public.goals to authenticated;
grant update (title, purpose_key, archived_at, goal_id) on public.chat_threads to authenticated;
grant update (revoked_at) on public.goal_context_shares to authenticated;
grant update (undone_at) on public.goal_adoptions to authenticated;
grant update (revoked_at) on public.profile_fact_consents to authenticated;
grant update (goal_id) on public.daily_loop_focus to authenticated;

-- ---------------------------------------------------------------- RPCs (security INVOKER: RLS applies)
create or replace function public.preview_workspace_adoption() returns jsonb
language sql stable security invoker set search_path = 'public', 'pg_catalog' as $$
  select jsonb_build_object(
    'diagnoses', (select count(*) from public.mentor_diagnoses where goal_id is null and user_id = auth.uid()),
    'tasks',     (select count(*) from public.mentor_tasks where goal_id is null and user_id = auth.uid()),
    'attempts',  (select count(*) from public.mentor_task_attempts where goal_id is null and user_id = auth.uid()),
    'evidence',  (select count(*) from public.mentor_diagnosis_evidence where goal_id is null and user_id = auth.uid()),
    'first_activity', (select min(created_at) from public.mentor_tasks where goal_id is null and user_id = auth.uid()),
    'last_activity',  (select max(updated_at) from public.mentor_tasks where goal_id is null and user_id = auth.uid())
  )
$$;

create or replace function public.adopt_workspace(
  p_idempotency_key text, p_kind text, p_title text, p_description text, p_desired_outcome text,
  p_diagnosis_ids uuid[], p_task_ids uuid[], p_attempt_ids uuid[], p_evidence_ids uuid[],
  p_threads jsonb, p_mock_keys text[]
) returns jsonb
language plpgsql security invoker set search_path = 'public', 'pg_catalog' as $$
declare
  v_user uuid := auth.uid();
  v_goal uuid; v_adoption uuid; v_existing record;
  d uuid[]; t uuid[]; a uuid[]; e uuid[];
  before_counts jsonb; after_counts jsonb;
  n_d int := 0; n_t int := 0; n_a int := 0; n_e int := 0; n_th int := 0; n_skipped int := 0; n_mock int := 0;
  th jsonb;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then raise exception 'idempotency key required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('marg.adopt.' || v_user::text, 0));

  select * into v_existing from public.goal_adoptions where user_id = v_user and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('repeat', true, 'goal_id', v_existing.goal_id, 'adoption_id', v_existing.id, 'undone', v_existing.undone_at is not null);
  end if;

  before_counts := jsonb_build_object(
    'diagnoses', (select count(*) from public.mentor_diagnoses where user_id = v_user),
    'tasks', (select count(*) from public.mentor_tasks where user_id = v_user),
    'attempts', (select count(*) from public.mentor_task_attempts where user_id = v_user),
    'evidence', (select count(*) from public.mentor_diagnosis_evidence where user_id = v_user));

  perform set_config('marg.adopting', 'adopt', true);

  insert into public.goals (user_id, kind, title, description, desired_outcome, origin, adopted_at)
  values (v_user, p_kind, p_title, p_description, p_desired_outcome, 'adopted_workspace', now())
  returning id into v_goal;
  insert into public.goal_adoptions (user_id, goal_id, idempotency_key) values (v_user, v_goal, p_idempotency_key) returning id into v_adoption;

  -- A diagnosis, its tasks, their attempts and its evidence are one family and move together, because the
  -- parent/child goal check would otherwise reject later updates. Only unassigned rows of this user move.
  -- The caller's preview must show the whole family; the returned counts show what actually moved.
  d := coalesce((select array_agg(distinct x.id) from public.mentor_diagnoses x where x.user_id = v_user and x.goal_id is null
                  and (x.id = any (coalesce(p_diagnosis_ids, '{}'))
                       or x.id in (select diagnosis_id from public.mentor_tasks where id = any (coalesce(p_task_ids, '{}')))
                       or x.id in (select diagnosis_id from public.mentor_diagnosis_evidence where id = any (coalesce(p_evidence_ids, '{}')))
                       or x.id in (select tk.diagnosis_id from public.mentor_tasks tk join public.mentor_task_attempts at2 on at2.task_id = tk.id and at2.user_id = tk.user_id
                                   where at2.id = any (coalesce(p_attempt_ids, '{}'))))), '{}');
  t := coalesce((select array_agg(distinct x.id) from public.mentor_tasks x where x.user_id = v_user and x.goal_id is null
                  and (x.id = any (coalesce(p_task_ids, '{}'))
                       or x.diagnosis_id = any (d)
                       or x.id in (select task_id from public.mentor_task_attempts where id = any (coalesce(p_attempt_ids, '{}'))))), '{}');
  a := coalesce((select array_agg(distinct x.id) from public.mentor_task_attempts x where x.user_id = v_user and x.goal_id is null
                  and (x.id = any (coalesce(p_attempt_ids, '{}')) or x.task_id = any (t))), '{}');
  e := coalesce((select array_agg(distinct x.id) from public.mentor_diagnosis_evidence x where x.user_id = v_user and x.goal_id is null
                  and (x.id = any (coalesce(p_evidence_ids, '{}')) or x.diagnosis_id = any (d))), '{}');

  update public.mentor_diagnoses set goal_id = v_goal where id = any (d) and user_id = v_user and goal_id is null;           get diagnostics n_d = row_count;
  update public.mentor_tasks set goal_id = v_goal where id = any (t) and user_id = v_user and goal_id is null;               get diagnostics n_t = row_count;
  update public.mentor_task_attempts set goal_id = v_goal where id = any (a) and user_id = v_user and goal_id is null;       get diagnostics n_a = row_count;
  update public.mentor_diagnosis_evidence set goal_id = v_goal where id = any (e) and user_id = v_user and goal_id is null; get diagnostics n_e = row_count;

  insert into public.goal_adoption_items (adoption_id, user_id, table_name, row_key)
    select v_adoption, v_user, 'mentor_diagnoses', x::text from unnest(d) x
    union all select v_adoption, v_user, 'mentor_tasks', x::text from unnest(t) x
    union all select v_adoption, v_user, 'mentor_task_attempts', x::text from unnest(a) x
    union all select v_adoption, v_user, 'mentor_diagnosis_evidence', x::text from unnest(e) x;

  for th in select * from jsonb_array_elements(coalesce(p_threads, '[]'::jsonb)) loop
    insert into public.chat_threads (user_id, goal_id, client_thread_id, title, purpose_key)
    values (v_user, v_goal, th->>'client_thread_id', left(coalesce(th->>'title', ''), 80), coalesce(th->>'purpose_key', ''))
    on conflict (user_id, client_thread_id) do update set goal_id = excluded.goal_id
      where public.chat_threads.goal_id is null;
    if found then
      n_th := n_th + 1;
      insert into public.goal_adoption_items values (v_adoption, v_user, 'chat_threads', th->>'client_thread_id') on conflict do nothing;
    else
      n_skipped := n_skipped + 1; -- already belongs to a goal: never moved
    end if;
  end loop;

  insert into public.goal_adoption_items (adoption_id, user_id, table_name, row_key)
    select v_adoption, v_user, 'mock_history', k from unnest(coalesce(p_mock_keys, '{}')) k on conflict do nothing;
  get diagnostics n_mock = row_count;

  after_counts := jsonb_build_object(
    'diagnoses', (select count(*) from public.mentor_diagnoses where user_id = v_user),
    'tasks', (select count(*) from public.mentor_tasks where user_id = v_user),
    'attempts', (select count(*) from public.mentor_task_attempts where user_id = v_user),
    'evidence', (select count(*) from public.mentor_diagnosis_evidence where user_id = v_user));
  if before_counts <> after_counts then
    raise exception 'row counts changed during adoption; rolled back' using errcode = 'P0001';
  end if;
  if public.goal_family_mismatches(v_user) > 0 then
    raise exception 'adoption would split a diagnosis from its tasks; rolled back' using errcode = 'P0001';
  end if;
  perform set_config('marg.adopting', '', true);

  insert into public.goal_events (user_id, goal_id, event, detail)
  values (v_user, v_goal, 'adopt', jsonb_build_object('diagnoses', n_d, 'tasks', n_t, 'attempts', n_a, 'evidence', n_e, 'threads', n_th, 'threads_skipped', n_skipped, 'mock_entries', n_mock));

  return jsonb_build_object('repeat', false, 'goal_id', v_goal, 'adoption_id', v_adoption,
    'moved', jsonb_build_object('diagnoses', n_d, 'tasks', n_t, 'attempts', n_a, 'evidence', n_e, 'threads', n_th, 'mock_entries', n_mock),
    'threads_skipped', n_skipped, 'row_counts_before', before_counts, 'row_counts_after', after_counts);
end $$;

create or replace function public.undo_adoption(p_adoption_id uuid) returns jsonb
language plpgsql security invoker set search_path = 'public', 'pg_catalog' as $$
declare v_user uuid := auth.uid(); v_ad record; n_d int; n_t int; n_a int; n_e int; n_th int;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('marg.adopt.' || v_user::text, 0));
  select * into v_ad from public.goal_adoptions where id = p_adoption_id and user_id = v_user;
  if not found then raise exception 'adoption not found' using errcode = 'P0002'; end if;
  if v_ad.undone_at is not null then return jsonb_build_object('repeat', true); end if;
  perform set_config('marg.adopting', 'undo', true);
  -- children first, so the parent/child goal check never sees a half-undone state
  update public.mentor_diagnosis_evidence set goal_id = null where user_id = v_user and goal_id = v_ad.goal_id
    and id::text in (select row_key from public.goal_adoption_items where adoption_id = p_adoption_id and table_name = 'mentor_diagnosis_evidence'); get diagnostics n_e = row_count;
  update public.mentor_task_attempts set goal_id = null where user_id = v_user and goal_id = v_ad.goal_id
    and id::text in (select row_key from public.goal_adoption_items where adoption_id = p_adoption_id and table_name = 'mentor_task_attempts'); get diagnostics n_a = row_count;
  update public.mentor_tasks set goal_id = null where user_id = v_user and goal_id = v_ad.goal_id
    and id::text in (select row_key from public.goal_adoption_items where adoption_id = p_adoption_id and table_name = 'mentor_tasks'); get diagnostics n_t = row_count;
  update public.mentor_diagnoses set goal_id = null where user_id = v_user and goal_id = v_ad.goal_id
    and id::text in (select row_key from public.goal_adoption_items where adoption_id = p_adoption_id and table_name = 'mentor_diagnoses'); get diagnostics n_d = row_count;
  update public.chat_threads set goal_id = null where user_id = v_user and goal_id = v_ad.goal_id
    and client_thread_id in (select row_key from public.goal_adoption_items where adoption_id = p_adoption_id and table_name = 'chat_threads'); get diagnostics n_th = row_count;
  if public.goal_family_mismatches(v_user) > 0 then
    raise exception 'newer activity in this goal depends on the adopted items, so the adoption cannot be undone' using errcode = 'P0001';
  end if;
  perform set_config('marg.adopting', '', true);
  update public.goal_adoptions set undone_at = now() where id = p_adoption_id;
  insert into public.goal_events (user_id, goal_id, event, detail)
  values (v_user, v_ad.goal_id, 'undo_adopt', jsonb_build_object('diagnoses', n_d, 'tasks', n_t, 'attempts', n_a, 'evidence', n_e, 'threads', n_th));
  return jsonb_build_object('repeat', false, 'unassigned', jsonb_build_object('diagnoses', n_d, 'tasks', n_t, 'attempts', n_a, 'evidence', n_e, 'threads', n_th));
end $$;

revoke all on function public.goal_family_mismatches(uuid) from public, anon;
grant execute on function public.goal_family_mismatches(uuid) to authenticated;
revoke all on function public.preview_workspace_adoption(), public.undo_adoption(uuid),
  public.adopt_workspace(text, text, text, text, text, uuid[], uuid[], uuid[], uuid[], jsonb, text[]) from public, anon;
grant execute on function public.preview_workspace_adoption(), public.undo_adoption(uuid),
  public.adopt_workspace(text, text, text, text, text, uuid[], uuid[], uuid[], uuid[], jsonb, text[]) to authenticated;
