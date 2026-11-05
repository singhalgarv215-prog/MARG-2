-- MARG baseline, part 3 of 3: RLS, policies, grants, storage bucket. STAGING ONLY.
-- Reconstructed from production catalog on 2026-11-04. Policies are generated from the
-- production pattern; parity_check.sql compares the resulting policy text with production.
-- Table grants are copied exactly, including the over-broad grants on five tables
-- (see reviews/23): staging mirrors production so tests reflect what production does today.

do $$
declare t text;
begin
  foreach t in array array['users','chats','profiles','checkins','feedback','community_signups','engagement_events','community_interest','acquisition_funnel_events','referral_challenges','referral_challenge_events','web_push_subscriptions','push_notification_queue','mentor_diagnoses','mentor_tasks','mentor_task_attempts','mentor_diagnosis_evidence','product_incidents','push_delivery_config','question_images','image_questions','conversation_question_state','marg_response_reviews','marg_eval_cases','marg_eval_runs']
  loop execute format('alter table public.%I enable row level security', t); end loop;
  foreach t in array array['cat_push_content','practice_source_documents','practice_blueprints']
  loop execute format('alter table private.%I enable row level security', t); end loop;
end $$;

-- standard owner policies: (table, owner column, commands)
do $$
declare r record; c text; ex text;
begin
  for r in select * from (values
    ('chats','user_id','select,insert,update,delete','plain'),
    ('profiles','user_id','select,insert,update,delete','plain'),
    ('users','id','select,insert,update,delete','plain'),
    ('checkins','user_id','select,insert,update,delete','plain'),
    ('feedback','user_id','select,insert,update,delete','text'),
    ('engagement_events','user_id','select,insert','plain'),
    ('community_interest','user_id','select,insert,update,delete','plain'),
    ('referral_challenges','creator_user_id','select,insert','plain'),
    ('web_push_subscriptions','user_id','select,insert,update,delete','plain'),
    ('push_notification_queue','user_id','select,delete','plain'),
    ('mentor_diagnoses','user_id','select,insert,update,delete','plain'),
    ('mentor_tasks','user_id','select,insert,update,delete','plain'),
    ('mentor_task_attempts','user_id','select,insert,update,delete','plain'),
    ('mentor_diagnosis_evidence','user_id','select,insert,update,delete','plain'),
    ('question_images','user_id','select,insert,update,delete','flip'),
    ('image_questions','user_id','select,insert,update,delete','flip'),
    ('conversation_question_state','user_id','select,insert,update,delete','flip'),
    ('marg_response_reviews','user_id','select,insert,update,delete','flip')
  ) as v(tbl, col, cmds, style)
  loop
    ex := case r.style
      when 'plain' then format('%I = (select auth.uid())', r.col)
      when 'text'  then format('%I = ((select auth.uid()))::text', r.col)
      else format('(select auth.uid()) = %I', r.col) end;
    foreach c in array string_to_array(r.cmds, ',') loop
      if c = 'select' or c = 'delete' then
        execute format('create policy %I on public.%I for %s to authenticated using (%s)', r.tbl||'_'||c||'_own', r.tbl, c, ex);
      elsif c = 'insert' then
        execute format('create policy %I on public.%I for insert to authenticated with check (%s)', r.tbl||'_insert_own', r.tbl, ex);
      else
        execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', r.tbl||'_update_own', r.tbl, ex, ex);
      end if;
    end loop;
  end loop;
end $$;

create policy "Public can submit community signup" on public.community_signups for insert to anon, authenticated
  with check (char_length(name) >= 2 and char_length(name) <= 80
    and target_percentile = any (array['90+','95+','98+','99+','99.5+'])
    and biggest_struggle = any (array['VARC','DILR','QA','Time management','Consistency'])
    and char_length(referral_source) >= 1 and char_length(referral_source) <= 160
    and char_length(source_path) >= 1 and char_length(source_path) <= 120);
create policy acquisition_funnel_insert_anonymous on public.acquisition_funnel_events for insert to anon with check (user_id is null);
create policy acquisition_funnel_insert_authenticated on public.acquisition_funnel_events for insert to authenticated
  with check (user_id is null or user_id = (select auth.uid()));
create policy push_notification_queue_insert_own on public.push_notification_queue for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending' and attempt_count = 0);
create policy "Users can read own product incidents" on public.product_incidents for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own product incidents" on public.product_incidents for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can delete own product incidents" on public.product_incidents for delete to authenticated using ((select auth.uid()) = user_id);

-- table grants (exact copy of production)
revoke all on all tables in schema public from anon, authenticated;
grant insert on public.acquisition_funnel_events to anon, authenticated;
grant select, insert, update, delete on public.chats, public.checkins, public.community_interest, public.feedback,
  public.mentor_diagnoses, public.mentor_diagnosis_evidence, public.mentor_task_attempts, public.mentor_tasks,
  public.profiles, public.users, public.web_push_subscriptions to authenticated;
grant insert on public.community_signups to anon, authenticated;
grant all on public.conversation_question_state, public.image_questions, public.marg_response_reviews,
  public.product_incidents, public.question_images to authenticated;
grant select, insert on public.engagement_events, public.referral_challenges to authenticated;
grant select, insert, delete on public.push_notification_queue to authenticated;

-- storage bucket and policies
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-images', 'question-images', false, 15728640, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;
create policy question_images_storage_select_own on storage.objects for select to authenticated
  using (bucket_id = 'question-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy question_images_storage_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'question-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy question_images_storage_update_own on storage.objects for update to authenticated
  using (bucket_id = 'question-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'question-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy question_images_storage_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'question-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
