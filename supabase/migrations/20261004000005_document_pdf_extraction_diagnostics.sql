alter table public.document_versions
  add column if not exists extraction_diagnostics jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'document_versions_extraction_diagnostics_object'
      and conrelid = 'public.document_versions'::regclass
  ) then
    alter table public.document_versions
      add constraint document_versions_extraction_diagnostics_object
      check (extraction_diagnostics is null or jsonb_typeof(extraction_diagnostics) = 'object');
  end if;
end
$$;

comment on column public.document_versions.extraction_diagnostics is
  'Source-file extraction diagnostics returned by the canonical document worker.';
