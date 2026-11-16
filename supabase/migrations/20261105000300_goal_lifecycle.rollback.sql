-- Rollback of 20261105000300_goal_lifecycle.sql (chats.thread_id, archive/restore, bring-in, permanent deletion).
-- Run the hardening rollback first. This removes the lifecycle objects; goals, conversations and messages themselves are untouched,
-- only the thread_id link on messages and the deletion tombstones are lost.
drop trigger if exists chats_fill_thread_id on public.chats;
drop function if exists private.chats_fill_thread_id();
drop function if exists public.delete_goal_permanently(uuid, text);
drop function if exists public.goal_deletion_preview(uuid);
drop function if exists public.bring_in_progress(uuid, uuid, text);
drop function if exists public.unarchive_goal(uuid);
drop function if exists public.archive_goal(uuid);
drop function if exists public.link_thread_messages(text);
drop table if exists public.goal_tombstones;
alter table public.chats drop constraint if exists chats_thread_fk;
drop index if exists public.chats_user_thread_idx;
alter table public.chats drop column if exists thread_id;
alter table public.chat_threads drop constraint if exists chat_threads_id_user_key;
