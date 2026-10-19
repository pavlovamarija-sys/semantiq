-- Phase 6C.7: atomic finalization for deterministic MK1 DOCX-only corrections.
create function public.complete_mk1_docx_correction(
  p_generation_id uuid,p_source_recovery_generation_id uuid,p_source_run_id uuid,
  p_validated_docx_artifact_id uuid,p_superseded_docx_artifact_id uuid,
  p_corrected_docx_artifact_id uuid,p_expected_sha256 text,p_expected_byte_size bigint
) returns public.processing_generations
language plpgsql security invoker set search_path='' as $$
declare g public.processing_generations;r public.canonical_mk1_runs;result public.processing_generations;
begin
 select * into g from public.processing_generations where id=p_generation_id for update;
 select * into r from public.canonical_mk1_runs where id=p_source_run_id;
 if g.id is null or g.generation_kind<>'target_render' or g.status<>'validating'
   or r.id is null or r.processing_generation_id<>p_source_recovery_generation_id or r.status<>'available'
   or r.project_id<>g.project_id or r.document_id<>g.document_id or r.document_version_id<>g.document_version_id
   or r.mk1_docx_artifact_id<>p_superseded_docx_artifact_id then
   raise exception 'MK1 DOCX correction completion precondition failed' using errcode='P0001';
 end if;
 if g.config->>'sourceRecoveryGenerationId'<>p_source_recovery_generation_id::text
   or g.config->>'sourceRunId'<>p_source_run_id::text or g.config->>'providerCallsAllowed'<>'false' then
   raise exception 'MK1 DOCX correction configuration mismatch' using errcode='23514';
 end if;
 if (select count(*) from public.processing_generation_inputs where generation_id=g.id)<>2
   or not exists(select 1 from public.processing_generation_inputs i join public.document_artifacts a on a.id=i.artifact_id where i.generation_id=g.id and i.input_role='validated_docx' and i.input_ordinal=0 and a.id=p_validated_docx_artifact_id and a.artifact_type='VALIDATED_DOCX' and a.status='available' and a.project_id=g.project_id and a.sha256=i.expected_sha256)
   or not exists(select 1 from public.processing_generation_inputs i join public.document_artifacts a on a.id=i.artifact_id where i.generation_id=g.id and i.input_role='superseded_mk1_docx' and i.input_ordinal=1 and a.id=p_superseded_docx_artifact_id and a.artifact_type='TARGET_DOCX' and a.status='available' and a.project_id=g.project_id and a.processing_generation_id=p_source_recovery_generation_id and a.sha256=i.expected_sha256) then
   raise exception 'MK1 DOCX correction input lineage mismatch' using errcode='23514';
 end if;
 update public.document_artifacts set status='available',available_at=now(),failure_code=null
   where id=p_corrected_docx_artifact_id and processing_generation_id=g.id and project_id=g.project_id
     and document_id=g.document_id and document_version_id=g.document_version_id and artifact_type='TARGET_DOCX'
     and status='uploading' and sha256=p_expected_sha256 and byte_size=p_expected_byte_size;
 if not found then raise exception 'MK1 corrected DOCX artifact finalization failed' using errcode='P0001';end if;
 insert into public.artifact_relationships(project_id,parent_artifact_id,child_artifact_id,relationship_type,input_role,input_ordinal)
 values(g.project_id,p_validated_docx_artifact_id,p_corrected_docx_artifact_id,'rendered_from','validated_docx',0),
       (g.project_id,p_superseded_docx_artifact_id,p_corrected_docx_artifact_id,'supersedes','duplicate_line_break_fix',1);
 update public.processing_generations set status='completed',validation_status='PASS',source_coverage_status='PASS',ordered_token_status='PASS',completed_at=now()
   where id=g.id and status='validating' returning * into result;
 return result;
end;$$;
revoke all on function public.complete_mk1_docx_correction(uuid,uuid,uuid,uuid,uuid,uuid,text,bigint) from public;
grant execute on function public.complete_mk1_docx_correction(uuid,uuid,uuid,uuid,uuid,uuid,text,bigint) to authenticated;
