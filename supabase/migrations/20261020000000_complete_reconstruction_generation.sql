-- Phase 6C.3: atomically publish one validated reconstruction model and its lineage.
create function public.complete_reconstruction_generation(
  p_generation_id uuid, p_source_artifact_id uuid, p_model_artifact_id uuid,
  p_expected_sha256 text, p_expected_byte_size bigint, p_metrics jsonb
) returns public.processing_generations
language plpgsql security invoker set search_path = '' as $$
declare g public.processing_generations; model public.document_artifacts; result public.processing_generations;
begin
  select * into g from public.processing_generations where id=p_generation_id for update;
  if g.id is null or g.generation_kind <> 'pdf_reconstruction' or g.status <> 'validating' then
    raise exception 'reconstruction generation completion precondition failed' using errcode='P0001';
  end if;
  if not exists (select 1 from public.processing_generation_inputs i join public.document_artifacts s on s.id=i.artifact_id
      where i.generation_id=g.id and i.project_id=g.project_id and i.artifact_id=p_source_artifact_id
        and i.input_role='source_pdf' and s.artifact_type='SOURCE_PDF' and s.status='available'
        and s.project_id=g.project_id and s.document_id=g.document_id and s.document_version_id=g.document_version_id
        and s.sha256=i.expected_sha256) then
    raise exception 'verified SOURCE_PDF generation input is missing or mismatched' using errcode='23514';
  end if;
  update public.document_artifacts set status='available',available_at=now(),failure_code=null
    where id=p_model_artifact_id and processing_generation_id=g.id and project_id=g.project_id
      and document_id=g.document_id and document_version_id=g.document_version_id
      and artifact_type='RECONSTRUCTION_MODEL' and status='uploading'
      and sha256=p_expected_sha256 and byte_size=p_expected_byte_size
    returning * into model;
  if model.id is null then raise exception 'model artifact finalization precondition failed' using errcode='P0001'; end if;
  insert into public.artifact_relationships(project_id,parent_artifact_id,child_artifact_id,relationship_type,input_role,input_ordinal)
    values(g.project_id,p_source_artifact_id,model.id,'derived_from','source_pdf',0);
  update public.processing_generations set status='completed',validation_status='PASS',source_coverage_status='PASS',
    ordered_token_status='PASS',page_count=(p_metrics->>'pages')::integer,block_count=(p_metrics->>'blocks')::integer,
    line_count=(p_metrics->>'lines')::integer,span_count=(p_metrics->>'spans')::integer,
    normalized_token_count=(p_metrics->>'normalizedTokens')::integer,
    physical_table_count=(p_metrics->>'physicalTables')::integer,logical_table_count=(p_metrics->>'logicalTables')::integer,
    row_count=(p_metrics->>'rows')::integer,cell_count=(p_metrics->>'cells')::integer,
    merge_count=(p_metrics->>'merge')::integer,keep_boundary_count=(p_metrics->>'keepBoundary')::integer,
    abstain_count=(p_metrics->>'abstain')::integer,completed_at=now()
    where id=g.id and status='validating' returning * into result;
  return result;
end; $$;

revoke all on function public.complete_reconstruction_generation(uuid,uuid,uuid,text,bigint,jsonb) from public;
grant execute on function public.complete_reconstruction_generation(uuid,uuid,uuid,text,bigint,jsonb) to authenticated;
