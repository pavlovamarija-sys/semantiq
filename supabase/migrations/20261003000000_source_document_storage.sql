alter table public.document_versions
  add column source_storage_bucket text,
  add column source_storage_path text,
  add column source_filename text,
  add column source_mime_type text,
  add column source_file_size_bytes bigint check (source_file_size_bytes is null or source_file_size_bytes > 0);

create unique index document_versions_source_storage_object_idx
  on public.document_versions(source_storage_bucket, source_storage_path)
  where source_storage_bucket is not null and source_storage_path is not null;

create function public.prevent_source_file_metadata_changes() returns trigger
language plpgsql as $$
begin
  if new.source_storage_bucket is distinct from old.source_storage_bucket
    or new.source_storage_path is distinct from old.source_storage_path
    or new.source_filename is distinct from old.source_filename
    or new.source_mime_type is distinct from old.source_mime_type
    or new.source_file_size_bytes is distinct from old.source_file_size_bytes then
    raise exception 'Original source file metadata is immutable';
  end if;
  return new;
end;
$$;

create trigger document_versions_source_file_immutable
  before update on public.document_versions
  for each row execute function public.prevent_source_file_metadata_changes();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'source-documents',
  'source-documents',
  false,
  52428800,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

create policy source_documents_select_owned on storage.objects for select to authenticated
  using (
    bucket_id = 'source-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
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
  );

-- There is deliberately no UPDATE policy. Original source objects are immutable.
