alter table public.documents
  add column derived_from_document_id uuid references public.documents(id) on delete restrict,
  add column derivation_type text check (derivation_type is null or derivation_type = 'pdf_to_docx'),
  add column transformation_status text check (transformation_status is null or transformation_status in ('processing', 'ready', 'failed')),
  add column transformation_error text,
  add column transformation_started_at timestamptz,
  add column transformation_completed_at timestamptz;

alter table public.documents add constraint documents_derivation_consistent check (
  (derived_from_document_id is null and derivation_type is null and transformation_status is null)
  or (derived_from_document_id is not null and derivation_type = 'pdf_to_docx' and transformation_status is not null)
);

create unique index documents_one_derivation_per_source_idx
  on public.documents(derived_from_document_id, derivation_type)
  where derived_from_document_id is not null;

create index documents_derived_from_document_id_idx
  on public.documents(derived_from_document_id)
  where derived_from_document_id is not null;

alter table public.document_versions
  add column derived_from_version_id uuid references public.document_versions(id) on delete restrict;

comment on column public.documents.derived_from_document_id is
  'Immutable source document provenance for a separately stored working document.';
comment on column public.document_versions.derived_from_version_id is
  'Exact immutable source version from which this derived version was generated.';

create function public.validate_document_derivation() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_project_id uuid;
  source_document_type text;
begin
  if new.derived_from_document_id is null then
    return new;
  end if;
  if new.derived_from_document_id = new.id then
    raise exception 'A document cannot be derived from itself';
  end if;
  select d.project_id, d.document_type into source_project_id, source_document_type
  from public.documents d where d.id = new.derived_from_document_id;
  if source_project_id is null or source_project_id <> new.project_id or lower(coalesce(source_document_type, '')) <> 'pdf' then
    raise exception 'A working document must reference a PDF in the same project';
  end if;
  return new;
end;
$$;

create trigger documents_validate_derivation
  before insert or update of derived_from_document_id, project_id on public.documents
  for each row execute function public.validate_document_derivation();

-- Include working documents in the existing owned tree deletion. SECURITY
-- INVOKER keeps all project/document RLS checks in force.
create or replace function public.delete_owned_document_tree(
  requested_project_id uuid,
  requested_document_id uuid
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owned_document_exists boolean;
  affected_document_ids uuid[];
begin
  select exists (
    select 1 from public.documents d join public.projects p on p.id = d.project_id
    where d.id = requested_document_id and d.project_id = requested_project_id
      and p.owner_id = (select auth.uid())
  ) into owned_document_exists;
  if not owned_document_exists then return false; end if;

  select array_agg(d.id) into affected_document_ids from public.documents d
  where d.id = requested_document_id
     or d.parent_document_id = requested_document_id
     or d.derived_from_document_id = requested_document_id
     or d.derived_from_document_id in (select id from public.documents where parent_document_id = requested_document_id);

  delete from public.translation_evidence e where e.translation_version_id in (
    select tv.id from public.translation_versions tv join public.translations t on t.id = tv.translation_id
    join public.document_segments s on s.id = t.segment_id join public.document_versions dv on dv.id = s.document_version_id
    where dv.document_id = any(affected_document_ids));
  delete from public.translation_versions tv where tv.translation_id in (
    select t.id from public.translations t join public.document_segments s on s.id = t.segment_id
    join public.document_versions dv on dv.id = s.document_version_id where dv.document_id = any(affected_document_ids));
  delete from public.translations t where t.segment_id in (
    select s.id from public.document_segments s join public.document_versions dv on dv.id = s.document_version_id
    where dv.document_id = any(affected_document_ids));
  update public.document_segments s set parent_segment_id = null from public.document_versions dv
    where dv.id = s.document_version_id and dv.document_id = any(affected_document_ids);
  delete from public.document_segments s using public.document_versions dv
    where dv.id = s.document_version_id and dv.document_id = any(affected_document_ids);
  delete from public.document_versions dv where dv.document_id = any(affected_document_ids);
  delete from public.documents where derived_from_document_id = requested_document_id
    or derived_from_document_id in (select id from public.documents where parent_document_id = requested_document_id);
  delete from public.documents where parent_document_id = requested_document_id;
  delete from public.documents where id = requested_document_id and project_id = requested_project_id;
  return found;
end;
$$;

comment on function public.delete_owned_document_tree(uuid, uuid) is
  'Deletes an owned document and its corrigenda/working documents in one RLS-preserving transaction.';
