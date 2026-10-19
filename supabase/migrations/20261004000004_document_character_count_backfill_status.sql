alter table public.document_versions
  add column if not exists character_count_error text;

comment on column public.document_versions.character_count_error is
  'Bounded reason why character counts could not be calculated from this version''s stored file; null when counting succeeded or has not yet been attempted.';
