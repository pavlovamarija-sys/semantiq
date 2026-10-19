alter table public.approved_translation_memory_units
  add column if not exists source_embedding vector(768),
  add column if not exists source_embedding_model text,
  add column if not exists source_embedding_dimensions integer,
  add column if not exists source_embedded_at timestamptz,
  add column if not exists source_embedding_metadata jsonb not null default '{}'::jsonb;

create index if not exists approved_tm_source_embedding_hnsw_idx
  on public.approved_translation_memory_units using hnsw (source_embedding vector_cosine_ops)
  where source_embedding is not null and audit_status = 'valid' and trust_status = 'approved';

create or replace function public.search_approved_tm_semantic(
  requested_knowledge_base_id uuid, requested_source_language text, requested_target_language text,
  requested_query_embedding vector(768), result_limit integer default 10,
  requested_embedding_model text default 'text-embedding-3-large', requested_embedding_dimensions integer default 768
) returns table (id uuid, source_text text, target_text text, celex text, provenance jsonb, source_kind text, alignment_confidence numeric, original_tmx_tu_id text, similarity double precision)
language sql stable security invoker set search_path = public, extensions as $$
  select tm.id, tm.source_text, tm.target_text, tm.celex, tm.provenance, tm.source_kind, tm.alignment_confidence, tm.original_tmx_tu_id,
    (1 - (tm.source_embedding <=> requested_query_embedding))::double precision
  from public.approved_translation_memory_units tm
  where tm.knowledge_base_id = requested_knowledge_base_id and tm.source_language = requested_source_language and tm.target_language = requested_target_language
    and tm.source_kind = 'legacy_import' and tm.trust_status = 'approved' and tm.audit_status = 'valid'
    and tm.source_embedding is not null and tm.source_embedding_model = requested_embedding_model and tm.source_embedding_dimensions = requested_embedding_dimensions
    and exists (select 1 from public.translation_knowledge_bases kb where kb.id = tm.knowledge_base_id and kb.owner_id = (select auth.uid()))
  order by tm.source_embedding <=> requested_query_embedding, tm.id limit least(greatest(coalesce(result_limit, 10), 1), 100);
$$;
revoke all on function public.search_approved_tm_semantic(uuid,text,text,vector(768),integer,text,integer) from public;
grant execute on function public.search_approved_tm_semantic(uuid,text,text,vector(768),integer,text,integer) to authenticated;
