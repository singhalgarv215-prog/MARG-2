-- MARG baseline, part 4: foreign-key ON DELETE actions. STAGING ONLY.
-- The first three parts created FKs with default NO ACTION. Production's catalog shows explicit
-- actions (found by the parity check). Also: chats/checkins/profiles -> auth.users are
-- NOT VALID in production, so existing rows were never validated against auth.users.
do $$
declare r record;
begin
  for r in select * from (values
    ('users','users_id_fkey','foreign key (id) references auth.users(id) on delete cascade'),
    ('chats','chats_user_id_auth_fkey','foreign key (user_id) references auth.users(id) on delete cascade not valid'),
    ('checkins','checkins_user_id_auth_fkey','foreign key (user_id) references auth.users(id) on delete cascade not valid'),
    ('profiles','profiles_user_id_auth_fkey','foreign key (user_id) references auth.users(id) on delete cascade not valid'),
    ('community_interest','community_interest_user_id_fkey','foreign key (user_id) references auth.users(id) on delete cascade'),
    ('conversation_question_state','conversation_question_state_user_id_fkey','foreign key (user_id) references auth.users(id) on delete cascade'),
    ('conversation_question_state','conversation_question_state_active_image_id_fkey','foreign key (active_image_id) references public.question_images(id) on delete set null'),
    ('conversation_question_state','conversation_question_state_active_question_id_fkey','foreign key (active_question_id) references public.image_questions(id) on delete set null'),
    ('engagement_events','engagement_events_user_id_fkey','foreign key (user_id) references auth.users(id) on delete cascade'),
    ('acquisition_funnel_events','acquisition_funnel_events_user_id_fkey','foreign key (user_id) references auth.users(id) on delete set null'),
    ('image_questions','image_questions_image_id_fkey','foreign key (image_id) references public.question_images(id) on delete cascade'),
    ('image_questions','image_questions_user_id_fkey','foreign key (user_id) references auth.users(id) on delete cascade'),
    ('marg_eval_cases','marg_eval_cases_source_review_id_fkey','foreign key (source_review_id) references public.marg_response_reviews(id) on delete set null'),
    ('marg_response_reviews','marg_response_reviews_user_id_fkey','foreign key (user_id) references auth.users(id) on delete cascade'),
    ('mentor_diagnoses','mentor_diagnoses_user_id_fkey','foreign key (user_id) references auth.users(id) on delete cascade'),
    ('mentor_diagnosis_evidence','mentor_diagnosis_evidence_owner_fk','foreign key (user_id, diagnosis_id) references public.mentor_diagnoses(user_id, id) on delete cascade'),
    ('mentor_diagnosis_evidence','mentor_diagnosis_evidence_user_id_fkey','foreign key (user_id) references auth.users(id) on delete cascade'),
    ('mentor_task_attempts','mentor_task_attempts_task_owner_fk','foreign key (user_id, task_id) references public.mentor_tasks(user_id, id) on delete cascade'),
    ('mentor_task_attempts','mentor_task_attempts_user_id_fkey','foreign key (user_id) references auth.users(id) on delete cascade'),
    ('mentor_tasks','mentor_tasks_diagnosis_owner_fk','foreign key (user_id, diagnosis_id) references public.mentor_diagnoses(user_id, id) on delete restrict'),
    ('mentor_tasks','mentor_tasks_user_id_fkey','foreign key (user_id) references auth.users(id) on delete cascade'),
    ('product_incidents','product_incidents_user_id_fkey','foreign key (user_id) references auth.users(id) on delete cascade'),
    ('push_notification_queue','push_notification_queue_user_id_fkey','foreign key (user_id) references auth.users(id) on delete cascade'),
    ('question_images','question_images_user_id_fkey','foreign key (user_id) references auth.users(id) on delete cascade'),
    ('referral_challenge_events','referral_challenge_events_challenge_id_fkey','foreign key (challenge_id) references public.referral_challenges(id) on delete cascade'),
    ('referral_challenge_events','referral_challenge_events_creator_user_id_fkey','foreign key (creator_user_id) references auth.users(id) on delete cascade'),
    ('referral_challenge_events','referral_challenge_events_viewer_user_id_fkey','foreign key (viewer_user_id) references auth.users(id) on delete set null'),
    ('referral_challenges','referral_challenges_creator_user_id_fkey','foreign key (creator_user_id) references auth.users(id) on delete cascade'),
    ('web_push_subscriptions','web_push_subscriptions_user_id_fkey','foreign key (user_id) references auth.users(id) on delete cascade')
  ) as v(tbl, con, ddl)
  loop
    execute format('alter table public.%I drop constraint %I', r.tbl, r.con);
    execute format('alter table public.%I add constraint %I %s', r.tbl, r.con, r.ddl);
  end loop;
end $$;
