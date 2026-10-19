-- Keep source files private and bind every object operation to both the caller
-- and a project owned by that caller. Paths are:
--   <auth.uid()>/<project_id>/<document_id>/<version_id>.<extension>
update storage.buckets
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
where id = 'source-documents';

drop policy if exists source_documents_select_owned on storage.objects;
drop policy if exists source_documents_insert_owned on storage.objects;
drop policy if exists source_documents_delete_owned on storage.objects;

create policy source_documents_select_owned on storage.objects for select to authenticated
  using (
    bucket_id = 'source-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(name))[2]
        and p.owner_id = (select auth.uid())
    )
  );

create policy source_documents_insert_owned on storage.objects for insert to authenticated
  with check (
    bucket_id = 'source-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(name))[2]
        and p.owner_id = (select auth.uid())
    )
  );

create policy source_documents_delete_owned on storage.objects for delete to authenticated
  using (
    bucket_id = 'source-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(name))[2]
        and p.owner_id = (select auth.uid())
    )
  );

-- There is deliberately no UPDATE policy. Original source objects are immutable.
