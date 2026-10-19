alter table public.legacy_corpus_documents
  add column if not exists original_filename text not null default 'unknown',
  add column if not exists original_path text not null default 'unknown',
  add column if not exists file_extension text not null default '',
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists sha256 text,
  add column if not exists extracted_text_sha256 text,
  add column if not exists extracted_at timestamptz,
  add column if not exists immutable_copy_path text;

alter table public.legacy_corpus_documents
  add constraint legacy_corpus_documents_file_size_nonnegative
  check (file_size_bytes is null or file_size_bytes >= 0);

create unique index if not exists legacy_corpus_documents_sha256_idx
  on public.legacy_corpus_documents(sha256)
  where sha256 is not null;

comment on column public.legacy_corpus_documents.provenance is
  'Immutable source metadata: corpus root, metadata rows, original path, extraction method, and manifest evidence.';
