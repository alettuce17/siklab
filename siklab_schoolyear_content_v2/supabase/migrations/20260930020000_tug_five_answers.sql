-- Keep existing four-answer Tug questions available for teacher editing.
-- New questions and matches require five choices. No synthetic answer is inserted.
alter table public.custom_question drop constraint if exists custom_question_answer_options_check;
alter table public.custom_question add constraint custom_question_answer_options_check
check (answer_options is null or
       (jsonb_typeof(answer_options)='array' and
        jsonb_array_length(answer_options)=5) or
       (game_module='TUG' and jsonb_typeof(answer_options)='array' and
        jsonb_array_length(answer_options)=4));
