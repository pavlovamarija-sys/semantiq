-- Phase 6C.4: separate, inactive validated-DOCX serialization generation.
alter table public.processing_generations drop constraint processing_generations_generation_kind_check;
alter table public.processing_generations add constraint processing_generations_generation_kind_check check (generation_kind in (
  'source_registration','pdf_reconstruction','validated_docx_render','canonical_extraction','cat_projection',
  'mk1_injection','cat_review_import','mk2_reconciliation','target_render','qa','export_package'
));

create function public.complete_validated_docx_generation(
  p_generation_id uuid, p_model_artifact_id uuid, p_docx_artifact_id uuid,
  p_expected_sha256 text, p_expected_byte_size bigint, p_metrics jsonb
) returns public.processing_generations
language plpgsql security invoker set search_path = '' as $$
declare g public.processing_generations; docx public.document_artifacts; result public.processing_generations;
begin
  select * into g from public.processing_generations where id=p_generation_id for update;
  if g.id is null or g.generation_kind <> 'validated_docx_render' or g.status <> 'validating' then
    raise exception 'validated DOCX generation completion precondition failed' using errcode='P0001';
  end if;
  if not exists (
    select 1 from public.processing_generation_inputs i
    join public.document_artifacts m on m.id=i.artifact_id
    where i.generation_id=g.id and i.project_id=g.project_id and i.artifact_id=p_model_artifact_id
      and i.input_role='reconstruction_model' and i.input_ordinal=0
      and m.artifact_type='RECONSTRUCTION_MODEL' and m.status='available'
      and m.project_id=g.project_id and m.document_id=g.document_id and m.document_version_id=g.document_version_id
      and m.sha256=i.expected_sha256
  ) then raise exception 'verified RECONSTRUCTION_MODEL generation input is missing or mismatched' using errcode='23514'; end if;
  if not exists (
    select 1 from public.artifact_relationships r
    join public.document_artifacts s on s.id=r.parent_artifact_id
    where r.child_artifact_id=p_model_artifact_id and r.project_id=g.project_id
      and r.relationship_type='derived_from' and r.input_role='source_pdf' and r.input_ordinal=0
      and s.artifact_type='SOURCE_PDF' and s.status='available'
      and s.project_id=g.project_id and s.document_id=g.document_id and s.document_version_id=g.document_version_id
  ) then raise exception 'RECONSTRUCTION_MODEL has no available exact SOURCE_PDF lineage' using errcode='23514'; end if;
  update public.document_artifacts set status='available',available_at=now(),failure_code=null
    where id=p_docx_artifact_id and processing_generation_id=g.id and project_id=g.project_id
      and document_id=g.document_id and document_version_id=g.document_version_id
      and artifact_type='VALIDATED_DOCX' and status='uploading'
      and sha256=p_expected_sha256 and byte_size=p_expected_byte_size
    returning * into docx;
  if docx.id is null then raise exception 'validated DOCX artifact finalization precondition failed' using errcode='P0001'; end if;
  insert into public.artifact_relationships(project_id,parent_artifact_id,child_artifact_id,relationship_type,input_role,input_ordinal)
    values(g.project_id,p_model_artifact_id,docx.id,'rendered_from','reconstruction_model',0);
  update public.processing_generations set status='completed',validation_status='PASS',source_coverage_status='PASS',
    ordered_token_status='PASS',normalized_token_count=(p_metrics->>'normalizedTokens')::integer,
    physical_table_count=(p_metrics->>'physicalTables')::integer,row_count=(p_metrics->>'rows')::integer,
    cell_count=(p_metrics->>'cells')::integer,completed_at=now()
    where id=g.id and status='validating' returning * into result;
  return result;
end; $$;

revoke all on function public.complete_validated_docx_generation(uuid,uuid,uuid,text,bigint,jsonb) from public;
grant execute on function public.complete_validated_docx_generation(uuid,uuid,uuid,text,bigint,jsonb) to authenticated;
