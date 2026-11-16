-- Restores the previous (over-broad) grants. Only for emergency rollback.
grant truncate, references, trigger on table
  public.question_images, public.image_questions, public.conversation_question_state,
  public.marg_response_reviews, public.product_incidents
to authenticated;
