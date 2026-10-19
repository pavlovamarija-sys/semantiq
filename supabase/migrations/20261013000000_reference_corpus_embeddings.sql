create extension if not exists vector with schema extensions;

alter table public.knowledge_base_reference_chunks
  add column if not exists embedding vector(768),
  add column if not exists embedding_model text,
  add column if not exists embedding_dimensions integer,
  add column if not exists embedded_at timestamptz,
  add column if not exists embedding_metadata jsonb not null default '{}'::jsonb;

create index if not exists knowledge_base_reference_chunks_embedding_hnsw_idx
  on public.knowledge_base_reference_chunks using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create or replace function public.search_reference_corpus_semantic(
  p_knowledge_base_id uuid,
  p_query_embedding vector(768),
  p_top_k integer default 10
)
returns table (
  id uuid, chunk_text text, celex text, structural_context jsonb,
  source_file text, paragraph_order integer, global_chunk_order integer,
  source_paragraph_index integer, extraction_method text, duplicate_sources jsonb,
  similarity double precision
)
language sql stable security invoker set search_path = public, extensions
as $$
  select c.id, c.chunk_text, c.celex, c.structural_context, d.source_file,
         c.paragraph_order, c.global_chunk_order, c.source_paragraph_index,
         c.extraction_method, c.duplicate_sources,
         (1 - (c.embedding <=> p_query_embedding))::double precision
  from public.knowledge_base_reference_chunks c
  join public.knowledge_base_reference_documents d on d.id = c.reference_document_id
  where c.knowledge_base_id = p_knowledge_base_id
    and c.language = 'mk' and c.embedding is not null
    and exists (select 1 from public.translation_knowledge_bases kb where kb.id = c.knowledge_base_id and kb.owner_id = (select auth.uid()))
  order by c.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_top_k, 10), 100));
$$;

revoke all on function public.search_reference_corpus_semantic(uuid, vector(768), integer) from public;
grant execute on function public.search_reference_corpus_semantic(uuid, vector(768), integer) to authenticated;

comment on column public.knowledge_base_reference_chunks.embedding is 'Gemini gemini-embedding-001 RETRIEVAL_DOCUMENT vector; Reference Corpus only.';
