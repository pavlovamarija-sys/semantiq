create table public.knowledge_base_reference_documents (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null references public.translation_knowledge_bases(id) on delete restrict,
  celex text not null check (length(btrim(celex)) > 0),
  source_file text not null check (length(btrim(source_file)) > 0),
  source_format text not null check (source_format in ('doc', 'docx')),
  language text not null check (length(btrim(language)) between 2 and 10),
  extracted_characters integer not null check (extracted_characters >= 0),
  extraction_method text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (knowledge_base_id, celex, source_file)
);

create table public.knowledge_base_reference_chunks (
  id uuid primary key default gen_random_uuid(),
  reference_document_id uuid not null references public.knowledge_base_reference_documents(id) on delete cascade,
  knowledge_base_id uuid not null references public.translation_knowledge_bases(id) on delete restrict,
  stable_source_chunk_id text not null check (length(btrim(stable_source_chunk_id)) > 0),
  celex text not null check (length(btrim(celex)) > 0),
  language text not null check (length(btrim(language)) between 2 and 10),
  chunk_text text not null check (length(btrim(chunk_text)) > 0),
  normalized_text text not null check (length(btrim(normalized_text)) > 0),
  characters integer not null check (characters > 0),
  global_chunk_order integer not null check (global_chunk_order > 0),
  paragraph_order integer not null check (paragraph_order > 0),
  source_paragraph_index integer not null check (source_paragraph_index > 0),
  structural_context jsonb not null default '{}'::jsonb,
  source_format text not null check (source_format in ('doc', 'docx')),
  extraction_method text not null,
  duplicate_sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (knowledge_base_id, stable_source_chunk_id),
  unique (reference_document_id, global_chunk_order)
);

create index knowledge_base_reference_documents_lookup_idx
  on public.knowledge_base_reference_documents(knowledge_base_id, celex);
create index knowledge_base_reference_chunks_lookup_idx
  on public.knowledge_base_reference_chunks(knowledge_base_id, celex, global_chunk_order);
create index knowledge_base_reference_chunks_document_idx
  on public.knowledge_base_reference_chunks(reference_document_id, paragraph_order);

alter table public.knowledge_base_reference_documents enable row level security;
alter table public.knowledge_base_reference_chunks enable row level security;

create policy knowledge_base_reference_documents_owned on public.knowledge_base_reference_documents
  for all to authenticated
  using (exists (select 1 from public.translation_knowledge_bases kb where kb.id = knowledge_base_id and kb.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.translation_knowledge_bases kb where kb.id = knowledge_base_id and kb.owner_id = (select auth.uid())));

create policy knowledge_base_reference_chunks_owned on public.knowledge_base_reference_chunks
  for all to authenticated
  using (exists (select 1 from public.translation_knowledge_bases kb where kb.id = knowledge_base_id and kb.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.translation_knowledge_bases kb where kb.id = knowledge_base_id and kb.owner_id = (select auth.uid())));

comment on table public.knowledge_base_reference_documents is 'Owner-scoped MK2 contextual reference corpus documents; distinct from approved translation memory.';
comment on table public.knowledge_base_reference_chunks is 'Owner-scoped contextual corpus chunks with stable source provenance; embeddings are intentionally absent.';
