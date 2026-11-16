-- Rollback of 20261106000100_prerollout_hardening.sql. Restores the earlier definitions exactly (generated from the earlier migrations).
-- Data is not touched except: chats.thread_id values already filled stay; tombstones keep their rows.
drop trigger if exists mentor_diagnoses_archived_guard on public.mentor_diagnoses;
drop trigger if exists mentor_tasks_archived_guard on public.mentor_tasks;
drop trigger if exists mentor_task_attempts_archived_guard on public.mentor_task_attempts;
drop trigger if exists mentor_diagnosis_evidence_archived_guard on public.mentor_diagnosis_evidence;
drop trigger if exists chat_threads_archived_guard on public.chat_threads;
drop trigger if exists chats_guard_archived on public.chats;
drop function if exists private.reject_archived_goal_write();
drop function if exists private.chats_reject_archived();
drop function if exists public.revoke_bring_in(uuid);
drop function if exists private.backfill_chat_thread_ids(uuid, integer);
alter table public.goal_tombstones drop constraint goal_tombstones_pkey;
alter table public.goal_tombstones add constraint goal_tombstones_pkey primary key (goal_id);
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
create or replace function private.chats_fill_thread_id() returns trigger language plpgsql security invoker set search_path = 'public', 'pg_catalog' as $$
declare tag text; tid uuid;
begin
  if new.thread_id is null and new.content like '%[MARG_THREAD:%' then
    tag := substring(new.content from '\[MARG_THREAD:%7B%22id%22%3A%22([a-f0-9-]{36})%22[^\]]*\]$');
    if tag is not null then
      select t.id into tid from public.chat_threads t where t.user_id = new.user_id and t.client_thread_id = tag;
      new.thread_id := tid; -- stays null when the conversation is not a goal conversation
    end if;
  end if;
  return new;
end $$;
create or replace function public.link_thread_messages(p_client_thread_id text) returns integer
language plpgsql security invoker set search_path = 'public', 'pg_catalog' as $$
declare v_user uuid := auth.uid(); v_thread uuid; n integer;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select id into v_thread from public.chat_threads where user_id = v_user and client_thread_id = p_client_thread_id;
  if v_thread is null then raise exception 'conversation is not registered' using errcode = 'P0002'; end if;
  update public.chats c set thread_id = v_thread
   where c.user_id = v_user and c.thread_id is null
     and ( c.content ~ ('\[MARG_THREAD:%7B%22id%22%3A%22' || p_client_thread_id || '%22[^\]]*\]$')
           or (p_client_thread_id = 'legacy' and c.content !~ '\[MARG_THREAD:') );
  get diagnostics n = row_count;
  return n;
end $$;
create or replace function public.goal_deletion_preview(p_goal uuid) returns jsonb
language sql stable security invoker set search_path = 'public', 'pg_catalog' as $$
  select jsonb_build_object(
    'archived', (select (archived_at is not null)::int from public.goals where id = p_goal and user_id = auth.uid()),
    'diagnoses', (select count(*) from public.mentor_diagnoses where goal_id = p_goal and user_id = auth.uid()),
    'tasks', (select count(*) from public.mentor_tasks where goal_id = p_goal and user_id = auth.uid()),
    'attempts', (select count(*) from public.mentor_task_attempts where goal_id = p_goal and user_id = auth.uid()),
    'evidence', (select count(*) from public.mentor_diagnosis_evidence where goal_id = p_goal and user_id = auth.uid()),
    'threads', (select count(*) from public.chat_threads where goal_id = p_goal and user_id = auth.uid()),
    'messages', (select count(*) from public.chats c where c.user_id = auth.uid() and c.thread_id in (select id from public.chat_threads where goal_id = p_goal and user_id = auth.uid())),
    'shares', (select count(*) from public.goal_context_shares where user_id = auth.uid() and (from_goal_id = p_goal or to_goal_id = p_goal)),
    'consents', (select count(*) from public.profile_fact_consents where to_goal_id = p_goal and user_id = auth.uid())
  )
$$;

create or replace function public.delete_goal_permanently(p_goal uuid, p_typed_title text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); g record; counts jsonb; n_msg integer; n_cqs integer; n_rev integer;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('marg.goal.delete.' || v_user::text, 0));
  select * into g from public.goals where id = p_goal and user_id = v_user;
  if not found then raise exception 'goal not found' using errcode = 'P0002'; end if;
  if g.archived_at is null then raise exception 'archive the goal before deleting it permanently' using errcode = 'P0001'; end if;
  if p_typed_title is null or btrim(p_typed_title) is distinct from g.title then raise exception 'the typed title does not match' using errcode = 'P0001'; end if;
  counts := public.goal_deletion_preview(p_goal);
  -- children first; every statement is limited to this user and this goal
  delete from public.mentor_task_attempts where user_id = v_user and goal_id = p_goal;
  delete from public.mentor_diagnosis_evidence where user_id = v_user and goal_id = p_goal;
  delete from public.mentor_tasks where user_id = v_user and goal_id = p_goal;
  delete from public.mentor_diagnoses where user_id = v_user and goal_id = p_goal;
  delete from public.chats where user_id = v_user and thread_id in (select id from public.chat_threads where user_id = v_user and goal_id = p_goal);
  get diagnostics n_msg = row_count;
  delete from public.conversation_question_state where user_id = v_user and conversation_id in (select client_thread_id from public.chat_threads where user_id = v_user and goal_id = p_goal);
  get diagnostics n_cqs = row_count;
  delete from public.marg_response_reviews where user_id = v_user and conversation_id in (select client_thread_id from public.chat_threads where user_id = v_user and goal_id = p_goal);
  get diagnostics n_rev = row_count;
  delete from public.goal_context_shares where user_id = v_user and (from_goal_id = p_goal or to_goal_id = p_goal);
  delete from public.goal_adoption_items where user_id = v_user and adoption_id in (select id from public.goal_adoptions where user_id = v_user and goal_id = p_goal);
  delete from public.goal_adoptions where user_id = v_user and goal_id = p_goal;
  delete from public.profile_fact_consents where user_id = v_user and to_goal_id = p_goal;
  delete from public.daily_loop_focus where user_id = v_user and goal_id = p_goal; -- Home asks again; nothing is chosen for the student
  delete from public.chat_threads where user_id = v_user and goal_id = p_goal;
  counts := counts - 'archived' || jsonb_build_object('question_states', n_cqs, 'reviews', n_rev);
  insert into public.goal_tombstones (goal_id, user_id, counts) values (p_goal, v_user, counts);
  insert into public.goal_events (user_id, goal_id, event, detail) values (v_user, p_goal, 'delete', counts);
  delete from public.goals where id = p_goal and user_id = v_user;
  return counts;
end $$;
