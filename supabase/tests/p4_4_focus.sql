-- P4.4: the Daily Loop focus under row-level security. RUN ON STAGING ONLY. One transaction; ends with an exception that carries results.
do $$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); ga uuid; gb uuid; r text := ''; n int; g uuid; c int;
begin
  if (select count(*) from auth.users) > 50 then raise exception 'refusing to run: auth.users looks like production'; end if;
  insert into auth.users (id, aud, role, email) values (ua, 'authenticated', 'authenticated', 'fa-' || ua || '@marg-test.invalid'), (ub, 'authenticated', 'authenticated', 'fb-' || ub || '@marg-test.invalid');
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.goals (user_id, kind, title) values (ub, 'k', 'B goal') returning id into gb;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.goals (user_id, kind, title) values (ua, 'k', 'A goal') returning id into ga;
  select count(*) into c from public.daily_loop_focus; r := r || 'before any choice: rows=' || c || ' (want 0)' || E'\n';
  insert into public.daily_loop_focus (user_id, goal_id) values (ua, ga) on conflict (user_id) do update set goal_id = excluded.goal_id;
  select goal_id into g from public.daily_loop_focus; r := r || 'chosen goal A: ' || (g = ga) || E'\n';
  insert into public.daily_loop_focus (user_id, goal_id) values (ua, null) on conflict (user_id) do update set goal_id = excluded.goal_id;
  select count(*), count(goal_id) into c, n from public.daily_loop_focus; r := r || 'then chose no goal: rows=' || c || ' with goal=' || n || ' (want 1 and 0)' || E'\n';
  begin insert into public.daily_loop_focus (user_id, goal_id) values (ua, gb) on conflict (user_id) do update set goal_id = excluded.goal_id; r := r || 'focus on another account goal: ALLOWED (bad)' || E'\n';
  exception when others then r := r || 'focus on another account goal refused' || E'\n'; end;
  begin insert into public.daily_loop_focus (user_id, goal_id) values (ub, ga) on conflict (user_id) do update set goal_id = excluded.goal_id; r := r || 'focus row for another user: ALLOWED (bad)' || E'\n';
  exception when others then r := r || 'focus row for another user refused' || E'\n'; end;
  select count(*) into c from public.daily_loop_focus; r := r || 'A sees only its own row: ' || c || ' (want 1)' || E'\n';
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into c from public.daily_loop_focus; r := r || 'B sees none of A focus: ' || c || ' (want 0)' || E'\n';
  raise exception '%', r;
end $$;
