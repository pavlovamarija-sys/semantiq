alter table public.documents
  add column source_retrieved_at timestamptz,
  add column provenance_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provenance_metadata) = 'object');

create unique index documents_project_celex_unique_idx
  on public.documents (project_id, celex_number)
  where celex_number is not null;

comment on column public.documents.provenance_metadata is
  'Source provenance only; values must describe resources actually retrieved.';
