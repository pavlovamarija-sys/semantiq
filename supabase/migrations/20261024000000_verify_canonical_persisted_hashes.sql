-- Fail closed if persisted canonical TU text does not match its worker-computed UTF-8 SHA-256.
create or replace function public.complete_canonical_snapshot(
  p_generation_id uuid, p_snapshot_id uuid, p_docx_artifact_id uuid,
  p_expected_sha256 text, p_normalized_source_sha256 text,
  p_node_count integer, p_tu_count integer, p_code_count integer
) returns public.processing_generations
language plpgsql security invoker set search_path='' as $$
declare g public.processing_generations; s public.canonical_snapshots; result public.processing_generations;
begin
  select * into g from public.processing_generations where id=p_generation_id for update;
  if g.id is null or g.generation_kind<>'canonical_extraction' or g.status<>'validating' then raise exception 'canonical completion precondition failed' using errcode='P0001'; end if;
  if not exists(select 1 from public.document_artifacts a where a.id=p_docx_artifact_id and a.project_id=g.project_id and a.document_id=g.document_id and a.document_version_id=g.document_version_id and a.artifact_type='VALIDATED_DOCX' and a.status='available' and a.sha256=p_expected_sha256) then raise exception 'exact VALIDATED_DOCX is unavailable or mismatched' using errcode='23514'; end if;
  if (select count(*) from public.canonical_nodes where canonical_snapshot_id=p_snapshot_id)<>p_node_count or (select count(*) from public.canonical_translation_units where canonical_snapshot_id=p_snapshot_id)<>p_tu_count or (select count(*) from public.canonical_inline_codes where canonical_snapshot_id=p_snapshot_id)<>p_code_count then raise exception 'canonical child counts do not match finalization metrics' using errcode='23514'; end if;
  if exists(select 1 from public.canonical_translation_units where canonical_snapshot_id=p_snapshot_id and encode(extensions.digest(convert_to(source_text,'UTF8'),'sha256'),'hex')<>source_hash) then raise exception 'persisted canonical source hash mismatch' using errcode='23514'; end if;
  update public.canonical_snapshots set status='available',available_at=now(),validated_docx_sha256=p_expected_sha256,normalized_source_sha256=p_normalized_source_sha256,node_count=p_node_count,translation_unit_count=p_tu_count,inline_code_count=p_code_count where id=p_snapshot_id and processing_generation_id=g.id and validated_docx_artifact_id=p_docx_artifact_id and status='building' returning * into s;
  if s.id is null then raise exception 'canonical snapshot finalization precondition failed' using errcode='P0001'; end if;
  update public.processing_generations set status='completed',validation_status='PASS',source_coverage_status='PASS',ordered_token_status='PASS',normalized_token_count=(select coalesce(sum(array_length(regexp_split_to_array(btrim(source_text),E'\\s+'),1)),0)::integer from public.canonical_translation_units where canonical_snapshot_id=p_snapshot_id and btrim(source_text)<>''),completed_at=now() where id=g.id and status='validating' returning * into result;
  return result;
end; $$;
