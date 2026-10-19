alter table public.translation_versions
  add column if not exists approved_by uuid references auth.users(id) on delete restrict,
  add column if not exists approved_at timestamptz;

alter table public.approved_translation_memory_units
  add column if not exists originating_translation_version_id uuid references public.translation_versions(id) on delete restrict,
  add column if not exists approved_by uuid references auth.users(id) on delete restrict,
  add column if not exists approved_at timestamptz;

create unique index if not exists approved_tm_human_version_identity_idx
  on public.approved_translation_memory_units(originating_translation_version_id)
  where source_kind = 'human_approved';

create or replace function public.approve_translator_draft(requested_translation_version_id uuid)
returns table(
  translation_id uuid,
  translation_version_id uuid,
  approved_tm_unit_id uuid,
  approved_at timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  candidate record;
  qa_status text;
  saved_tm_id uuid;
  approval_time timestamptz := clock_timestamp();
begin
  select
    tv.id as version_id, tv.translation_id, tv.target_text, tv.origin, tv.review_status,
    t.target_language, s.id as segment_id, s.source_text, s.segment_index, s.segment_type,
    s.article_number, s.paragraph_number, s.point_number, dv.id as document_version_id,
    d.id as document_id, d.title as document_title, d.source_filename, d.celex_number,
    p.id as project_id, p.source_language, p.owner_id
  into candidate
  from public.translation_versions tv
  join public.translations t on t.id = tv.translation_id
  join public.document_segments s on s.id = t.segment_id
  join public.document_versions dv on dv.id = s.document_version_id
  join public.documents d on d.id = dv.document_id
  join public.projects p on p.id = d.project_id
  where tv.id = requested_translation_version_id;

  if candidate.version_id is null or candidate.owner_id is distinct from (select auth.uid()) then
    raise exception 'Translation version is inaccessible';
  end if;
  if candidate.origin <> 'translator' or candidate.review_status <> 'translator_draft' then
    raise exception 'Only an explicit translator_draft version may be approved';
  end if;
  if exists (
    select 1 from public.approved_translation_memory_units tm
    where tm.originating_translation_version_id = candidate.version_id
  ) then
    raise exception 'This translation version has already been approved';
  end if;

  select e.metadata->>'status' into qa_status
  from public.translation_evidence e
  where e.translation_version_id = candidate.version_id and e.evidence_type = 'deterministic_qa'
  order by e.created_at desc, e.id desc limit 1;
  if qa_status is null or qa_status not in ('PASS', 'WARNING') then
    raise exception 'Deterministic QA must pass or contain warnings only before approval';
  end if;

  update public.translation_versions
  set review_status = 'approved', approved_by = (select auth.uid()), approved_at = approval_time
  where id = candidate.version_id and origin = 'translator' and review_status = 'translator_draft';
  if not found then raise exception 'Translation version approval state changed concurrently'; end if;

  update public.translations set status = 'approved' where id = candidate.translation_id;

  insert into public.approved_translation_memory_units(
    knowledge_base_id, originating_project_id, source_language, target_language,
    source_text, target_text, celex, source_document, provenance, original_tmx_tu_id,
    source_kind, alignment_confidence, trust_status, audit_status,
    alignment_audit_status, alignment_audit_reasons, alignment_audit_evidence, alignment_audited_at,
    originating_translation_version_id, approved_by, approved_at
  ) values (
    null, candidate.project_id, candidate.source_language, candidate.target_language,
    candidate.source_text, candidate.target_text, candidate.celex_number,
    coalesce(nullif(btrim(candidate.source_filename), ''), candidate.document_title),
    jsonb_build_object(
      'origin', 'human_approved_translation',
      'project_id', candidate.project_id,
      'document_id', candidate.document_id,
      'document_version_id', candidate.document_version_id,
      'segment_id', candidate.segment_id,
      'segment_index', candidate.segment_index,
      'segment_type', candidate.segment_type,
      'article_number', candidate.article_number,
      'paragraph_number', candidate.paragraph_number,
      'point_number', candidate.point_number,
      'translation_id', candidate.translation_id,
      'translation_version_id', candidate.version_id,
      'approver_id', (select auth.uid()),
      'approved_at', approval_time
    ),
    null, 'human_approved', 1.0000, 'approved', 'valid',
    'alignment_valid', '[]'::jsonb,
    jsonb_build_object('basis', 'explicit_human_approval', 'translation_version_id', candidate.version_id),
    approval_time, candidate.version_id, (select auth.uid()), approval_time
  ) returning id into saved_tm_id;

  insert into public.translation_evidence(
    translation_version_id, evidence_type, source_name, source_reference, metadata
  ) values (
    candidate.version_id, 'human_approval', 'Translator workspace', saved_tm_id::text,
    jsonb_build_object('approver_id', (select auth.uid()), 'approved_at', approval_time, 'approved_tm_unit_id', saved_tm_id)
  );

  return query select candidate.translation_id, candidate.version_id, saved_tm_id, approval_time;
end;
$$;

comment on function public.approve_translator_draft(uuid) is
  'Atomically approves one explicit human translator draft and creates one project-provenanced human-approved TM unit. AI versions and deterministic QA errors are rejected.';

revoke all on function public.approve_translator_draft(uuid) from public;
revoke all on function public.approve_translator_draft(uuid) from anon;
grant execute on function public.approve_translator_draft(uuid) to authenticated;
