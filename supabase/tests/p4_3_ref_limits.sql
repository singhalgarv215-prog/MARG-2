-- P4.3 follow-up: goal references are never truncated. RUN ON STAGING ONLY. One transaction, ends with an exception that carries results.
do $$
declare ua uuid := gen_random_uuid(); d1 uuid; d2 uuid; t1 uuid; r jsonb; res text := ''; n int; ad uuid; pfx text;
begin
  if (select count(*) from auth.users) > 50 then raise exception 'refusing to run: auth.users looks like production'; end if;
  insert into auth.users (id, aud, role, email) values (ua, 'authenticated', 'authenticated', 'lim-' || ua || '@marg-test.invalid');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.mentor_diagnoses (user_id, client_ref, section, mechanism) values (ua, repeat('x', 155) || 'AAAAA', 'qa', 'first long reference') returning id into d1;
  insert into public.mentor_diagnoses (user_id, client_ref, section, mechanism) values (ua, repeat('x', 155) || 'BBBBB', 'qa', 'second long reference') returning id into d2;
  insert into public.mentor_tasks (user_id, diagnosis_id, client_ref, section, task_type, title, objective, success_metric, destination) values (ua, d1, repeat('t', 180), 'qa', 'practice', 'long task ref', 'objective xx', 'metric xxxx', 'chat') returning id into t1;
  insert into public.mentor_task_attempts (user_id, task_id, client_ref) values (ua, t1, repeat('a', 200));
  r := public.adopt_workspace('adopt-key-limits-1', 'k', 'Long refs', null, null, array[d1, d2], '{}', '{}', '{}', '[]'::jsonb, '{}');
  ad := (r->>'adoption_id')::uuid;
  pfx := 'g' || substr(replace(r->>'goal_id', '-', ''), 1, 8) || '~';
  select count(*) into n from public.mentor_diagnoses where user_id = ua and goal_id is not null and client_ref in (pfx || repeat('x', 155) || 'AAAAA', pfx || repeat('x', 155) || 'BBBBB');
  res := res || 'two long diagnosis refs stay distinct and complete after adoption: ' || n || ' (want 2)' || E'\n';
  select count(*) into n from public.mentor_task_attempts where user_id = ua and client_ref = pfx || repeat('a', 200); res := res || '200-char attempt ref complete: ' || n || ' (want 1)' || E'\n';
  select count(*) into n from public.mentor_tasks where user_id = ua and client_ref = pfx || repeat('t', 180); res := res || '180-char task ref complete: ' || n || ' (want 1)' || E'\n';
  perform public.undo_adoption(ad);
  select count(*) into n from public.mentor_diagnoses where user_id = ua and client_ref in (repeat('x', 155) || 'AAAAA', repeat('x', 155) || 'BBBBB') and goal_id is null;
  res := res || 'undo restores both exact originals: ' || n || ' (want 2)' || E'\n';
  select count(*) into n from public.mentor_task_attempts where user_id = ua and client_ref = repeat('a', 200); res := res || 'undo restores 200-char attempt ref: ' || n || ' (want 1)' || E'\n';
  begin insert into public.mentor_task_attempts (user_id, task_id, client_ref) values (ua, t1, repeat('b', 211)); res := res || '211-char ref allowed (bad)' || E'\n';
  exception when check_violation then res := res || '211-char ref refused by the new limit' || E'\n'; end;
  raise exception '%', res;
end $$;
