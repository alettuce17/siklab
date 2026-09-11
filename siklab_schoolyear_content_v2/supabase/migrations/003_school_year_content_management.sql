-- =========================================================
-- SIKLAB SCHOOL-YEAR CONTENT MANAGEMENT + STUDENT PORTAL
-- Run AFTER 001_siklab_complete.sql and 002_teacher_authorization_and_integrity.sql
-- =========================================================

-- ---------------------------------------------------------
-- 1) Make teacher-created curriculum content school-year scoped.
-- ---------------------------------------------------------
alter table public.custom_question
    add column if not exists school_year_id bigint references public.school_years(year_id) on delete cascade;

alter table public.game_settings
    add column if not exists school_year_id bigint references public.school_years(year_id) on delete cascade;

alter table public.lesson_modules
    add column if not exists is_published boolean not null default true;

alter table public.lesson_modules
    add column if not exists published_at timestamptz;

-- Match sessions can optionally point to the year in which they were played.
alter table public.game_session
    add column if not exists school_year_id bigint references public.school_years(year_id) on delete set null;

-- Backfill old global questions/settings into the active (or oldest) year.
do $$
declare
    v_year_id bigint;
    v_has_legacy boolean;
begin
    select year_id into v_year_id
    from public.school_years
    order by is_active desc, year_id asc
    limit 1;

    select exists(select 1 from public.custom_question where school_year_id is null)
        or exists(select 1 from public.game_settings where school_year_id is null)
    into v_has_legacy;

    if v_has_legacy and v_year_id is null then
        insert into public.school_years(label, is_active)
        values ('SY Legacy', true)
        returning year_id into v_year_id;
    end if;

    if v_year_id is not null then
        update public.custom_question
        set school_year_id = v_year_id
        where school_year_id is null;

        update public.game_settings
        set school_year_id = v_year_id
        where school_year_id is null;
    end if;
end $$;

-- Existing rows are now assigned. New content must always belong to a year.
alter table public.custom_question
    alter column school_year_id set not null;

alter table public.game_settings
    alter column school_year_id set not null;

-- Replace the old global game_module uniqueness rule with one-per-year.
alter table public.game_settings
    drop constraint if exists game_settings_game_module_key;

drop index if exists public.game_settings_game_module_key;

create unique index if not exists uq_game_settings_school_year_module
    on public.game_settings(school_year_id, game_module);

create index if not exists idx_custom_question_school_year_module
    on public.custom_question(school_year_id, game_module);

create index if not exists idx_lesson_modules_school_year_published
    on public.lesson_modules(school_year_id, is_published, week_id);

-- Existing lessons are treated as published unless explicitly changed later.
update public.lesson_modules
set published_at = coalesce(published_at, updated_at, created_at, now())
where is_published = true
  and published_at is null;

-- ---------------------------------------------------------
-- 2) Content-copy engine.
--    Only curriculum content is copied:
--      * lesson_modules
--      * custom_question
--      * game_settings
--    Roster, groups, progress, and match history are NEVER copied.
-- ---------------------------------------------------------
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
            created_at
        )
        select
            p_target_year_id,
            src.game_module,
            src.prompt,
            src.correct_ans,
            src.time_limit,
            src.image_url,
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

-- Clear selected curriculum categories without touching roster/history.
create or replace function public.clear_school_year_content(
    p_year_id bigint,
    p_clear_lessons boolean default false,
    p_clear_questions boolean default false,
    p_clear_settings boolean default false
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
begin
    if not public.is_approved_teacher() then
        raise exception 'Approved teacher account required';
    end if;

    if not exists(select 1 from public.school_years where year_id = p_year_id) then
        raise exception 'School year does not exist';
    end if;

    if p_clear_lessons then
        delete from public.lesson_modules where school_year_id = p_year_id;
        get diagnostics v_lessons = row_count;
    end if;
    if p_clear_questions then
        delete from public.custom_question where school_year_id = p_year_id;
        get diagnostics v_questions = row_count;
    end if;
    if p_clear_settings then
        delete from public.game_settings where school_year_id = p_year_id;
        get diagnostics v_settings = row_count;
    end if;

    return jsonb_build_object(
        'year_id', p_year_id,
        'lessons_deleted', v_lessons,
        'questions_deleted', v_questions,
        'settings_deleted', v_settings
    );
end;
$$;

revoke all on function public.clear_school_year_content(bigint,boolean,boolean,boolean) from public;
grant execute on function public.clear_school_year_content(bigint,boolean,boolean,boolean) to authenticated;

-- ---------------------------------------------------------
-- 3) Accurate new-school-year creation.
--    Optionally copies curriculum from an existing year.
-- ---------------------------------------------------------
create or replace function public.create_school_year_with_content(
    p_label text,
    p_source_year_id bigint default null,
    p_copy_lessons boolean default false,
    p_copy_questions boolean default false,
    p_copy_settings boolean default false,
    p_set_active boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_label text := trim(coalesce(p_label, ''));
    v_year_id bigint;
begin
    if not public.is_approved_teacher() then
        raise exception 'Approved teacher account required';
    end if;

    if v_label = '' then
        raise exception 'School year label is required';
    end if;

    if exists(select 1 from public.school_years where lower(label) = lower(v_label)) then
        raise exception 'That school year already exists';
    end if;

    insert into public.school_years(label, is_active)
    values (v_label, false)
    returning year_id into v_year_id;

    if p_source_year_id is not null
       and (p_copy_lessons or p_copy_questions or p_copy_settings) then
        perform public.copy_school_year_content(
            p_source_year_id,
            v_year_id,
            p_copy_lessons,
            p_copy_questions,
            p_copy_settings,
            'merge'
        );
    end if;

    -- The very first year becomes active automatically.
    if p_set_active or not exists(
        select 1 from public.school_years where is_active = true and year_id <> v_year_id
    ) then
        update public.school_years set is_active = false where is_active = true;
        update public.school_years set is_active = true where year_id = v_year_id;
    end if;

    return v_year_id;
end;
$$;

revoke all on function public.create_school_year_with_content(text,bigint,boolean,boolean,boolean,boolean) from public;
grant execute on function public.create_school_year_with_content(text,bigint,boolean,boolean,boolean,boolean) to authenticated;

-- ---------------------------------------------------------
-- 4) School-year content summary for the teacher UI.
-- ---------------------------------------------------------
create or replace function public.get_school_year_content_summary()
returns table(
    year_id bigint,
    label varchar,
    is_active boolean,
    student_count bigint,
    lesson_count bigint,
    published_lesson_count bigint,
    question_count bigint,
    settings_count bigint,
    group_set_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
    select
        sy.year_id,
        sy.label,
        sy.is_active,
        (select count(*) from public.student s where s.school_year_id = sy.year_id),
        (select count(*) from public.lesson_modules lm where lm.school_year_id = sy.year_id),
        (select count(*) from public.lesson_modules lm where lm.school_year_id = sy.year_id and lm.is_published = true),
        (select count(*) from public.custom_question cq where cq.school_year_id = sy.year_id),
        (select count(*) from public.game_settings gs where gs.school_year_id = sy.year_id),
        (select count(*) from public.student_group_set sg where sg.school_year_id = sy.year_id)
    from public.school_years sy
    where public.is_approved_teacher()
    order by sy.year_id desc;
$$;

revoke all on function public.get_school_year_content_summary() from public;
grant execute on function public.get_school_year_content_summary() to authenticated;

-- ---------------------------------------------------------
-- 5) Student-facing curriculum API.
--    Anonymous students only receive PUBLISHED lessons from the ACTIVE year.
--    Approved teachers can preview any selected year, including drafts.
-- ---------------------------------------------------------
create or replace function public.get_student_portal_year(p_year_id bigint default null)
returns table(year_id bigint, year_label varchar, is_active boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_is_teacher boolean := false;
    v_year_id bigint;
begin
    if auth.uid() is not null then
        v_is_teacher := public.is_approved_teacher();
    end if;

    if v_is_teacher and p_year_id is not null then
        v_year_id := p_year_id;
    else
        select sy.year_id into v_year_id
        from public.school_years sy
        where sy.is_active = true
        order by sy.year_id desc
        limit 1;
    end if;

    return query
    select sy.year_id, sy.label, sy.is_active
    from public.school_years sy
    where sy.year_id = v_year_id;
end;
$$;

revoke all on function public.get_student_portal_year(bigint) from public;
grant execute on function public.get_student_portal_year(bigint) to anon, authenticated;

create or replace function public.get_student_portal_lessons(
    p_year_id bigint default null,
    p_include_drafts boolean default false
)
returns table(
    year_id bigint,
    year_label varchar,
    module_id bigint,
    week_id integer,
    label varchar,
    title varchar,
    subtitle varchar,
    icon varchar,
    color varchar,
    completion_type varchar,
    lesson_json jsonb,
    is_published boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_is_teacher boolean := false;
    v_year_id bigint;
begin
    if auth.uid() is not null then
        v_is_teacher := public.is_approved_teacher();
    end if;

    if v_is_teacher and p_year_id is not null then
        v_year_id := p_year_id;
    else
        select sy.year_id into v_year_id
        from public.school_years sy
        where sy.is_active = true
        order by sy.year_id desc
        limit 1;
    end if;

    if v_year_id is null then
        return;
    end if;

    return query
    select
        sy.year_id,
        sy.label,
        lm.module_id,
        lm.week_id,
        lm.label,
        lm.title,
        lm.subtitle,
        lm.icon,
        lm.color,
        lm.completion_type,
        lm.lesson_json,
        lm.is_published
    from public.lesson_modules lm
    join public.school_years sy on sy.year_id = lm.school_year_id
    where lm.school_year_id = v_year_id
      and (
          lm.is_published = true
          or (v_is_teacher and p_include_drafts = true)
      )
    order by lm.week_id asc;
end;
$$;

revoke all on function public.get_student_portal_lessons(bigint,boolean) from public;
grant execute on function public.get_student_portal_lessons(bigint,boolean) to anon, authenticated;

-- ---------------------------------------------------------
-- 6) Keep publish timestamp consistent.
-- ---------------------------------------------------------
create or replace function public.siklab_sync_lesson_publish_timestamp()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'INSERT' then
        if new.is_published = true and new.published_at is null then
            new.published_at := now();
        elsif new.is_published = false then
            new.published_at := null;
        end if;
        return new;
    end if;

    if new.is_published = true then
        if new.published_at is null or old.is_published is distinct from true then
            new.published_at := now();
        end if;
    else
        new.published_at := null;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_siklab_lesson_publish_timestamp on public.lesson_modules;
create trigger trg_siklab_lesson_publish_timestamp
before insert or update on public.lesson_modules
for each row execute function public.siklab_sync_lesson_publish_timestamp();

-- NOTE ABOUT COPIED IMAGES:
-- Lesson/question copies intentionally reuse the same public Storage URLs.
-- This avoids duplicating large files. Because assets may be shared by multiple
-- school years, application code must not automatically delete a previously
-- saved Storage object merely because one copied lesson/question is removed.
