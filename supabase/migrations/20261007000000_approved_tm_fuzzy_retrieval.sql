-- Deterministic lexical retrieval for approved Knowledge Base TM.
create extension if not exists pg_trgm;

alter table public.approved_translation_memory_units
  add column source_text_normalized text generated always as (
    btrim(regexp_replace(source_text, '[[:space:]]+', ' ', 'g'))
  ) stored;

create index approved_tm_fuzzy_source_trgm_idx
  on public.approved_translation_memory_units using gin (source_text_normalized gin_trgm_ops)
  where trust_status = 'approved' and source_kind = 'legacy_import' and knowledge_base_id is not null;

create or replace function public.search_approved_legacy_tm_fuzzy(
  requested_knowledge_base_id uuid,
  requested_source_language text,
  requested_target_language text,
  requested_source_text text,
  minimum_similarity real default 0.70,
  result_limit integer default 5
) returns table (
  source_text text,
  target_text text,
  celex text,
  provenance jsonb,
  source_kind text,
  alignment_confidence numeric,
  original_tmx_tu_id text,
  similarity real
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select tm.source_text, tm.target_text, tm.celex, tm.provenance, tm.source_kind,
    tm.alignment_confidence, tm.original_tmx_tu_id,
    similarity(tm.source_text_normalized,
      btrim(regexp_replace(requested_source_text, '[[:space:]]+', ' ', 'g'))) as similarity
  from public.approved_translation_memory_units tm
  where tm.knowledge_base_id = requested_knowledge_base_id
    and tm.source_language = requested_source_language
    and tm.target_language = requested_target_language
    and tm.source_kind = 'legacy_import'
    and tm.trust_status = 'approved'
    and similarity(tm.source_text_normalized,
      btrim(regexp_replace(requested_source_text, '[[:space:]]+', ' ', 'g'))) >= least(greatest(minimum_similarity, 0), 1)
  order by similarity desc, tm.id
  limit least(greatest(result_limit, 0), 5)
$$;

comment on function public.search_approved_legacy_tm_fuzzy(uuid, text, text, text, real, integer) is
  'Deterministic pg_trgm retrieval over approved owner-scoped legacy TM; security invoker preserves RLS.';
