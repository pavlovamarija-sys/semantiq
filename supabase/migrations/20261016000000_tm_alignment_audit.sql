alter table public.approved_translation_memory_units
  add column if not exists alignment_audit_status text
    check (alignment_audit_status in ('alignment_valid','alignment_corrupt','alignment_uncertain')),
  add column if not exists alignment_audit_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(alignment_audit_reasons)='array'),
  add column if not exists alignment_audit_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(alignment_audit_evidence)='object'),
  add column if not exists alignment_audited_at timestamptz;

create index if not exists approved_tm_alignment_retrievable_idx on public.approved_translation_memory_units
  (knowledge_base_id,source_language,target_language,source_text_hash)
  where trust_status='approved' and source_kind='legacy_import' and audit_status='valid' and alignment_audit_status='alignment_valid';

create or replace function public.search_approved_legacy_tm_fuzzy(requested_knowledge_base_id uuid,requested_source_language text,requested_target_language text,requested_source_text text,minimum_similarity real default 0.70,result_limit integer default 5)
returns table(source_text text,target_text text,celex text,provenance jsonb,source_kind text,alignment_confidence numeric,original_tmx_tu_id text,similarity real)
language sql stable security invoker set search_path=public,pg_catalog as $$
select tm.source_text,tm.target_text,tm.celex,tm.provenance,tm.source_kind,tm.alignment_confidence,tm.original_tmx_tu_id,similarity(tm.source_text_normalized,btrim(regexp_replace(requested_source_text,'[[:space:]]+',' ','g'))) from public.approved_translation_memory_units tm
where tm.knowledge_base_id=requested_knowledge_base_id and tm.source_language=requested_source_language and tm.target_language=requested_target_language and tm.source_kind='legacy_import' and tm.trust_status='approved' and tm.audit_status='valid' and tm.alignment_audit_status='alignment_valid' and similarity(tm.source_text_normalized,btrim(regexp_replace(requested_source_text,'[[:space:]]+',' ','g')))>=least(greatest(minimum_similarity,0),1)
order by similarity desc,tm.id limit least(greatest(result_limit,0),5) $$;

create or replace function public.search_approved_tm_semantic(requested_knowledge_base_id uuid,requested_source_language text,requested_target_language text,requested_query_embedding vector(768),result_limit integer default 10,requested_embedding_model text default 'text-embedding-3-large',requested_embedding_dimensions integer default 768)
returns table(id uuid,source_text text,target_text text,celex text,provenance jsonb,source_kind text,alignment_confidence numeric,original_tmx_tu_id text,similarity double precision)
language sql stable security invoker set search_path=public,extensions as $$
select tm.id,tm.source_text,tm.target_text,tm.celex,tm.provenance,tm.source_kind,tm.alignment_confidence,tm.original_tmx_tu_id,(1-(tm.source_embedding<=>requested_query_embedding))::double precision from public.approved_translation_memory_units tm
where tm.knowledge_base_id=requested_knowledge_base_id and tm.source_language=requested_source_language and tm.target_language=requested_target_language and tm.source_kind='legacy_import' and tm.trust_status='approved' and tm.audit_status='valid' and tm.alignment_audit_status='alignment_valid' and tm.source_embedding is not null and tm.source_embedding_model=requested_embedding_model and tm.source_embedding_dimensions=requested_embedding_dimensions and exists(select 1 from public.translation_knowledge_bases kb where kb.id=tm.knowledge_base_id and kb.owner_id=(select auth.uid()))
order by tm.source_embedding<=>requested_query_embedding,tm.id limit least(greatest(coalesce(result_limit,10),1),100) $$;
