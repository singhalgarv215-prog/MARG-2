-- MARG baseline, part 2 of 3: functions, triggers, function grants. STAGING ONLY.
-- Copied from pg_get_functiondef() on production, 2026-11-04.
-- Deliberately NOT copied: pg_cron jobs (marg-daily-cat-morning, marg-daily-cat-evening,
-- marg-send-web-push). Their commands call production endpoints; staging must never schedule them.

create or replace function private.ensure_marg_profile_for_new_user() returns trigger
language plpgsql security definer set search_path to '' as $function$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$function$;

create trigger ensure_marg_profile_after_auth_signup after insert on auth.users
for each row execute function private.ensure_marg_profile_for_new_user();

create or replace function private.enqueue_daily_cat_push(p_slot text) returns integer
language plpgsql set search_path to '' as $function$
declare
  inserted_count integer := 0;
  india_day date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if p_slot not in ('morning', 'evening') then
    raise exception 'Invalid CAT push slot: %', p_slot;
  end if;
  with eligible_users as (
    select distinct s.user_id from public.web_push_subscriptions s
    where s.enabled = true and s.daily_reminders_enabled = true
  ), chosen_content as (
    select c.title, c.body from private.cat_push_content c
    where c.active = true and c.slot = p_slot
    order by c.id
    offset mod(extract(doy from india_day)::integer - 1,
      greatest(1, (select count(*) from private.cat_push_content where active = true and slot = p_slot)))
    limit 1
  ), active_tasks as (
    select distinct on (t.user_id) t.user_id, t.section
    from public.mentor_tasks t
    where t.status in ('ready', 'in_progress', 'evidence_ready')
    order by t.user_id,
      case t.status when 'evidence_ready' then 0 when 'in_progress' then 1 else 2 end,
      t.updated_at desc
  )
  insert into public.push_notification_queue (user_id, kind, title, body, target_path, scheduled_for, status, dedupe_key, attempt_count)
  select u.user_id,
    case when a.section in ('varc','dilr','qa','mock') then a.section else 'general' end,
    case when a.user_id is not null then
        case when a.section = 'varc' then 'Your VARC check is waiting'
             when a.section = 'dilr' then 'Make this DILR set earn its time'
             when a.section = 'qa' then 'Your QA checkpoint is ready'
             when a.section = 'mock' then 'Your mock left evidence to review'
             else 'Your next CAT move is already set' end
      else c.title end,
    case when a.section = 'varc' then 'The exact VARC check Marg saved is ready. Use the evidence before adding more practice.'
         when a.section = 'dilr' then 'Your saved DILR decision check is ready. Judge the stay-or-exit decision, not only the solved set.'
         when a.section = 'qa' then 'Your saved QA checkpoint is ready. Test recognition and setup before blaming calculation.'
         when a.section = 'mock' then 'Your saved mock review is ready. Find the first execution leak before changing the plan.'
         when a.user_id is not null then 'Your saved CAT task is ready. Complete the evidence step before changing the plan.'
         else c.body end,
    case when a.user_id is not null then '/?tab=home&resume=1' else '/?tab=home' end,
    now(), 'pending', 'daily:' || p_slot || ':' || india_day::text, 0
  from eligible_users u cross join chosen_content c left join active_tasks a on a.user_id = u.user_id
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$function$;

create or replace function public.record_referral_share(p_token text) returns boolean
language plpgsql security definer set search_path to 'public', 'auth' as $function$
declare challenge_row public.referral_challenges%rowtype; creator_visitor text;
begin
  if auth.uid() is null then return false; end if;
  select c.* into challenge_row from public.referral_challenges c
  where c.share_token = p_token and c.creator_user_id = auth.uid();
  if not found then return false; end if;
  creator_visitor := 'creator-' || replace(auth.uid()::text, '-', '');
  insert into public.referral_challenge_events (challenge_id, creator_user_id, visitor_id, viewer_user_id, event_type)
  values (challenge_row.id, challenge_row.creator_user_id, creator_visitor, auth.uid(), 'shared')
  on conflict (challenge_id, visitor_id, event_type) do nothing;
  return true;
end;
$function$;

create or replace function public.get_referral_challenge(p_token text, p_visitor_id text)
returns table(share_token text, section text, title text, context_text text, question_text text, options jsonb, created_at timestamptz)
language plpgsql security definer set search_path to 'public', 'auth' as $function$
declare challenge_row public.referral_challenges%rowtype; clean_visitor text := coalesce(p_visitor_id, '');
begin
  if coalesce(p_token, '') !~ '^[a-f0-9]{32}$' or clean_visitor !~ '^[a-zA-Z0-9_-]{8,120}$' then
    raise exception 'Invalid challenge request' using errcode = '22023';
  end if;
  select c.* into challenge_row from public.referral_challenges c where c.share_token = p_token and c.expires_at > now();
  if not found then return; end if;
  if (select count(*) from public.referral_challenge_events e where e.challenge_id = challenge_row.id and e.event_type = 'opened') < 5000 then
    insert into public.referral_challenge_events (challenge_id, creator_user_id, visitor_id, event_type)
    values (challenge_row.id, challenge_row.creator_user_id, clean_visitor, 'opened')
    on conflict (challenge_id, visitor_id, event_type) do nothing;
  end if;
  return query select challenge_row.share_token, challenge_row.section, challenge_row.title, challenge_row.context_text,
    challenge_row.question_text, challenge_row.options, challenge_row.created_at;
end;
$function$;

create or replace function public.get_my_referral_stats()
returns table(challenges_created bigint, friends_opened bigint, friends_answered bigint, friends_correct bigint, ask_marg_clicks bigint, signups_completed bigint, successful_referrals bigint)
language sql security definer set search_path to 'public', 'auth' as $function$
  select
    (select count(*) from public.referral_challenges c where c.creator_user_id = auth.uid()),
    count(distinct e.visitor_id) filter (where e.event_type = 'opened'),
    count(distinct e.visitor_id) filter (where e.event_type = 'answered'),
    count(distinct e.visitor_id) filter (where e.event_type = 'answered' and coalesce((e.metadata->>'is_correct')::boolean, false)),
    count(distinct e.visitor_id) filter (where e.event_type = 'ask_marg_clicked'),
    count(distinct e.viewer_user_id) filter (where e.event_type = 'signup_completed'),
    count(distinct e.visitor_id) filter (where e.event_type in ('answered', 'signup_completed'))
  from public.referral_challenge_events e where e.creator_user_id = auth.uid();
$function$;

create or replace function public.append_my_mock_history(p_varc integer, p_dilr integer, p_qa integer, p_date date default current_date)
returns jsonb language plpgsql set search_path to 'public', 'pg_catalog' as $function$
declare v_user uuid := auth.uid(); v_entry jsonb; v_history jsonb; v_sessions integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_varc is null or p_dilr is null or p_qa is null then raise exception 'All section scores are required'; end if;
  if p_varc < -50 or p_dilr < -50 or p_qa < -50 or p_varc > 200 or p_dilr > 200 or p_qa > 200 then
    raise exception 'Section score is outside the supported range';
  end if;
  v_entry := jsonb_build_object('date', p_date::text, 'varc', p_varc, 'dilr', p_dilr, 'qa', p_qa, 'total', p_varc + p_dilr + p_qa);
  insert into public.profiles (user_id, mock_history, sessions_count) values (v_user, jsonb_build_array(v_entry), 1)
  on conflict (user_id) do update
    set mock_history = case when jsonb_typeof(public.profiles.mock_history) = 'array' then public.profiles.mock_history || v_entry else jsonb_build_array(v_entry) end,
        sessions_count = coalesce(public.profiles.sessions_count, 0) + 1
  returning mock_history, sessions_count into v_history, v_sessions;
  while jsonb_array_length(v_history) > 20 loop v_history := v_history - 0; end loop;
  update public.profiles set mock_history = v_history where user_id = v_user;
  return jsonb_build_object('mock_history', v_history, 'sessions_count', v_sessions);
end;
$function$;

create or replace function public.claim_referral_signup(p_token text, p_visitor_id text) returns boolean
language plpgsql security definer set search_path to 'public', 'auth' as $function$
declare challenge_row public.referral_challenges%rowtype;
  clean_visitor text := left(regexp_replace(coalesce(p_visitor_id, ''), '[^a-zA-Z0-9_-]', '', 'g'), 120);
begin
  if auth.uid() is null or char_length(clean_visitor) < 8 then return false; end if;
  select c.* into challenge_row from public.referral_challenges c where c.share_token = p_token and c.expires_at > now();
  if not found or challenge_row.creator_user_id = auth.uid() then return false; end if;
  insert into public.referral_challenge_events (challenge_id, creator_user_id, visitor_id, viewer_user_id, event_type)
  values (challenge_row.id, challenge_row.creator_user_id, clean_visitor, auth.uid(), 'signup_completed')
  on conflict (challenge_id, visitor_id, event_type) do nothing;
  return true;
end;
$function$;

create or replace function public.append_my_mock_history_v2(p_varc integer default null, p_dilr integer default null, p_qa integer default null, p_date date default current_date, p_client_ref text default null, p_source text default 'manual')
returns jsonb language plpgsql set search_path to 'public', 'pg_catalog' as $function$
declare v_user uuid := auth.uid(); v_ref text := left(nullif(btrim(p_client_ref), ''), 180);
  v_entry jsonb; v_history jsonb; v_sessions integer; v_duplicate jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_varc is null and p_dilr is null and p_qa is null then raise exception 'At least one section score is required'; end if;
  if (p_varc is not null and (p_varc < -100 or p_varc > 200))
     or (p_dilr is not null and (p_dilr < -100 or p_dilr > 200))
     or (p_qa is not null and (p_qa < -100 or p_qa > 200)) then
    raise exception 'Section score is outside the supported range';
  end if;
  if v_ref is null then raise exception 'A client reference is required'; end if;
  select coalesce(mock_history, '[]'::jsonb), coalesce(sessions_count, 0) into v_history, v_sessions
  from public.profiles where user_id = v_user;
  if v_history is null or jsonb_typeof(v_history) <> 'array' then v_history := '[]'::jsonb; end if;
  select item into v_duplicate from jsonb_array_elements(v_history) item where item ->> 'client_ref' = v_ref limit 1;
  if v_duplicate is not null then
    return jsonb_build_object('mock_history', v_history, 'sessions_count', v_sessions, 'duplicate', true, 'entry', v_duplicate);
  end if;
  v_entry := jsonb_strip_nulls(jsonb_build_object('date', coalesce(p_date, current_date)::text, 'varc', p_varc, 'dilr', p_dilr, 'qa', p_qa,
    'total', case when p_varc is not null and p_dilr is not null and p_qa is not null then p_varc + p_dilr + p_qa else null end,
    'client_ref', v_ref, 'source', left(coalesce(nullif(btrim(p_source), ''), 'manual'), 40)));
  insert into public.profiles (user_id, mock_history, sessions_count) values (v_user, jsonb_build_array(v_entry), 1)
  on conflict (user_id) do update
    set mock_history = case when jsonb_typeof(public.profiles.mock_history) = 'array' then public.profiles.mock_history || v_entry else jsonb_build_array(v_entry) end,
        sessions_count = coalesce(public.profiles.sessions_count, 0) + 1
  returning mock_history, sessions_count into v_history, v_sessions;
  while jsonb_array_length(v_history) > 20 loop v_history := v_history - 0; end loop;
  update public.profiles set mock_history = v_history where user_id = v_user;
  return jsonb_build_object('mock_history', v_history, 'sessions_count', v_sessions, 'duplicate', false, 'entry', v_entry);
end;
$function$;

create or replace function public.answer_referral_challenge(p_token text, p_visitor_id text, p_answer_index smallint)
returns table(is_correct boolean, correct_index smallint, explanation text, insight text)
language plpgsql security definer set search_path to 'public', 'auth' as $function$
declare challenge_row public.referral_challenges%rowtype; clean_visitor text := coalesce(p_visitor_id, ''); answer_is_correct boolean;
begin
  if coalesce(p_token, '') !~ '^[a-f0-9]{32}$' or clean_visitor !~ '^[a-zA-Z0-9_-]{8,120}$' or p_answer_index not between 0 and 3 then
    raise exception 'Invalid challenge answer' using errcode = '22023';
  end if;
  select c.* into challenge_row from public.referral_challenges c where c.share_token = p_token and c.expires_at > now();
  if not found then return; end if;
  answer_is_correct := p_answer_index = challenge_row.correct_index;
  if (select count(*) from public.referral_challenge_events e where e.challenge_id = challenge_row.id and e.event_type = 'answered') < 5000 then
    insert into public.referral_challenge_events (challenge_id, creator_user_id, visitor_id, event_type, answer_index, metadata)
    values (challenge_row.id, challenge_row.creator_user_id, clean_visitor, 'answered', p_answer_index, jsonb_build_object('is_correct', answer_is_correct))
    on conflict (challenge_id, visitor_id, event_type) do nothing;
  end if;
  return query select answer_is_correct, challenge_row.correct_index, challenge_row.explanation, challenge_row.insight;
end;
$function$;

create or replace function public.track_referral_challenge_event(p_token text, p_visitor_id text, p_event_type text) returns boolean
language plpgsql security definer set search_path to 'public', 'auth' as $function$
declare challenge_row public.referral_challenges%rowtype; clean_visitor text := coalesce(p_visitor_id, '');
begin
  if p_event_type not in ('ask_marg_clicked', 'reshared') or coalesce(p_token, '') !~ '^[a-f0-9]{32}$' or clean_visitor !~ '^[a-zA-Z0-9_-]{8,120}$' then
    return false;
  end if;
  select c.* into challenge_row from public.referral_challenges c where c.share_token = p_token and c.expires_at > now();
  if not found then return false; end if;
  if (select count(*) from public.referral_challenge_events e where e.challenge_id = challenge_row.id and e.event_type = p_event_type) >= 5000 then
    return false;
  end if;
  insert into public.referral_challenge_events (challenge_id, creator_user_id, visitor_id, event_type)
  values (challenge_row.id, challenge_row.creator_user_id, clean_visitor, p_event_type)
  on conflict (challenge_id, visitor_id, event_type) do nothing;
  return true;
end;
$function$;

-- function grants (production: authenticated on all eight; anon on the three public-challenge RPCs)
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.record_referral_share(text), public.get_my_referral_stats(),
  public.append_my_mock_history(integer, integer, integer, date), public.claim_referral_signup(text, text),
  public.append_my_mock_history_v2(integer, integer, integer, date, text, text) to authenticated;
grant execute on function public.get_referral_challenge(text, text),
  public.answer_referral_challenge(text, text, smallint),
  public.track_referral_challenge_event(text, text, text) to anon, authenticated;
