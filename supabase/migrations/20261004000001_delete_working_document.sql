-- Delete exactly one owned PDF-to-DOCX working document. The parent PDF and
-- its corrigenda are deliberately outside this function's deletion set.
create function public.delete_owned_working_document(
  requested_project_id uuid,
  requested_document_id uuid
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owned_working_document_exists boolean;
begin
  select exists (
    select 1
    from public.documents d
    join public.projects p on p.id = d.project_id
    where d.id = requested_document_id
      and d.project_id = requested_project_id
      and d.derived_from_document_id is not null
      and d.derivation_type = 'pdf_to_docx'
      and d.transformation_status in ('ready', 'failed')
      and p.owner_id = (select auth.uid())
  ) into owned_working_document_exists;

  if not owned_working_document_exists then
    return false;
  end if;

  delete from public.translation_evidence e
  where e.translation_version_id in (
    select tv.id
    from public.translation_versions tv
    join public.translations t on t.id = tv.translation_id
    join public.document_segments s on s.id = t.segment_id
    join public.document_versions dv on dv.id = s.document_version_id
    where dv.document_id = requested_document_id
  );

  delete from public.translation_versions tv
  where tv.translation_id in (
    select t.id
    from public.translations t
    join public.document_segments s on s.id = t.segment_id
    join public.document_versions dv on dv.id = s.document_version_id
    where dv.document_id = requested_document_id
  );

  delete from public.translations t
  where t.segment_id in (
    select s.id
    from public.document_segments s
    join public.document_versions dv on dv.id = s.document_version_id
    where dv.document_id = requested_document_id
  );

  update public.document_segments s
  set parent_segment_id = null
  from public.document_versions dv
  where dv.id = s.document_version_id
    and dv.document_id = requested_document_id;

  delete from public.document_segments s
  using public.document_versions dv
  where dv.id = s.document_version_id
    and dv.document_id = requested_document_id;

  delete from public.document_versions
  where document_id = requested_document_id;

  delete from public.documents
  where id = requested_document_id
    and project_id = requested_project_id
    and derived_from_document_id is not null
    and derivation_type = 'pdf_to_docx'
    and transformation_status in ('ready', 'failed');

  return found;
end;
$$;

comment on function public.delete_owned_working_document(uuid, uuid) is
  'Deletes exactly one owned ready/failed PDF-to-DOCX working document while preserving its source PDF and corrigenda. RLS remains enforced.';
