-- P4.6: archive, bring in, chats.thread_id and permanent deletion, with a canary scan. RUN ON STAGING ONLY.
-- One transaction; ends with an exception that carries the results, so nothing is left behind.
do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); g1 uuid; g2 uuid; g3 uuid; gb uuid; r text := ''; n int; c int; j jsonb;
  d1 uuid; t1 uuid; thr1 text := gen_random_uuid()::text; thr_gen text := gen_random_uuid()::text; thr_late text := gen_random_uuid()::text; thr_id uuid; thr_late_id uuid; sh uuid; rec record; hits text := '';
  tagc text;
begin
  if (select count(*) from auth.users) > 50 then raise exception 'refusing to run: auth.users looks like production'; end if;
  insert into auth.users (id, aud, role, email) values (ua, 'authenticated', 'authenticated', 'lc-a-' || ua || '@marg-test.invalid'), (ub, 'authenticated', 'authenticated', 'lc-b-' || ub || '@marg-test.invalid');
  -- account B has a goal and data that must never be touched
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true); perform set_config('role', 'authenticated', true);
  insert into public.goals (user_id, kind, title) values (ub, 'k', 'B goal title') returning id into gb;
  insert into public.mentor_diagnoses (user_id, goal_id, client_ref, section, mechanism) values (ub, gb, 'b-dx-1', 'qa', 'B mechanism stays forever');
  -- account A
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true); perform set_config('role', 'authenticated', true);
  insert into public.goals (user_id, kind, title, description, desired_outcome) values (ua, 'CANARY-G1-kind', 'CANARY-G1 title', 'CANARY-G1 description', 'CANARY-G1 outcome') returning id into g1;
  insert into public.goals (user_id, kind, title) values (ua, 'k', 'Goal two stays') returning id into g2;
  insert into public.goals (user_id, kind, title) values (ua, 'k', 'Goal three') returning id into g3;
  insert into public.chat_threads (user_id, goal_id, client_thread_id, title) values (ua, g1, thr1, 'CANARY-G1 thread title') returning id into thr_id;
  tagc := E'\n[MARG_THREAD:' || replace(replace(replace(replace(replace(replace(('{"id":"' || thr1 || '","title":"CANARY-G1 thread title","purposeKey":""}'), '{', '%7B'), '}', '%7D'), '"', '%22'), ':', '%3A'), ',', '%2C'), ' ', '%20') || ']';
  insert into public.chats (user_id, role, content) values (ua, 'user', 'CANARY-G1 message one' || tagc);
  select count(*) into c from public.chats where user_id = ua and thread_id = thr_id; r := r || 'TH1 a message of a goal conversation gets its thread_id from its tag on insert: ' || c || ' (want 1)' || E'\n';
  -- a message written BEFORE the conversation was registered, then linked
  insert into public.chats (user_id, role, content) values (ua, 'user', 'earlier message of a conversation adopted later' || E'\n[MARG_THREAD:' || replace(replace(replace(replace(replace(replace(('{"id":"' || thr_late || '","title":"late","purposeKey":""}'), '{', '%7B'), '}', '%7D'), '"', '%22'), ':', '%3A'), ',', '%2C'), ' ', '%20') || ']');
  insert into public.chat_threads (user_id, goal_id, client_thread_id, title) values (ua, g2, thr_late, 'late thread') returning id into thr_late_id;
  select public.link_thread_messages(thr_late) into n; r := r || 'TH2 an earlier message is linked after the conversation is registered: ' || n || ' linked (want 1)' || E'\n';
  select public.link_thread_messages(thr_late) into n; r := r || 'TH3 linking again changes nothing: ' || n || ' (want 0)' || E'\n';
  -- General conversation message (not registered): stays unlinked
  insert into public.chats (user_id, role, content) values (ua, 'user', 'General chat message' || E'\n[MARG_THREAD:' || replace(replace(replace(replace(replace(replace(('{"id":"' || thr_gen || '","title":"General","purposeKey":""}'), '{', '%7B'), '}', '%7D'), '"', '%22'), ':', '%3A'), ',', '%2C'), ' ', '%20') || ']');
  select count(*) into c from public.chats where user_id = ua and thread_id is null; r := r || 'TH4 a General conversation message stays unlinked: ' || c || ' (want 1)' || E'\n';
  begin insert into public.chats (user_id, role, content, thread_id) values (ua, 'user', 'x', (select id from public.chat_threads limit 0)); exception when others then null; end;
  begin insert into public.chats (user_id, role, content, thread_id) values (ua, 'user', 'x', thr_id) ; r := r || 'TH5 a message linked to its own conversation: ok' || E'\n'; exception when others then r := r || 'TH5 failed: ' || sqlerrm || E'\n'; end;
  delete from public.chats where user_id = ua and content = 'x';

  -- goal data for g1 (canary everywhere) and a little for g2 / General
  insert into public.mentor_diagnoses (user_id, goal_id, client_ref, section, mechanism) values (ua, g1, 'a-dx-g1', 'qa', 'CANARY-G1 mechanism') returning id into d1;
  insert into public.mentor_tasks (user_id, goal_id, diagnosis_id, client_ref, section, task_type, title, objective, success_metric, destination, action_payload)
    values (ua, g1, d1, 'a-t-g1', 'qa', 'practice', 'CANARY-G1 task title', 'CANARY-G1 objective', 'CANARY-G1 metric', 'chat', '{"artifact_snapshot":"CANARY-G1 question text"}') returning id into t1;
  insert into public.mentor_task_attempts (user_id, goal_id, task_id, client_ref) values (ua, g1, t1, 'a-att-g1');
  insert into public.mentor_diagnosis_evidence (user_id, goal_id, diagnosis_id, client_ref, section, evidence_type, claim) values (ua, g1, d1, 'a-ev-g1', 'qa', 'self_report', 'CANARY-G1 claim');
  insert into public.mentor_diagnoses (user_id, goal_id, client_ref, section, mechanism) values (ua, g2, 'a-dx-g2', 'qa', 'goal two mechanism stays');
  insert into public.mentor_diagnoses (user_id, client_ref, section, mechanism) values (ua, 'a-dx-general', 'qa', 'general mechanism stays');
  insert into public.conversation_question_state (user_id, conversation_id) values (ua, thr1);
  begin
    insert into public.marg_response_reviews (user_id, conversation_id, assistant_message_ref, source, failure_label, user_message, assistant_message, user_correction)
      values (ua, thr1, 'ref-1', 'report', 'other', 'CANARY-G1 user message', 'CANARY-G1 assistant message', 'CANARY-G1 correction');
    r := r || 'planted a response review for the goal conversation' || E'\n';
  exception when others then r := r || 'could not plant a response review (' || left(sqlerrm, 60) || '): that store is NOT covered by this test' || E'\n'; end;
  -- bring in: from g1 into g2 (content mentions the canary: it must be removed with g1), and from g2 into g3 (must stay)
  select public.bring_in_progress(g1, g2, 'CANARY-G1 progress summary brought into goal two') into sh;
  perform public.bring_in_progress(g2, g3, 'summary of goal two for goal three');
  select count(*) into c from public.goal_context_shares where user_id = ua; r := r || 'BR1 two bring-ins recorded: ' || c || ' (want 2)' || E'\n';
  select count(*) into c from public.goal_events where user_id = ua and event = 'share'; r := r || 'BR2 each bring-in left a counts-only event: ' || c || ' (want 2)' || E'\n';
  begin perform public.bring_in_progress(g1, g1, 'same goal'); r := r || 'BR3 same goal: ALLOWED (bad)' || E'\n'; exception when others then r := r || 'BR3 bringing a goal into itself refused' || E'\n'; end;
  begin perform public.bring_in_progress(g1, g2, repeat('x', 2001)); r := r || 'BR4 over-long summary: ALLOWED (bad)' || E'\n'; exception when others then r := r || 'BR4 summary over 2000 characters refused' || E'\n'; end;
  insert into public.profile_fact_consents (user_id, fact_key, to_goal_id) values (ua, 'daily_hours', g1);
  insert into public.daily_loop_focus (user_id, goal_id) values (ua, g1);
  insert into public.goal_adoptions (user_id, goal_id, idempotency_key) values (ua, g1, 'canary-adoption-key') returning id into rec;

  -- archive and restore
  begin perform public.delete_goal_permanently(g1, 'CANARY-G1 title'); r := r || 'AR1 delete without archiving: ALLOWED (bad)' || E'\n'; exception when others then r := r || 'AR1 delete refused until archived: ' || left(sqlerrm, 50) || E'\n'; end;
  perform public.archive_goal(g1);
  select count(*) into c from public.goals where id = g1 and archived_at is not null; r := r || 'AR2 archived: ' || c || ' (want 1)' || E'\n';
  select count(*) into c from public.mentor_diagnoses where goal_id = g1; r := r || 'AR3 archiving keeps every row: ' || c || ' diagnoses (want 1)' || E'\n';
  begin perform public.archive_goal(g1); r := r || 'AR4 archiving twice: ALLOWED (bad)' || E'\n'; exception when others then r := r || 'AR4 archiving twice refused' || E'\n'; end;
  perform public.unarchive_goal(g1); perform public.archive_goal(g1);
  select count(*) into c from public.goal_events where user_id = ua and goal_id = g1 and event in ('archive', 'unarchive'); r := r || 'AR5 archive, restore, archive left 3 events: ' || c || ' (want 3)' || E'\n';

  -- permanent deletion guards
  begin perform public.delete_goal_permanently(g1, 'wrong title'); r := r || 'DL1 wrong title: ALLOWED (bad)' || E'\n'; exception when others then r := r || 'DL1 wrong typed title refused' || E'\n'; end;
  begin perform public.delete_goal_permanently(g1, null); r := r || 'DL2 no title: ALLOWED (bad)' || E'\n'; exception when others then r := r || 'DL2 missing typed title refused' || E'\n'; end;
  begin perform public.delete_goal_permanently(g2, 'Goal two stays'); r := r || 'DL3 live (not archived) goal: ALLOWED (bad)' || E'\n'; exception when others then r := r || 'DL3 a goal that is not archived refused' || E'\n'; end;
  j := public.goal_deletion_preview(g1);
  r := r || 'DL4 dry run: ' || j::text || E'\n';
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true); perform set_config('role', 'authenticated', true);
  begin perform public.delete_goal_permanently(g1, 'CANARY-G1 title'); r := r || 'DL5 another account deleting A goal: ALLOWED (bad)' || E'\n'; exception when others then r := r || 'DL5 another account cannot delete it: ' || left(sqlerrm, 40) || E'\n'; end;
  select count(*) into c from public.goals where id = g1; r := r || 'DL6 ...and it still exists (seen as postgres below)' || E'\n';
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true); perform set_config('role', 'authenticated', true);
  begin delete from public.goals where id = g2; r := r || 'DL7 a user deleting a goal directly: ALLOWED (bad)' || E'\n'; exception when insufficient_privilege then r := r || 'DL7 a goal cannot be deleted directly, only through the function' || E'\n'; end;
  begin delete from public.goal_tombstones; r := r || 'DL7b tombstone delete: ALLOWED (bad)' || E'\n'; exception when insufficient_privilege then r := r || 'DL7b tombstones cannot be deleted by users' || E'\n'; end;

  -- the deletion
  j := public.delete_goal_permanently(g1, '  CANARY-G1 title ');
  r := r || 'DL8 deleted; counts returned: ' || j::text || E'\n';
  perform set_config('role', 'postgres', true);
  select count(*) into c from public.goals where id = g1; r := r || 'DL9 goal row gone: ' || c || ' (want 0)' || E'\n';
  select (select count(*) from public.mentor_diagnoses where goal_id = g1) + (select count(*) from public.mentor_tasks where goal_id = g1) + (select count(*) from public.mentor_task_attempts where goal_id = g1) + (select count(*) from public.mentor_diagnosis_evidence where goal_id = g1) + (select count(*) from public.chat_threads where goal_id = g1) + (select count(*) from public.chats where thread_id = thr_id) + (select count(*) from public.conversation_question_state where conversation_id = thr1) + (select count(*) from public.marg_response_reviews where conversation_id = thr1) + (select count(*) from public.goal_context_shares where from_goal_id = g1 or to_goal_id = g1) + (select count(*) from public.profile_fact_consents where to_goal_id = g1) + (select count(*) from public.goal_adoptions where goal_id = g1) + (select count(*) from public.daily_loop_focus where user_id = ua) into c;
  r := r || 'DL10 every row of the goal is gone (diagnoses, tasks, attempts, evidence, threads, messages, question state, reviews, shares, consents, adoption, focus): ' || c || ' left (want 0)' || E'\n';
  select count(*) into c from public.mentor_diagnoses where user_id = ua and goal_id = g2; r := r || 'DL11 goal two untouched: ' || c || ' (want 1)' || E'\n';
  select count(*) into c from public.mentor_diagnoses where user_id = ua and goal_id is null; r := r || 'DL12 General data untouched: ' || c || ' (want 1)' || E'\n';
  select count(*) into c from public.chats where user_id = ua; r := r || 'DL13 other messages untouched (general + goal two): ' || c || ' (want 2)' || E'\n';
  select count(*) into c from public.mentor_diagnoses where user_id = ub; r := r || 'DL14 account B untouched: ' || c || ' (want 1)' || E'\n';
  select count(*) into c from public.goals where id = gb; r := r || 'DL15 account B goal with the same title untouched: ' || c || ' (want 1)' || E'\n';
  select count(*) into c from public.goal_context_shares where user_id = ua; r := r || 'DL16 the unrelated bring-in (goal two to goal three) is kept: ' || c || ' (want 1)' || E'\n';
  select count(*) into c from public.goal_tombstones where goal_id = g1 and user_id = ua; r := r || 'DL17 one tombstone: ' || c || ' (want 1)' || E'\n';
  select (counts)::text into hits from public.goal_tombstones where goal_id = g1; r := r || 'DL18 tombstone holds counts only: ' || hits || E'\n';
  select count(*) into c from public.goal_events where goal_id = g1 and event = 'delete'; r := r || 'DL19 one delete event (counts only): ' || c || ' (want 1)' || E'\n';

  -- canary scan of every table in public: no row of any table may contain the goal's text
  hits := '';
  for rec in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' loop
    execute format('select count(*) from public.%I t where t::text ilike %L', rec.table_name, '%CANARY-G1%') into c;
    if c > 0 then hits := hits || rec.table_name || '(' || c || ') '; end if;
  end loop;
  r := r || 'CANARY scan of every table in public: ' || coalesce(nullif(hits, ''), 'zero hits') || E'\n';
  raise exception '%', r;
end $$;
