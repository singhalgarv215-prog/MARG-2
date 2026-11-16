-- Rollback for 20261104000100_goals_foundation.sql.
-- Refuses to run while any goal exists, because dropping the goals table would lose them.
-- To proceed after exporting goals: select set_config('marg.rollback_confirmed', 'yes', false);
-- Existing rows in chats, profiles and the mentor tables are never touched: only the added
-- goal_id columns (with their foreign keys and indexes) and the new tables and functions are dropped.
do $rb$
begin
  if exists (select 1 from public.goals)
     and coalesce(current_setting('marg.rollback_confirmed', true), '') <> 'yes' then
    raise exception 'Rollback refused: goals exist. Export them, then set marg.rollback_confirmed = yes.';
  end if;

  drop function if exists public.adopt_workspace(text, text, text, text, text, uuid[], uuid[], uuid[], uuid[], jsonb, text[]);
  drop function if exists public.undo_adoption(uuid);
  drop function if exists public.preview_workspace_adoption();
  drop function if exists public.goal_family_mismatches(uuid);

  drop trigger if exists mentor_diagnoses_goal_fixed on public.mentor_diagnoses;
  drop trigger if exists mentor_tasks_goal_fixed on public.mentor_tasks;
  drop trigger if exists mentor_task_attempts_goal_fixed on public.mentor_task_attempts;
  drop trigger if exists mentor_diagnosis_evidence_goal_fixed on public.mentor_diagnosis_evidence;
  drop trigger if exists mentor_tasks_parent_goal on public.mentor_tasks;
  drop trigger if exists mentor_task_attempts_parent_goal on public.mentor_task_attempts;
  drop trigger if exists mentor_diagnosis_evidence_parent_goal on public.mentor_diagnosis_evidence;

  drop table if exists public.goal_adoption_items, public.goal_adoptions, public.goal_context_shares,
    public.goal_events, public.profile_fact_consents, public.daily_loop_focus, public.chat_threads;

  alter table public.mentor_diagnoses          drop column if exists goal_id;
  alter table public.mentor_tasks              drop column if exists goal_id;
  alter table public.mentor_task_attempts      drop column if exists goal_id;
  alter table public.mentor_diagnosis_evidence drop column if exists goal_id;

  drop table if exists public.goals;

  drop function if exists private.guard_goal_id_change();
  drop function if exists private.mentor_parent_goal_match();
  drop function if exists private.goals_guard();
  drop function if exists private.detail_is_counts_only(jsonb);
  drop function if exists private.touch_updated_at();
end $rb$;
