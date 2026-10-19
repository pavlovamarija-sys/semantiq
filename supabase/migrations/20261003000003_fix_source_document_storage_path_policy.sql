-- The object name must be qualified inside the projects subquery. Without the
-- qualification PostgreSQL binds `name` to projects.name, so the project-id
-- path segment never matches and every upload is rejected by Storage RLS.
drop policy if exists source_documents_select_owned on storage.objects;
drop policy if exists source_documents_insert_owned on storage.objects;
drop policy if exists source_documents_delete_owned on storage.objects;

create policy source_documents_select_owned on storage.objects for select to authenticated
  using (
    bucket_id = 'source-documents'
    and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and p.owner_id = (select auth.uid())
    )
  );

create policy source_documents_insert_owned on storage.objects for insert to authenticated
  with check (
    bucket_id = 'source-documents'
    and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and p.owner_id = (select auth.uid())
    )
  );

create policy source_documents_delete_owned on storage.objects for delete to authenticated
  using (
    bucket_id = 'source-documents'
    and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and p.owner_id = (select auth.uid())
    )
  );

-- The bucket remains private and there is deliberately no UPDATE policy.
