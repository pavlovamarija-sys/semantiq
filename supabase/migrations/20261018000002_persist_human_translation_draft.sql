create or replace function public.persist_human_translation_draft(
  requested_segment_id uuid,
  requested_target_language text,
  edited_target_text text,
  qa_result jsonb default '{"status":"PASS","findings":[]}'::jsonb
)
returns table(translation_id uuid, translation_version_id uuid, saved_at timestamptz)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  saved_translation_id uuid;
  saved_version_id uuid;
  saved_created_at timestamptz;
begin
  if length(btrim(coalesce(requested_target_language, ''))) = 0
    or length(btrim(coalesce(edited_target_text, ''))) = 0 then
    raise exception 'Target language and edited target text are required';
  end if;
  if jsonb_typeof(coalesce(qa_result, '{}'::jsonb)) <> 'object' then
    raise exception 'QA result must be a JSON object';
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
    translation_id, target_text, origin, created_by, review_status
  ) values (
    saved_translation_id, edited_target_text, 'translator', (select auth.uid()), 'translator_draft'
  ) returning id, created_at into saved_version_id, saved_created_at;

  insert into public.translation_evidence(
    translation_version_id, evidence_type, source_name, metadata
  ) values (
    saved_version_id, 'deterministic_qa', 'deterministic-legal-qa', qa_result
  );

  return query select saved_translation_id, saved_version_id, saved_created_at;
end;
$$;

comment on function public.persist_human_translation_draft(uuid,text,text,jsonb) is
  'Atomically appends an unapproved human-edited draft and deterministic QA evidence. Existing translation versions are never overwritten.';

revoke all on function public.persist_human_translation_draft(uuid,text,text,jsonb) from public;
revoke all on function public.persist_human_translation_draft(uuid,text,text,jsonb) from anon;
grant execute on function public.persist_human_translation_draft(uuid,text,text,jsonb) to authenticated;
