-- SikLab Lesson Builder: teacher-uploaded, intentionally public classroom PDFs.
-- Review permission/copyright before attaching. Do not place personal/student data here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lesson-pdfs', 'lesson-pdfs', true, 12582912, array['application/pdf']::text[])
on conflict (id) do update
set public = true, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can view SikLab lesson PDFs" on storage.objects;
create policy "public can view SikLab lesson PDFs"
    on storage.objects for select to public
    using (bucket_id = 'lesson-pdfs');

drop policy if exists "authorized teachers can upload lesson PDFs" on storage.objects;
create policy "authorized teachers can upload lesson PDFs"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'lesson-pdfs' and public.is_approved_teacher());

drop policy if exists "authorized teachers can update lesson PDFs" on storage.objects;
create policy "authorized teachers can update lesson PDFs"
    on storage.objects for update to authenticated
    using (bucket_id = 'lesson-pdfs' and public.is_approved_teacher())
    with check (bucket_id = 'lesson-pdfs' and public.is_approved_teacher());

-- Deliberately do not automatically delete PDF files on lesson deletion:
-- copied school years can reference the same URL.
