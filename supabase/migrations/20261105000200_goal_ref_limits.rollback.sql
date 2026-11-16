-- Rollback for 20261105000200_goal_ref_limits.sql. Refused if any reference is longer than the old limits.
do $$
begin
  if exists (select 1 from public.mentor_diagnoses where char_length(client_ref) > 160)
     or exists (select 1 from public.mentor_tasks where char_length(client_ref) > 180)
     or exists (select 1 from public.mentor_task_attempts where char_length(client_ref) > 200)
     or exists (select 1 from public.mentor_diagnosis_evidence where char_length(client_ref) > 200) then
    raise exception 'refusing: some references are longer than the old limits (goal rows exist)';
  end if;
end $$;
alter table public.mentor_diagnoses drop constraint mentor_diagnoses_client_ref_check,
  add constraint mentor_diagnoses_client_ref_check check (char_length(client_ref) >= 3 and char_length(client_ref) <= 160);
alter table public.mentor_tasks drop constraint mentor_tasks_client_ref_check,
  add constraint mentor_tasks_client_ref_check check (char_length(client_ref) >= 3 and char_length(client_ref) <= 180);
alter table public.mentor_task_attempts drop constraint mentor_task_attempts_client_ref_check,
  add constraint mentor_task_attempts_client_ref_check check (char_length(client_ref) >= 3 and char_length(client_ref) <= 200);
alter table public.mentor_diagnosis_evidence drop constraint mentor_diagnosis_evidence_client_ref_check,
  add constraint mentor_diagnosis_evidence_client_ref_check check (char_length(client_ref) >= 3 and char_length(client_ref) <= 200);
-- then re-run the adopt_workspace definition from 20261105000100_goals_adoption_refs.sql (it truncates references again).
