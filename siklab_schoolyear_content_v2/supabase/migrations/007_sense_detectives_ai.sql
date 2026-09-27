-- 007 Sense Detectives AI metadata and named sets; run AFTER migration 003.
-- Safe for existing manual questions: existing rows remain approved in General Questions.
-- No changes to the five-button correct_ans check.
alter table public.custom_question
    add column if not exists question_set text not null default 'General Questions',
    add column if not exists explanation text,
    add column if not exists topic text,
    add column if not exists source_type text not null default 'manual',
    add column if not exists source_label text,
    add column if not exists lesson_module_id bigint references public.lesson_modules(module_id) on delete set null,
    add column if not exists image_query text,
    add column if not exists image_attribution text,
    add column if not exists image_license text,
    add column if not exists image_source text,
    add column if not exists ai_generated boolean not null default false,
    add column if not exists review_status text not null default 'approved';

create index if not exists idx_siklab_sense_question_set
    on public.custom_question (school_year_id, game_module, question_set, review_status);

-- The existing function in migration 003 copies only old question columns.
-- Replace it to preserve new metadata when copying curriculum to a new school year.
-- For source lesson references, remap by week_id in the destination year.

create or replace function public.copy_school_year_content(
    p_source_year_id bigint,
    p_target_year_id bigint,
    p_copy_lessons boolean default true,
    p_copy_questions boolean default true,
    p_copy_settings boolean default true,
    p_mode text default 'merge'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_lessons integer := 0;
    v_questions integer := 0;
    v_settings integer := 0;
    v_mode text := lower(trim(coalesce(p_mode, 'merge')));
begin
    if not public.is_approved_teacher() then
        raise exception 'Approved teacher account required';
    end if;

    if p_source_year_id is null or p_target_year_id is null then
        raise exception 'Source and target school years are required';
    end if;

    if p_source_year_id = p_target_year_id then
        raise exception 'Source and target school years must be different';
    end if;

    if v_mode not in ('merge', 'replace') then
        raise exception 'Copy mode must be merge or replace';
    end if;

    if not exists(select 1 from public.school_years where year_id = p_source_year_id) then
        raise exception 'Source school year does not exist';
    end if;

    if not exists(select 1 from public.school_years where year_id = p_target_year_id) then
        raise exception 'Target school year does not exist';
    end if;

    if p_copy_lessons then
        if v_mode = 'replace' then
            delete from public.lesson_modules where school_year_id = p_target_year_id;
        end if;

        insert into public.lesson_modules(
            week_id,
            school_year_id,
            label,
            title,
            subtitle,
            icon,
            color,
            completion_type,
            lesson_json,
            is_published,
            published_at,
            created_at,
            updated_at
        )
        select
            src.week_id,
            p_target_year_id,
            src.label,
            src.title,
            src.subtitle,
            src.icon,
            src.color,
            src.completion_type,
            case
                when jsonb_typeof(src.lesson_json) = 'object'
                    then jsonb_set(src.lesson_json, '{year_id}', to_jsonb(p_target_year_id), true)
                else src.lesson_json
            end,
            src.is_published,
            case when src.is_published then now() else null end,
            now(),
            now()
        from public.lesson_modules src
        where src.school_year_id = p_source_year_id
        on conflict (school_year_id, week_id) do nothing;

        get diagnostics v_lessons = row_count;
    end if;

    if p_copy_questions then
        if v_mode = 'replace' then
            delete from public.custom_question where school_year_id = p_target_year_id;
        end if;

        insert into public.custom_question(
            school_year_id,
            game_module,
            prompt,
            correct_ans,
            time_limit,
            image_url,
            question_set, explanation, topic, source_type, source_label, lesson_module_id,
            image_query, image_attribution, image_license, image_source, ai_generated, review_status,
            created_at
        )
        select
            p_target_year_id,
            src.game_module,
            src.prompt,
            src.correct_ans,
            src.time_limit,
            src.image_url,
            src.question_set, src.explanation, src.topic, src.source_type, src.source_label,
            (select dst.module_id from public.lesson_modules dst
             join public.lesson_modules original on original.module_id = src.lesson_module_id
             where dst.school_year_id = p_target_year_id and dst.week_id = original.week_id limit 1),
            src.image_query, src.image_attribution, src.image_license, src.image_source,
            src.ai_generated, src.review_status,
            now()
        from public.custom_question src
        where src.school_year_id = p_source_year_id
          and (
              v_mode = 'replace'
              or not exists (
                  select 1
                  from public.custom_question existing
                  where existing.school_year_id = p_target_year_id
                    and existing.game_module = src.game_module
                    and existing.prompt = src.prompt
                    and existing.correct_ans = src.correct_ans
              )
          );

        get diagnostics v_questions = row_count;
    end if;

    if p_copy_settings then
        if v_mode = 'replace' then
            delete from public.game_settings where school_year_id = p_target_year_id;
        end if;

        insert into public.game_settings(
            school_year_id,
            game_module,
            settings_json,
            updated_at
        )
        select
            p_target_year_id,
            src.game_module,
            src.settings_json,
            now()
        from public.game_settings src
        where src.school_year_id = p_source_year_id
        on conflict (school_year_id, game_module) do nothing;

        get diagnostics v_settings = row_count;
    end if;

    return jsonb_build_object(
        'source_year_id', p_source_year_id,
        'target_year_id', p_target_year_id,
        'mode', v_mode,
        'lessons_copied', v_lessons,
        'questions_copied', v_questions,
        'settings_copied', v_settings
    );
end;
$$;

revoke all on function public.copy_school_year_content(bigint,bigint,boolean,boolean,boolean,text) from public;
grant execute on function public.copy_school_year_content(bigint,bigint,boolean,boolean,boolean,text) to authenticated;
