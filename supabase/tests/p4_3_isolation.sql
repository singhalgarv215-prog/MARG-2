-- P4.1 + P4.3 isolation, ownership, adoption (with goal-specific references) and rollback tests. RUN ON STAGING ONLY.
-- Everything happens in one transaction and ends with an exception that carries the results,
-- so nothing is left behind. Test accounts use @marg-test.invalid emails.
do $outer$
declare
  ua uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
  ub uuid := 'bbbbbbbb-0000-0000-0000-00000000000b';
  g1 uuid; g2 uuid; g3 uuid; d1 uuid; t1 uuid; t2 uuid; dx uuid; tx uuid; ty uuid; ax uuid; ex uuid; th uuid;
  r jsonb; r2 jsonb; ad uuid; n int; n2 int; i int;
begin
  -- the production-marker guard: refuse to run anywhere that is not the staging project
  if exists (select 1 from information_schema.tables where table_schema='private' and table_name='cat_push_content')
     and (select count(*) from auth.users) > 50 then
    raise exception 'refusing to run: auth.users looks like production (% users)', (select count(*) from auth.users);
  end if;

  create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  end $f$;
  create or replace function pg_temp.as_admin() returns void language plpgsql as $f$
  begin
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
  end $f$;
  create or replace function pg_temp.t(label text, q text, expect_ok boolean) returns void language plpgsql as $f$
  declare ok boolean; msg text;
  begin
    begin execute q; ok := true; msg := '';
    exception when others then ok := false; msg := sqlerrm; end;
    perform set_config('marg.res', coalesce(current_setting('marg.res', true), '') ||
      (case when ok = expect_ok then 'PASS ' else 'FAIL ' end) || label || ' [' || (case when ok then 'ran' else left(msg, 60) end) || E']\n', true);
  end $f$;
  create or replace function pg_temp.c(label text, q text, expected int) returns void language plpgsql as $f$
  declare n int;
  begin
    execute q into n;
    perform set_config('marg.res', coalesce(current_setting('marg.res', true), '') ||
      (case when n = expected then 'PASS ' else 'FAIL ' end) || label || ' [got ' || n || ', want ' || expected || E']\n', true);
  end $f$;

  perform pg_temp.as_admin();
  insert into auth.users (id, email) values (ua, 'a@marg-test.invalid'), (ub, 'b@marg-test.invalid');

  -- ===== T1-T4 ownership across two ACCOUNTS
  perform pg_temp.as_user(ua);
  insert into public.goals (user_id, kind, title) values (ua, 'cat', 'A goal one') returning id into g1;
  insert into public.goals (user_id, kind, title) values (ua, 'custom', 'A goal two') returning id into g2;
  perform pg_temp.as_user(ub);
  insert into public.goals (user_id, kind, title) values (ub, 'custom', 'B goal') returning id into g3;
  perform pg_temp.c('T1 account B sees none of A''s goals', 'select count(*) from public.goals where id in (''' || g1 || ''',''' || g2 || ''')', 0);
  perform pg_temp.t('T2 B cannot create a goal owned by A', format('insert into public.goals (user_id, kind, title) values (%L, ''x'', ''forged'')', ua), false);
  perform pg_temp.t('T3 B cannot read A goal by id', format('select 1/ (select count(*) from public.goals where id=%L)', g1), false);
  perform pg_temp.t('T4 B cannot set owner on update (column not grantable)', format('update public.goals set user_id=%L where id=%L', ua, g3), false);

  -- ===== T5-T9 ownership by composite FK
  perform pg_temp.as_user(ua);
  perform pg_temp.t('T5 A cannot attach a task to B''s goal (composite FK)',
    format('insert into public.mentor_tasks (user_id, goal_id, client_ref, section, task_type, title, objective, success_metric, destination) values (%L,%L,''t-forge-1'',''varc'',''practice'',''forged'',''objective xx'',''metric xxxx'',''chat'')', ua, g3), false);
  insert into public.mentor_diagnoses (user_id, goal_id, client_ref, section, mechanism) values (ua, g1, 'd-g1-1', 'varc', 'mechanism text') returning id into d1;
  insert into public.mentor_tasks (user_id, goal_id, diagnosis_id, client_ref, section, task_type, title, objective, success_metric, destination)
    values (ua, g1, d1, 't-g1-1', 'varc', 'practice', 'g1 task', 'objective xx', 'metric xxxx', 'chat') returning id into t1;
  perform pg_temp.t('T6 task in goal 2 cannot hang off a goal-1 diagnosis',
    format('insert into public.mentor_tasks (user_id, goal_id, diagnosis_id, client_ref, section, task_type, title, objective, success_metric, destination) values (%L,%L,%L,''t-g2-bad'',''varc'',''practice'',''bad'',''objective xx'',''metric xxxx'',''chat'')', ua, g2, d1), false);
  perform pg_temp.t('T7 a task cannot be moved from goal 1 to goal 2', format('update public.mentor_tasks set goal_id=%L where id=%L', g2, t1), false);
  insert into public.mentor_tasks (user_id, client_ref, section, task_type, title, objective, success_metric, destination)
    values (ua, 't-old-client', 'qa', 'practice', 'old client task', 'objective xx', 'metric xxxx', 'chat') returning id into t2;
  perform pg_temp.c('T8 old client can still insert without goal_id (stays unassigned)', format('select count(*) from public.mentor_tasks where id=%L and goal_id is null', t2), 1);
  perform pg_temp.t('T9 an unassigned task cannot be assigned by a plain update (adoption only)', format('update public.mentor_tasks set goal_id=%L where id=%L', g1, t2), false);

  -- ===== T10-T12 two goals of the SAME user stay separate
  insert into public.mentor_diagnoses (user_id, goal_id, client_ref, section, mechanism) values (ua, g2, 'd-g2-1', 'general', 'mechanism two');
  perform pg_temp.c('T10 goal-1 query returns only goal-1 diagnoses', format('select count(*) from public.mentor_diagnoses where user_id=%L and goal_id=%L', ua, g1), 1);
  perform pg_temp.c('T11 goal-2 query never returns goal-1 rows', format('select count(*) from public.mentor_diagnoses where user_id=%L and goal_id=%L and client_ref=''d-g1-1''', ua, g2), 0);
  perform pg_temp.c('T12 unassigned query returns neither goal''s diagnoses', format('select count(*) from public.mentor_diagnoses where user_id=%L and goal_id is null', ua), 0);

  -- ===== T13-T15 threads: fixed at creation
  insert into public.chat_threads (user_id, goal_id, client_thread_id, title) values (ua, g1, 'th-1', 'Goal 1 chat') returning id into th;
  perform pg_temp.t('T13 a conversation cannot move to another goal', format('update public.chat_threads set goal_id=%L where id=%L', g2, th), false);
  perform pg_temp.as_user(ub);
  perform pg_temp.c('T14 B cannot update A''s thread (0 rows)', format('with u as (update public.chat_threads set title=''x'' where id=%L returning 1) select count(*) from u', th), 0);
  perform pg_temp.as_user(ua);
  insert into public.chat_threads (user_id, goal_id, client_thread_id, title) values (ua, null, 'th-general', 'General') returning id into th;
  perform pg_temp.t('T15 a General Chat thread cannot be pushed into a goal by a plain update', format('update public.chat_threads set goal_id=%L where id=%L', g1, th), false);

  -- ===== T16-T19 audit, consent, focus, anon, delete
  perform pg_temp.t('T16 goal_events rejects long free text (counts only)', format('insert into public.goal_events (user_id, goal_id, event, detail) values (%L,%L,''adopt'',%L::jsonb)', ua, g1, '{"note":"this is a long sentence that is clearly message content and not a count"}'), false);
  perform pg_temp.t('T17 goal_events accepts counts', format('insert into public.goal_events (user_id, goal_id, event, detail) values (%L,%L,''adopt'',''{"tasks":3}''::jsonb)', ua, g1), true);
  perform pg_temp.t('T18 consent only for daily_hours (situation rejected)', format('insert into public.profile_fact_consents (user_id, fact_key, to_goal_id) values (%L,''situation'',%L)', ua, g1), false);
  perform pg_temp.t('T19 consent for daily_hours to goal 1 allowed', format('insert into public.profile_fact_consents (user_id, fact_key, to_goal_id) values (%L,''daily_hours'',%L)', ua, g1), true);
  perform pg_temp.t('T20 duplicate live consent to the same destination rejected', format('insert into public.profile_fact_consents (user_id, fact_key, to_goal_id) values (%L,''daily_hours'',%L)', ua, g1), false);
  perform pg_temp.t('T21 consent to General Chat (null destination) is its own row', format('insert into public.profile_fact_consents (user_id, fact_key, to_goal_id) values (%L,''daily_hours'',null)', ua), true);
  perform pg_temp.t('T22 A cannot point consent at B''s goal', format('insert into public.profile_fact_consents (user_id, fact_key, to_goal_id) values (%L,''daily_hours'',%L)', ua, g3), false);
  perform pg_temp.t('T23 focus can be set to own goal', format('insert into public.daily_loop_focus (user_id, goal_id) values (%L,%L)', ua, g1), true);
  perform pg_temp.t('T24 focus cannot be set to B''s goal', format('update public.daily_loop_focus set goal_id=%L where user_id=%L', g3, ua), false);
  perform pg_temp.t('T25 authenticated users cannot delete goals', format('delete from public.goals where id=%L', g2), false);

  -- ===== T26: cap of 10 live goals
  for i in 1..8 loop insert into public.goals (user_id, kind, title) values (ua, 'custom', 'cap ' || i); end loop;
  perform pg_temp.t('T26 the 11th live goal is refused', format('insert into public.goals (user_id, kind, title) values (%L,''custom'',''one too many'')', ua), false);

  -- ===== T27-T36 adoption: preview, item selection, idempotency, counts, undo
  perform pg_temp.as_admin();
  insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-00000000000c', 'c@marg-test.invalid');
  perform pg_temp.as_user('cccccccc-0000-0000-0000-00000000000c');
  insert into public.mentor_diagnoses (user_id, client_ref, section, mechanism) values (auth.uid(), 'dx-1', 'qa', 'mechanism x') returning id into dx;
  insert into public.mentor_tasks (user_id, diagnosis_id, client_ref, section, task_type, title, objective, success_metric, destination) values (auth.uid(), dx, 'tx-1', 'qa', 'practice', 'tx task', 'objective xx', 'metric xxxx', 'chat') returning id into tx;
  insert into public.mentor_tasks (user_id, client_ref, section, task_type, title, objective, success_metric, destination) values (auth.uid(), 'ty-1', 'qa', 'practice', 'ty task', 'objective xx', 'metric xxxx', 'chat') returning id into ty;
  insert into public.mentor_task_attempts (user_id, task_id, client_ref) values (auth.uid(), tx, 'ax-1') returning id into ax;
  insert into public.mentor_diagnosis_evidence (user_id, diagnosis_id, client_ref, section, evidence_type, claim) values (auth.uid(), dx, 'ex-1', 'qa', 'self_report', 'claim text') returning id into ex;
  r := public.preview_workspace_adoption();
  perform pg_temp.c('T27 preview counts unassigned tasks', 'select ' || (r->>'tasks'), 2);
  r := public.adopt_workspace('adopt-key-0001', 'cat', 'Adopted', null, null, '{}', array[tx], '{}', '{}', '[{"client_thread_id":"legacy","title":"Earlier"}]'::jsonb, array['2026-10-01:abc']);
  ad := (r->>'adoption_id')::uuid;
  perform pg_temp.c('T28 chosen task family moved (diag+task+attempt+evidence = 4 rows)', 'select ' || ((r->'moved'->>'diagnoses')::int + (r->'moved'->>'tasks')::int + (r->'moved'->>'attempts')::int + (r->'moved'->>'evidence')::int), 4);
  perform pg_temp.c('T29 the unselected task stays unassigned', format('select count(*) from public.mentor_tasks where id=%L and goal_id is null', ty), 1);
  perform pg_temp.c('T30 row counts before == after (nothing deleted)', 'select ' || case when r->'row_counts_before' = r->'row_counts_after' then 1 else 0 end, 1);
  -- P4.3: moved rows got goal-specific references; the unselected one did not
  perform pg_temp.c('N1 adopted diagnosis has a goal-specific reference', format('select count(*) from public.mentor_diagnoses where id=%L and client_ref like ''g________~dx-1''', dx), 1);
  perform pg_temp.c('N2 the unselected task kept its reference', format('select count(*) from public.mentor_tasks where id=%L and client_ref=''ty-1''', ty), 1);
  -- P4.3 (F2 fix): General saves the same pattern again the way the app does; the adopted row must not change.
  insert into public.mentor_diagnoses (user_id, client_ref, section, mechanism) values (auth.uid(), 'dx-1', 'qa', 'GENERAL says this')
    on conflict (user_id, client_ref) do update set mechanism = excluded.mechanism;
  perform pg_temp.c('N3 a General upsert of the same pattern does NOT overwrite the adopted row', format('select count(*) from public.mentor_diagnoses where id=%L and mechanism=''mechanism x''', dx), 1);
  perform pg_temp.c('N4 ...it created its own General row instead', 'select count(*) from public.mentor_diagnoses where user_id=auth.uid() and client_ref=''dx-1'' and goal_id is null', 1);
  r2 := public.adopt_workspace('adopt-key-0001', 'cat', 'Adopted', null, null, '{}', array[tx], '{}', '{}', '[]'::jsonb, '{}');
  perform pg_temp.c('T31 repeating the same key is a no-op (idempotent)', 'select ' || case when (r2->>'repeat')::boolean and r2->>'goal_id' = r->>'goal_id' then 1 else 0 end, 1);
  perform pg_temp.c('T32 only one goal was created by the two calls', 'select count(*) from public.goals where user_id=auth.uid()', 1);
  perform pg_temp.as_user(ub);
  perform pg_temp.t('T33 another account cannot undo this adoption', format('select public.undo_adoption(%L)', ad), false);
  perform pg_temp.as_user('cccccccc-0000-0000-0000-00000000000c');
  perform pg_temp.t('T34 a plain update cannot rewrite adopted rows into another goal', format('update public.mentor_tasks set goal_id=null where id=%L', tx), false);
  perform pg_temp.t('N5 undo is refused while a newer General row holds the old reference', format('select public.undo_adoption(%L)', ad), false);
  perform pg_temp.c('N6 ...and the refused undo changed nothing', format('select count(*) from public.mentor_diagnoses where id=%L and goal_id is not null and client_ref like ''g________~dx-1''', dx), 1);
  delete from public.mentor_diagnoses where user_id = auth.uid() and client_ref = 'dx-1' and goal_id is null;
  r := public.undo_adoption(ad);
  perform pg_temp.c('T35 undo returns the four rows to unassigned', format('select count(*) from public.mentor_tasks where user_id=auth.uid() and goal_id is null'), 2);
  perform pg_temp.c('N7 undo restored the original references exactly', format('select (select count(*) from public.mentor_diagnoses where id=%L and client_ref=''dx-1'') + (select count(*) from public.mentor_tasks where id=%L and client_ref=''tx-1'') + (select count(*) from public.mentor_task_attempts where id=%L and client_ref=''ax-1'') + (select count(*) from public.mentor_diagnosis_evidence where id=%L and client_ref=''ex-1'')', dx, tx, ax, ex), 4);
  perform pg_temp.c('T36 undo deleted nothing', 'select (select count(*) from public.mentor_diagnoses where user_id=auth.uid()) + (select count(*) from public.mentor_task_attempts where user_id=auth.uid()) + (select count(*) from public.mentor_diagnosis_evidence where user_id=auth.uid())', 3);
  r2 := public.undo_adoption(ad);
  perform pg_temp.c('T37 a second undo is a no-op', 'select ' || case when (r2->>'repeat')::boolean then 1 else 0 end, 1);

  -- ===== T38-T40 anon, account deletion, and the production-mirror grant finding
  -- T41-T43: re-adopt, then newer activity in the goal blocks a silent undo; a family is never split
  r := public.adopt_workspace('adopt-key-0002', 'cat', 'Adopted again', null, null, '{}', '{}', '{}', array[ex], '[]'::jsonb, '{}');
  ad := (r->>'adoption_id')::uuid;
  perform pg_temp.c('T41 choosing only an evidence row brings its whole family (diag, task, attempt, evidence)', 'select ' || ((r->'moved'->>'diagnoses')::int + (r->'moved'->>'tasks')::int + (r->'moved'->>'attempts')::int + (r->'moved'->>'evidence')::int), 4);
  perform pg_temp.c('N8 a second goal gets a different reference prefix', format('select count(*) from public.mentor_diagnoses where id=%L and client_ref like ''g________~dx-1'' and client_ref not like %L', dx, 'g' || substr(replace(r->>'goal_id', '-', ''), 1, 8) || '~%'), 0);
  perform pg_temp.t('T42 a new task is added to the adopted diagnosis inside the goal',
    format('insert into public.mentor_tasks (user_id, goal_id, diagnosis_id, client_ref, section, task_type, title, objective, success_metric, destination) values (auth.uid(),%L,%L,''tz-new'',''qa'',''practice'',''new task'',''objective xx'',''metric xxxx'',''chat'')', r->>'goal_id', dx), true);
  perform pg_temp.t('T43 undo is refused while newer goal activity depends on the adopted items', format('select public.undo_adoption(%L)', ad), false);
  perform pg_temp.c('T44 ...and the refused undo changed nothing', format('select count(*) from public.mentor_diagnoses where id=%L and goal_id is not null', dx), 1);
  perform pg_temp.as_admin();
  insert into auth.users (id, email) values ('dddddddd-0000-0000-0000-00000000000d', 'd@marg-test.invalid');
  perform pg_temp.as_user('dddddddd-0000-0000-0000-00000000000d');
  insert into public.mentor_diagnoses (user_id, client_ref, section, mechanism) values (auth.uid(), repeat('x', 160), 'qa', 'long ref') returning id into d1;
  r := public.adopt_workspace('adopt-key-0003', 'cat', 'Long refs', null, null, array[d1], '{}', '{}', '{}', '[]'::jsonb, '{}');
  perform pg_temp.c('N9 a maximum-length reference still adopts (prefix fits)', format('select count(*) from public.mentor_diagnoses where id=%L and char_length(client_ref)=160', d1), 1);

  perform pg_temp.as_admin();
  perform set_config('role', 'anon', true);
  perform pg_temp.t('T38 anon cannot read goals', 'select count(*) from public.goals', false);
  perform pg_temp.as_admin();
  perform pg_temp.t('T39 deleting an account removes its goals without FK errors', format('delete from auth.users where id=%L', ua), true);
  perform pg_temp.c('T40 ...and nothing of that account remains', format('select (select count(*) from public.goals where user_id=%L) + (select count(*) from public.mentor_tasks where user_id=%L)', ua, ua), 0);
  perform pg_temp.as_user(ub);
  perform pg_temp.t('F1 FINDING (mirrors production): authenticated can TRUNCATE question_images, which ignores RLS', 'truncate table public.question_images', true);

  perform pg_temp.as_admin();
  raise exception E'RESULTS\n%', current_setting('marg.res', true);
end $outer$;
