drop function if exists public.search_reference_corpus_semantic(uuid, vector(768), integer);
update public.knowledge_base_reference_chunks set embedding = null, embedding_model = null, embedding_dimensions = null, embedded_at = null, embedding_metadata = '{}'::jsonb where embedding_model = 'gemini-embedding-001';
create or replace function public.search_reference_corpus_semantic(p_knowledge_base_id uuid, p_query_embedding vector(768), p_top_k integer default 10, p_embedding_model text default 'text-embedding-3-large', p_embedding_dimensions integer default 768)
returns table (id uuid, chunk_text text, celex text, structural_context jsonb, source_file text, paragraph_order integer, global_chunk_order integer, source_paragraph_index integer, extraction_method text, duplicate_sources jsonb, similarity double precision)
language sql stable security invoker set search_path = public, extensions as $$
  select c.id, c.chunk_text, c.celex, c.structural_context, d.source_file, c.paragraph_order, c.global_chunk_order, c.source_paragraph_index, c.extraction_method, c.duplicate_sources, (1 - (c.embedding <=> p_query_embedding))::double precision
  from public.knowledge_base_reference_chunks c join public.knowledge_base_reference_documents d on d.id = c.reference_document_id
  where c.knowledge_base_id = p_knowledge_base_id and c.language = 'mk' and c.embedding is not null and c.embedding_model = p_embedding_model and c.embedding_dimensions = p_embedding_dimensions
    and exists (select 1 from public.translation_knowledge_bases kb where kb.id = c.knowledge_base_id and kb.owner_id = (select auth.uid()))
  order by c.embedding <=> p_query_embedding limit greatest(1, least(coalesce(p_top_k, 10), 100));
$$;
revoke all on function public.search_reference_corpus_semantic(uuid, vector(768), integer, text, integer) from public;
grant execute on function public.search_reference_corpus_semantic(uuid, vector(768), integer, text, integer) to authenticated;
comment on column public.knowledge_base_reference_chunks.embedding is 'OpenAI text-embedding-3-large vector; Reference Corpus only.';
