-- P4.6: goal lifecycle. STAGING ONLY until the founder approves a production migration.
--  A. chats.thread_id (additive, nullable for good) + a trigger that fills it for goal conversations
--  B. archive and restore
--  C. "bring in" (one explicit, recorded copy of progress from one goal into another goal's conversation)
--  D. permanent deletion: a dry-run preview and one definer function, with a content-free tombstone
-- Deletion is deliberately the only place a SECURITY DEFINER function is used: ordinary users have no DELETE grant on goals,
-- chat_threads or tombstones, so a goal can only be deleted by this function, which checks ownership, archived state and the typed title.
-- (Users can still delete their own individual mentor rows and messages, as before; that is existing behaviour.)

-- ---------------------------------------------------------------- A. chats.thread_id
alter table public.chat_threads add constraint chat_threads_id_user_key unique (id, user_id);
alter table public.chats add column thread_id uuid;
create index chats_user_thread_idx on public.chats (user_id, thread_id) where thread_id is not null;
alter table public.chats add constraint chats_thread_fk foreign key (thread_id, user_id) references public.chat_threads (id, user_id) not valid;

-- A message's thread is a tag at the end of its content: "\n[MARG_THREAD:" + urlencoded JSON starting {"id":"<36 chars>" ... + "]".
-- Only conversations registered in chat_threads (goal conversations) get a thread_id; General conversations stay null.
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
create trigger chats_fill_thread_id before insert on public.chats for each row execute function private.chats_fill_thread_id();

-- Links the caller's existing messages of one conversation (for example after a conversation is adopted into a goal).
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

-- ---------------------------------------------------------------- B. archive and restore
create or replace function public.archive_goal(p_goal uuid) returns void
language plpgsql security invoker set search_path = 'public', 'pg_catalog' as $$
declare v_user uuid := auth.uid(); n integer;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  update public.goals set archived_at = now() where id = p_goal and user_id = v_user and archived_at is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'goal not found or already archived' using errcode = 'P0002'; end if;
  insert into public.goal_events (user_id, goal_id, event, detail) values (v_user, p_goal, 'archive', '{}'::jsonb);
end $$;

create or replace function public.unarchive_goal(p_goal uuid) returns void
language plpgsql security invoker set search_path = 'public', 'pg_catalog' as $$
declare v_user uuid := auth.uid(); n integer;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  update public.goals set archived_at = null where id = p_goal and user_id = v_user and archived_at is not null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'goal not found or not archived' using errcode = 'P0002'; end if;
  insert into public.goal_events (user_id, goal_id, event, detail) values (v_user, p_goal, 'unarchive', '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------- C. bring in
-- One explicit copy of a summary the student saw and approved, from one live goal into another live goal's conversation.
create or replace function public.bring_in_progress(p_from uuid, p_to uuid, p_summary text) returns uuid
language plpgsql security invoker set search_path = 'public', 'pg_catalog' as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_from = p_to then raise exception 'choose a different goal' using errcode = 'P0001'; end if;
  if (select count(*) from public.goals where user_id = v_user and id in (p_from, p_to) and archived_at is null) <> 2 then
    raise exception 'both goals must exist and not be archived' using errcode = 'P0002';
  end if;
  insert into public.goal_context_shares (user_id, from_goal_id, to_goal_id, kind, content) values (v_user, p_from, p_to, 'summary', p_summary) returning id into v_id;
  insert into public.goal_events (user_id, goal_id, event, detail) values (v_user, p_to, 'share', jsonb_build_object('items', 1));
  return v_id;
end $$;

-- ---------------------------------------------------------------- D. permanent deletion
create table public.goal_tombstones (
  goal_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  counts jsonb not null check (private.detail_is_counts_only(counts))
);
alter table public.goal_tombstones enable row level security;
create policy goal_tombstones_select_own on public.goal_tombstones for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.goal_tombstones from anon, authenticated; -- new tables get default grants in this project; users may only read their own tombstones
grant select on public.goal_tombstones to authenticated;

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

revoke all on function public.link_thread_messages(text), public.archive_goal(uuid), public.unarchive_goal(uuid), public.bring_in_progress(uuid, uuid, text),
  public.goal_deletion_preview(uuid), public.delete_goal_permanently(uuid, text) from public, anon;
grant execute on function public.link_thread_messages(text), public.archive_goal(uuid), public.unarchive_goal(uuid), public.bring_in_progress(uuid, uuid, text),
  public.goal_deletion_preview(uuid), public.delete_goal_permanently(uuid, text) to authenticated;
