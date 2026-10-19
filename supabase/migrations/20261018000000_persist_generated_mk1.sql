alter table public.translation_versions
  add column if not exists review_status text
    check (review_status in ('ai_draft_unreviewed', 'translator_draft', 'in_review', 'approved'));

comment on column public.translation_versions.review_status is
  'Review state of this immutable version. AI generation is always stored as ai_draft_unreviewed.';

create or replace function public.persist_generated_mk1(
  requested_segment_id uuid,
  requested_target_language text,
  generated_target_text text,
  generation_model text,
  generation_prompt_version text,
  generation_token_usage jsonb default '{}'::jsonb,
  generation_latency_ms numeric default null,
  tm_evidence jsonb default '{"exactApprovedTm":[],"strongFuzzyApprovedTm":[]}'::jsonb,
  qa_result jsonb default '{"status":"PASS","findings":[]}'::jsonb
)
returns table(translation_id uuid, translation_version_id uuid, generated_at timestamptz)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  saved_translation_id uuid;
  saved_version_id uuid;
  saved_created_at timestamptz;
  evidence_item jsonb;
begin
  if length(btrim(coalesce(requested_target_language, ''))) = 0
    or length(btrim(coalesce(generated_target_text, ''))) = 0
    or length(btrim(coalesce(generation_model, ''))) = 0
    or length(btrim(coalesce(generation_prompt_version, ''))) = 0 then
    raise exception 'Segment, target text, model, prompt version and target language are required';
  end if;
  if jsonb_typeof(coalesce(generation_token_usage, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(tm_evidence, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(qa_result, '{}'::jsonb)) <> 'object' then
    raise exception 'Generation metadata, TM evidence and QA result must be JSON objects';
  end if;

  insert into public.translations(segment_id, target_language, status)
  values (requested_segment_id, requested_target_language, 'draft')
  on conflict (segment_id, target_language) do nothing;

  select t.id into saved_translation_id
  from public.translations t
  where t.segment_id = requested_segment_id and t.target_language = requested_target_language;
  if saved_translation_id is null then
    raise exception 'Translation is inaccessible or could not be created';
  end if;

  insert into public.translation_versions(
    translation_id, target_text, origin, model_provider, model_name, prompt_version, created_by, review_status
  ) values (
    saved_translation_id, generated_target_text, 'ai', 'openai', generation_model,
    generation_prompt_version, (select auth.uid()), 'ai_draft_unreviewed'
  ) returning id, created_at into saved_version_id, saved_created_at;

  insert into public.translation_evidence(
    translation_version_id, evidence_type, source_name, metadata
  ) values (
    saved_version_id, 'generation_metadata', 'OpenAI',
    jsonb_build_object('token_usage', coalesce(generation_token_usage, '{}'::jsonb), 'latency_ms', generation_latency_ms)
  ), (
    saved_version_id, 'deterministic_qa', 'deterministic-legal-qa', qa_result
  );

  for evidence_item in
    select value from jsonb_array_elements(coalesce(tm_evidence->'exactApprovedTm', '[]'::jsonb))
  loop
    insert into public.translation_evidence(
      translation_version_id, evidence_type, source_name, source_reference, source_text, target_text, metadata
    ) values (
      saved_version_id, 'exact_approved_tm', 'Approved Translation Memory',
      evidence_item->>'originalTmxTuId', null, evidence_item->>'targetText', evidence_item
    );
  end loop;

  for evidence_item in
    select value from jsonb_array_elements(coalesce(tm_evidence->'strongFuzzyApprovedTm', '[]'::jsonb))
  loop
    insert into public.translation_evidence(
      translation_version_id, evidence_type, source_name, source_reference, source_text, target_text, metadata
    ) values (
      saved_version_id, 'fuzzy_approved_tm', 'Approved Translation Memory',
      evidence_item->>'originalTmxTuId', evidence_item->>'sourceText', evidence_item->>'targetText', evidence_item
    );
  end loop;

  return query select saved_translation_id, saved_version_id, saved_created_at;
end;
$$;

comment on function public.persist_generated_mk1(uuid,text,text,text,text,jsonb,numeric,jsonb,jsonb) is
  'Atomically appends an unreviewed AI MK1 version and its generation, TM and deterministic-QA evidence. RLS ownership remains enforced by the invoker.';

grant execute on function public.persist_generated_mk1(uuid,text,text,text,text,jsonb,numeric,jsonb,jsonb) to authenticated;
