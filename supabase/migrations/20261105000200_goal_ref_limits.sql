-- P4.3 follow-up: goal-specific references must be collision-free and reversible, so nothing is ever truncated.
-- A goal reference is the original reference plus a 10 character prefix ("g" + 8 hex + "~"). The length limits grow by exactly
-- 10 so the longest valid original still fits with its prefix. The app and the adoption function no longer shorten references.
alter table public.mentor_diagnoses drop constraint mentor_diagnoses_client_ref_check,
  add constraint mentor_diagnoses_client_ref_check check (char_length(client_ref) >= 3 and char_length(client_ref) <= 170);
alter table public.mentor_tasks drop constraint mentor_tasks_client_ref_check,
  add constraint mentor_tasks_client_ref_check check (char_length(client_ref) >= 3 and char_length(client_ref) <= 190);
alter table public.mentor_task_attempts drop constraint mentor_task_attempts_client_ref_check,
  add constraint mentor_task_attempts_client_ref_check check (char_length(client_ref) >= 3 and char_length(client_ref) <= 210);
alter table public.mentor_diagnosis_evidence drop constraint mentor_diagnosis_evidence_client_ref_check,
  add constraint mentor_diagnosis_evidence_client_ref_check check (char_length(client_ref) >= 3 and char_length(client_ref) <= 210);

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
  th jsonb; v_pfx text;
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

  -- Rows that move into a goal also get a goal-specific reference, so a later save from General (or another goal)
  -- of the same pattern creates its own row instead of overwriting this one. The old reference is kept for undo.
  v_pfx := 'g' || substr(replace(v_goal::text, '-', ''), 1, 8) || '~';
  insert into public.goal_adoption_items (adoption_id, user_id, table_name, row_key, previous_ref)
    select v_adoption, v_user, 'mentor_diagnoses', x.id::text, x.client_ref from public.mentor_diagnoses x where x.id = any (d) and x.user_id = v_user
    union all select v_adoption, v_user, 'mentor_tasks', x.id::text, x.client_ref from public.mentor_tasks x where x.id = any (t) and x.user_id = v_user
    union all select v_adoption, v_user, 'mentor_task_attempts', x.id::text, x.client_ref from public.mentor_task_attempts x where x.id = any (a) and x.user_id = v_user
    union all select v_adoption, v_user, 'mentor_diagnosis_evidence', x.id::text, x.client_ref from public.mentor_diagnosis_evidence x where x.id = any (e) and x.user_id = v_user;

  update public.mentor_diagnoses set goal_id = v_goal, client_ref = v_pfx || client_ref where id = any (d) and user_id = v_user and goal_id is null;           get diagnostics n_d = row_count;
  update public.mentor_tasks set goal_id = v_goal, client_ref = v_pfx || client_ref where id = any (t) and user_id = v_user and goal_id is null;               get diagnostics n_t = row_count;
  update public.mentor_task_attempts set goal_id = v_goal, client_ref = v_pfx || client_ref where id = any (a) and user_id = v_user and goal_id is null;       get diagnostics n_a = row_count;
  update public.mentor_diagnosis_evidence set goal_id = v_goal, client_ref = v_pfx || client_ref where id = any (e) and user_id = v_user and goal_id is null; get diagnostics n_e = row_count;

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

revoke all on function public.adopt_workspace(text, text, text, text, text, uuid[], uuid[], uuid[], uuid[], jsonb, text[]) from public, anon;
grant execute on function public.adopt_workspace(text, text, text, text, text, uuid[], uuid[], uuid[], uuid[], jsonb, text[]) to authenticated;
