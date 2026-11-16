-- P4.7 pre-rollout hardening. STAGING ONLY until the founder approves a production migration.
--  1. The 10-live-goal cap also applies when a goal becomes live again (restore, reopen), not only on insert.
--  2. A goal id that was permanently deleted cannot be created again (tombstone is per user and goal).
--  3. Writes into an archived goal are refused by the database (mentor rows, conversations, messages).
--  4. Bring-in can be revoked (record only; see reviews/32 for what revoking does and does not remove).
--  5. Historical messages are linked to their goal conversation in batches; the thread id is matched by equality
--     (it used to be a regular expression built from user text).
--  6. Deletion, after the independent review: row lock on the goal, final delete re-checks archived, typed title compared
--     trimmed on both sides, uploaded question pages and extracted question text covered, messages whose thread link is
--     missing are found by their conversation tag, the preview helper resolves names from pg_catalog first.

-- ---------------------------------------------------------------- 1, 2. goals guard
create or replace function private.goals_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('marg.goals.cap.' || new.user_id::text, 0));
    if exists (select 1 from public.goal_tombstones t where t.user_id = new.user_id and t.goal_id = new.id) then
      raise exception 'this goal id was deleted and cannot be reused' using errcode = '23514';
    end if;
    if new.archived_at is null and new.status <> 'completed'
       and (select count(*) from public.goals g where g.user_id = new.user_id and g.archived_at is null and g.status <> 'completed') >= 10 then
      raise exception 'Goal limit reached (10 live goals)' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then raise exception 'goal owner cannot change' using errcode = '23514'; end if;
    if new.kind <> old.kind then raise exception 'goal kind cannot change' using errcode = '23514'; end if;
    if new.origin <> old.origin then raise exception 'goal origin cannot change' using errcode = '23514'; end if;
    -- becoming live again (restore from archive, reopen after completion) counts against the same cap, under the same lock
    if (old.archived_at is not null or old.status = 'completed') and new.archived_at is null and new.status <> 'completed' then
      perform pg_advisory_xact_lock(hashtextextended('marg.goals.cap.' || new.user_id::text, 0));
      if (select count(*) from public.goals g where g.user_id = new.user_id and g.id <> new.id and g.archived_at is null and g.status <> 'completed') >= 10 then
        raise exception 'Goal limit reached (10 live goals)' using errcode = '23514';
      end if;
    end if;
  end if;
  if new.adopted_at is distinct from (case when tg_op = 'UPDATE' then old.adopted_at else null end)
     and coalesce(current_setting('marg.adopting', true), '') <> 'adopt' then
    raise exception 'adopted_at can only be set by adoption' using errcode = '23514';
  end if;
  return new;
end $$;

alter table public.goal_tombstones drop constraint goal_tombstones_pkey;
alter table public.goal_tombstones add constraint goal_tombstones_pkey primary key (user_id, goal_id);

-- ---------------------------------------------------------------- 3. no writes into an archived goal
create or replace function private.reject_archived_goal_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.goal_id is not null and exists (select 1 from public.goals g where g.id = new.goal_id and g.user_id = new.user_id and g.archived_at is not null) then
    raise exception 'this goal is archived; restore it first' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger mentor_diagnoses_archived_guard          before insert or update on public.mentor_diagnoses          for each row execute function private.reject_archived_goal_write();
create trigger mentor_tasks_archived_guard              before insert or update on public.mentor_tasks              for each row execute function private.reject_archived_goal_write();
create trigger mentor_task_attempts_archived_guard      before insert or update on public.mentor_task_attempts      for each row execute function private.reject_archived_goal_write();
create trigger mentor_diagnosis_evidence_archived_guard before insert or update on public.mentor_diagnosis_evidence for each row execute function private.reject_archived_goal_write();
create trigger chat_threads_archived_guard              before insert on public.chat_threads                        for each row execute function private.reject_archived_goal_write();

-- messages: the goal is found through chats.thread_id, which chats_fill_thread_id sets first (trigger names fire in alphabetical order)
create or replace function private.chats_reject_archived() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.thread_id is not null and exists (
       select 1 from public.chat_threads t join public.goals g on g.id = t.goal_id and g.user_id = t.user_id
        where t.id = new.thread_id and t.user_id = new.user_id and g.archived_at is not null) then
    raise exception 'this goal is archived; restore it first' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger chats_guard_archived before insert on public.chats for each row execute function private.chats_reject_archived();

-- ---------------------------------------------------------------- 4. revoke a bring-in (record only)
create or replace function public.revoke_bring_in(p_share uuid) returns void
language plpgsql security invoker set search_path = 'public', 'pg_catalog' as $$
declare v_user uuid := auth.uid(); v_to uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  update public.goal_context_shares set revoked_at = now() where id = p_share and user_id = v_user and revoked_at is null returning to_goal_id into v_to;
  if not found then raise exception 'bring-in not found or already revoked' using errcode = 'P0002'; end if;
  insert into public.goal_events (user_id, goal_id, event, detail) values (v_user, v_to, 'revoke_share', jsonb_build_object('items', 1));
end $$;
revoke all on function public.revoke_bring_in(uuid) from public, anon;
grant execute on function public.revoke_bring_in(uuid) to authenticated;

-- ---------------------------------------------------------------- 5. linking messages to conversations
-- The thread token in a message's tag is extracted inline everywhere (users cannot reach the private schema from invoker functions).
create or replace function private.chats_fill_thread_id() returns trigger language plpgsql security invoker set search_path = 'public', 'pg_catalog' as $$
declare tag text; tid uuid;
begin
  if new.thread_id is null and new.content like '%[MARG_THREAD:%' then
    tag := substring(new.content from '\[MARG_THREAD:%7B%22id%22%3A%22([^%\]]+)%22[^\]]*\]$');
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
     and ( substring(c.content from '\[MARG_THREAD:%7B%22id%22%3A%22([^%\]]+)%22[^\]]*\]$') = p_client_thread_id
           or (p_client_thread_id = 'legacy' and c.content not like '%[MARG_THREAD:%') );
  get diagnostics n = row_count;
  return n;
end $$;

-- One-time backfill for every registered goal conversation, one conversation per statement. Safe to run again.
-- Run it (as the database owner, in pieces if large), then validate the foreign key:
--   select private.backfill_chat_thread_ids();                              -- first 100 users; answer: linked, last_user, done
--   select private.backfill_chat_thread_ids('<last_user>');                 -- next 100, until done is true
--   alter table public.chats validate constraint chats_thread_fk;
create or replace function private.backfill_chat_thread_ids(p_after uuid default null, p_max_users integer default 100) returns jsonb
language plpgsql security invoker set search_path = 'public', 'pg_catalog' as $$
declare u record; n integer; total bigint := 0; last_user uuid := p_after; seen integer := 0;
begin
  for u in select distinct user_id from public.chat_threads where goal_id is not null and (p_after is null or user_id > p_after) order by user_id limit p_max_users loop
    -- the tag is read once per message, then matched to this user's conversations by equality
    with tok as materialized (
      select c.id, substring(c.content from '\[MARG_THREAD:%7B%22id%22%3A%22([^%\]]+)%22[^\]]*\]$') as token
        from public.chats c where c.user_id = u.user_id and c.thread_id is null and c.content like '%[MARG_THREAD:%')
    update public.chats c set thread_id = t.id
      from tok join public.chat_threads t on t.user_id = u.user_id and t.goal_id is not null and t.client_thread_id = tok.token
     where c.id = tok.id and c.user_id = u.user_id;
    get diagnostics n = row_count;
    total := total + n;
    update public.chats c set thread_id = t.id
      from public.chat_threads t
     where c.user_id = u.user_id and t.user_id = u.user_id and t.goal_id is not null and t.client_thread_id = 'legacy'
       and c.thread_id is null and c.content not like '%[MARG_THREAD:%';
    get diagnostics n = row_count;
    total := total + n;
    last_user := u.user_id; seen := seen + 1;
  end loop;
  return jsonb_build_object('linked', total, 'last_user', last_user, 'done', seen < p_max_users);
end $$;
revoke all on function private.backfill_chat_thread_ids(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------- 6. deletion after the independent review
create or replace function public.goal_deletion_preview(p_goal uuid) returns jsonb
language sql stable security invoker set search_path = 'pg_catalog', 'public' as $$
  with th as (select id, client_thread_id from public.chat_threads where goal_id = p_goal and user_id = auth.uid())
  select jsonb_build_object(
    'archived', (select (archived_at is not null)::int from public.goals where id = p_goal and user_id = auth.uid()),
    'diagnoses', (select count(*) from public.mentor_diagnoses where goal_id = p_goal and user_id = auth.uid()),
    'tasks', (select count(*) from public.mentor_tasks where goal_id = p_goal and user_id = auth.uid()),
    'attempts', (select count(*) from public.mentor_task_attempts where goal_id = p_goal and user_id = auth.uid()),
    'evidence', (select count(*) from public.mentor_diagnosis_evidence where goal_id = p_goal and user_id = auth.uid()),
    'threads', (select count(*) from th),
    'messages', (select count(*) from public.chats c where c.user_id = auth.uid()
                   and (c.thread_id in (select id from th)
                        or substring(c.content from '\[MARG_THREAD:%7B%22id%22%3A%22([^%\]]+)%22[^\]]*\]$') in (select client_thread_id from th))),
    'shares', (select count(*) from public.goal_context_shares where user_id = auth.uid() and (from_goal_id = p_goal or to_goal_id = p_goal)),
    'consents', (select count(*) from public.profile_fact_consents where to_goal_id = p_goal and user_id = auth.uid()),
    'images', (select count(*) from public.question_images q where q.user_id = auth.uid() and q.conversation_id in (select client_thread_id from th))
  )
$$;

create or replace function public.delete_goal_permanently(p_goal uuid, p_typed_title text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); g record; counts jsonb; n_msg integer; n_cqs integer; n_rev integer; n_del integer;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('marg.goal.delete.' || v_user::text, 0));
  -- the row lock stops a concurrent restore, archive or child insert from changing the goal between the check and the delete
  select * into g from public.goals where id = p_goal and user_id = v_user for update;
  if not found then raise exception 'goal not found' using errcode = 'P0002'; end if;
  if g.archived_at is null then raise exception 'archive the goal before deleting it permanently' using errcode = 'P0001'; end if;
  if p_typed_title is null or btrim(p_typed_title) is distinct from btrim(g.title) then raise exception 'the typed title does not match' using errcode = 'P0001'; end if;
  -- uploaded pages live in file storage, which this function cannot clear: the app removes them first, and the database refuses to go on if any are left
  -- (the app removes the files and then every row first, soft-deleted rows included, so this function can never orphan a file)
  if exists (select 1 from public.question_images q where q.user_id = v_user
              and q.conversation_id in (select client_thread_id from public.chat_threads where user_id = v_user and goal_id = p_goal)) then
    raise exception 'remove the uploaded pages of this goal first' using errcode = 'P0001';
  end if;
  counts := public.goal_deletion_preview(p_goal);
  -- children first; every statement is limited to this user and this goal
  delete from public.mentor_task_attempts where user_id = v_user and goal_id = p_goal;
  delete from public.mentor_diagnosis_evidence where user_id = v_user and goal_id = p_goal;
  delete from public.mentor_tasks where user_id = v_user and goal_id = p_goal;
  delete from public.mentor_diagnoses where user_id = v_user and goal_id = p_goal;
  delete from public.chats where user_id = v_user
     and ( thread_id in (select id from public.chat_threads where user_id = v_user and goal_id = p_goal)
           or substring(content from '\[MARG_THREAD:%7B%22id%22%3A%22([^%\]]+)%22[^\]]*\]$')
              in (select client_thread_id from public.chat_threads where user_id = v_user and goal_id = p_goal) );
  get diagnostics n_msg = row_count;
  delete from public.conversation_question_state where user_id = v_user and conversation_id in (select client_thread_id from public.chat_threads where user_id = v_user and goal_id = p_goal);
  get diagnostics n_cqs = row_count;
  delete from public.image_questions where user_id = v_user and conversation_id in (select client_thread_id from public.chat_threads where user_id = v_user and goal_id = p_goal);
  delete from public.question_images where user_id = v_user and conversation_id in (select client_thread_id from public.chat_threads where user_id = v_user and goal_id = p_goal);
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
  delete from public.goals where id = p_goal and user_id = v_user and archived_at is not null;
  get diagnostics n_del = row_count;
  if n_del <> 1 then raise exception 'the goal changed while it was being deleted; nothing was deleted' using errcode = '40001'; end if;
  return counts;
end $$;
revoke all on function public.delete_goal_permanently(uuid, text), public.goal_deletion_preview(uuid) from public, anon;
grant execute on function public.delete_goal_permanently(uuid, text), public.goal_deletion_preview(uuid) to authenticated;

-- The foreign key is validated by a separate step after the backfill (reviews/32):
--   alter table public.chats validate constraint chats_thread_fk;
