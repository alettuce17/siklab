-- =========================================================
-- SIKLAB SECURITY + INTEGRITY HARDENING
-- Run AFTER 001_siklab_complete.sql
-- =========================================================

-- Approved teacher registry. The first Auth user becomes approved automatically.
create table if not exists public.teacher_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    full_name text,
    is_approved boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.teacher_profiles enable row level security;

drop policy if exists "teacher can read own profile" on public.teacher_profiles;
create policy "teacher can read own profile"
    on public.teacher_profiles
    for select
    to authenticated
    using (user_id = auth.uid());

create or replace function public.handle_new_teacher_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_auto_approve boolean;
begin
    select not exists (
        select 1 from public.teacher_profiles where is_approved = true
    ) into v_auto_approve;

    insert into public.teacher_profiles(user_id, full_name, is_approved)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1), 'Teacher'),
        v_auto_approve
    )
    on conflict (user_id) do update
        set full_name = excluded.full_name,
            updated_at = now();

    return new;
end;
$$;

-- Backfill existing Auth users before installing the trigger.
insert into public.teacher_profiles(user_id, full_name, is_approved)
select
    u.id,
    coalesce(u.raw_user_meta_data ->> 'full_name', split_part(coalesce(u.email, ''), '@', 1), 'Teacher'),
    false
from auth.users u
on conflict (user_id) do nothing;

-- If nobody is approved yet, approve the oldest existing account.
update public.teacher_profiles
set is_approved = true,
    updated_at = now()
where user_id = (
    select u.id
    from auth.users u
    order by u.created_at asc
    limit 1
)
and not exists (
    select 1 from public.teacher_profiles where is_approved = true
);

drop trigger if exists on_auth_user_created_siklab on auth.users;
create trigger on_auth_user_created_siklab
after insert on auth.users
for each row execute function public.handle_new_teacher_profile();

create or replace function public.is_approved_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.teacher_profiles p
        where p.user_id = auth.uid()
          and p.is_approved = true
    );
$$;

revoke all on function public.is_approved_teacher() from public;
grant execute on function public.is_approved_teacher() to authenticated;

-- Replace broad "any authenticated user" access with approved-teacher access.
do $$
declare t text;
begin
    foreach t in array array[
        'school_years','student','custom_game_module','custom_question',
        'game_settings','lesson_modules','student_group_set','student_progress',
        'game_type','topic','game_session','question','question_option',
        'iot_device','player_score','player_response'
    ]
    loop
        execute format('drop policy if exists "teacher full access" on public.%I', t);
        execute format('drop policy if exists "approved teacher full access" on public.%I', t);
        execute format(
            'create policy "approved teacher full access" on public.%I for all to authenticated using (public.is_approved_teacher()) with check (public.is_approved_teacher())',
            t
        );
    end loop;
end $$;

drop policy if exists "authenticated users can read controller status" on public.controller_devices;
drop policy if exists "approved teachers can read controller status" on public.controller_devices;
create policy "approved teachers can read controller status"
    on public.controller_devices
    for select
    to authenticated
    using (public.is_approved_teacher());

-- Storage writes require an approved teacher. Images remain public-readable by design.
drop policy if exists "teachers can upload SikLab images" on storage.objects;
create policy "teachers can upload SikLab images"
    on storage.objects for insert to authenticated
    with check (
        bucket_id in ('question-images','lesson-images')
        and public.is_approved_teacher()
    );

drop policy if exists "teachers can update SikLab images" on storage.objects;
create policy "teachers can update SikLab images"
    on storage.objects for update to authenticated
    using (
        bucket_id in ('question-images','lesson-images')
        and public.is_approved_teacher()
    )
    with check (
        bucket_id in ('question-images','lesson-images')
        and public.is_approved_teacher()
    );

drop policy if exists "teachers can delete SikLab images" on storage.objects;
create policy "teachers can delete SikLab images"
    on storage.objects for delete to authenticated
    using (
        bucket_id in ('question-images','lesson-images')
        and public.is_approved_teacher()
    );

-- Keep exactly one school year active when one is selected.
-- First normalize existing data so the unique index can be created safely.
with active_rows as (
    select year_id,
           row_number() over (order by year_id asc) as rn
    from public.school_years
    where is_active = true
)
update public.school_years sy
set is_active = false
from active_rows a
where sy.year_id = a.year_id
  and a.rn > 1;

create unique index if not exists uq_siklab_one_active_school_year
    on public.school_years ((is_active))
    where is_active = true;

create or replace function public.set_active_school_year(p_year_id bigint)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
    if not public.is_approved_teacher() then
        raise exception 'Approved teacher account required';
    end if;

    if not exists (select 1 from public.school_years where year_id = p_year_id) then
        raise exception 'School year does not exist';
    end if;

    update public.school_years set is_active = false where is_active = true;
    update public.school_years set is_active = true where year_id = p_year_id;
end;
$$;

grant execute on function public.set_active_school_year(bigint) to authenticated;

-- Optional helper for approving another teacher from the SQL Editor:
-- update public.teacher_profiles
-- set is_approved = true, updated_at = now()
-- where user_id = (select id from auth.users where email = 'teacher@example.com');
