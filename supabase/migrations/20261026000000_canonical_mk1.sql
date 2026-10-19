-- Phase 6C.7: immutable, unapproved MK1 translations over an exact canonical/CAT projection.
create table public.canonical_mk1_runs (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete restrict,
 document_id uuid not null references public.documents(id) on delete restrict, document_version_id uuid not null references public.document_versions(id) on delete restrict,
 processing_generation_id uuid not null, canonical_snapshot_id uuid not null, cat_projection_id uuid not null,
 status text not null default 'building' check(status in('building','available','failed')),
 source_language text not null, target_language text not null, model text not null, prompt_version text not null,
 expected_tu_count integer not null check(expected_tu_count>0), translated_tu_count integer not null default 0 check(translated_tu_count>=0),
 source_units_sha256 text not null check(source_units_sha256~'^[0-9a-f]{64}$'), target_units_sha256 text check(target_units_sha256 is null or target_units_sha256~'^[0-9a-f]{64}$'),
 mk1_sdlxliff_artifact_id uuid, mk1_docx_artifact_id uuid, created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(), available_at timestamptz,
 unique(processing_generation_id),unique(id,project_id),
 foreign key(processing_generation_id,project_id) references public.processing_generations(id,project_id) on delete restrict,
 foreign key(canonical_snapshot_id,project_id) references public.canonical_snapshots(id,project_id) on delete restrict,
 foreign key(cat_projection_id,project_id) references public.cat_projections(id,project_id) on delete restrict,
 foreign key(mk1_sdlxliff_artifact_id,project_id) references public.document_artifacts(id,project_id) on delete restrict,
 foreign key(mk1_docx_artifact_id,project_id) references public.document_artifacts(id,project_id) on delete restrict
);
create table public.canonical_mk1_batches (
 mk1_run_id uuid not null, project_id uuid not null, batch_ordinal integer not null check(batch_ordinal>=0), first_tu_ordinal integer not null, last_tu_ordinal integer not null,
 model_response_id text not null, input_tokens integer, output_tokens integer, status text not null check(status='PASS'), created_at timestamptz not null default now(),
 primary key(mk1_run_id,batch_ordinal), foreign key(mk1_run_id,project_id) references public.canonical_mk1_runs(id,project_id) on delete restrict
);
create table public.canonical_mk1_translations (
 mk1_run_id uuid not null, project_id uuid not null, canonical_tu_id text not null, ordinal integer not null check(ordinal>=0),
 source_sha256 text not null check(source_sha256~'^[0-9a-f]{64}$'), target_text text not null check(length(btrim(target_text))>0), target_sha256 text not null check(target_sha256~'^[0-9a-f]{64}$'),
 batch_ordinal integer not null, qa_status text not null check(qa_status in('PASS','WARNING')), created_at timestamptz not null default now(),
 primary key(mk1_run_id,canonical_tu_id),unique(mk1_run_id,ordinal),
 foreign key(mk1_run_id,project_id) references public.canonical_mk1_runs(id,project_id) on delete restrict
);
create function public.mk1_append_only() returns trigger language plpgsql set search_path='' as $$begin raise exception 'MK1 rows are immutable' using errcode='55000';end;$$;
create function public.mk1_run_control() returns trigger language plpgsql set search_path='' as $$begin if tg_op='DELETE' then raise exception 'MK1 rows are immutable' using errcode='55000';end if;if old.status<>'building' or new.status not in('available','failed') then raise exception 'invalid MK1 transition' using errcode='23514';end if;if (to_jsonb(new)-array['status','translated_tu_count','target_units_sha256','mk1_sdlxliff_artifact_id','mk1_docx_artifact_id','available_at']) is distinct from (to_jsonb(old)-array['status','translated_tu_count','target_units_sha256','mk1_sdlxliff_artifact_id','mk1_docx_artifact_id','available_at']) then raise exception 'MK1 identity is immutable' using errcode='55000';end if;return new;end;$$;
create trigger mk1_runs_immutable before update or delete on public.canonical_mk1_runs for each row execute function public.mk1_run_control();
create trigger mk1_batches_immutable before update or delete on public.canonical_mk1_batches for each row execute function public.mk1_append_only();
create trigger mk1_translations_immutable before update or delete on public.canonical_mk1_translations for each row execute function public.mk1_append_only();
alter table public.canonical_mk1_runs enable row level security;alter table public.canonical_mk1_batches enable row level security;alter table public.canonical_mk1_translations enable row level security;
create policy mk1_runs_owned on public.canonical_mk1_runs for all to authenticated using(exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid()))) with check(exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())) and created_by=(select auth.uid()));
create policy mk1_batches_owned on public.canonical_mk1_batches for all to authenticated using(exists(select 1 from public.canonical_mk1_runs r join public.projects p on p.id=r.project_id where r.id=mk1_run_id and p.owner_id=(select auth.uid()))) with check(exists(select 1 from public.canonical_mk1_runs r join public.projects p on p.id=r.project_id where r.id=mk1_run_id and p.owner_id=(select auth.uid())));
create policy mk1_translations_owned on public.canonical_mk1_translations for all to authenticated using(exists(select 1 from public.canonical_mk1_runs r join public.projects p on p.id=r.project_id where r.id=mk1_run_id and p.owner_id=(select auth.uid()))) with check(exists(select 1 from public.canonical_mk1_runs r join public.projects p on p.id=r.project_id where r.id=mk1_run_id and p.owner_id=(select auth.uid())));

create function public.complete_canonical_mk1(p_generation_id uuid,p_run_id uuid,p_sdlxliff_artifact_id uuid,p_sdlxliff_sha256 text,p_sdlxliff_size bigint,p_docx_artifact_id uuid,p_docx_sha256 text,p_docx_size bigint,p_target_units_sha256 text) returns public.processing_generations language plpgsql security invoker set search_path='' as $$
declare g public.processing_generations;r public.canonical_mk1_runs;result public.processing_generations;
begin
 select * into g from public.processing_generations where id=p_generation_id for update;select * into r from public.canonical_mk1_runs where id=p_run_id for update;
 if g.id is null or g.generation_kind<>'mk1_injection' or g.status<>'validating' or r.id is null or r.status<>'building' or r.processing_generation_id<>g.id then raise exception 'MK1 completion precondition failed' using errcode='P0001';end if;
 if (select count(*) from public.canonical_mk1_translations t where t.mk1_run_id=r.id)<>r.expected_tu_count or (select count(*) from public.canonical_mk1_batches b where b.mk1_run_id=r.id)=0 then raise exception 'MK1 translation coverage mismatch' using errcode='23514';end if;
 if exists(select 1 from public.canonical_mk1_translations t left join public.canonical_translation_units u on u.canonical_snapshot_id=r.canonical_snapshot_id and u.id=t.canonical_tu_id where t.mk1_run_id=r.id and (u.id is null or u.ordinal<>t.ordinal or u.source_hash<>t.source_sha256 or encode(digest(convert_to(t.target_text,'UTF8'),'sha256'),'hex')<>t.target_sha256)) then raise exception 'MK1 persisted identity or target hash mismatch' using errcode='23514';end if;
 if (select min(ordinal) from public.canonical_mk1_translations where mk1_run_id=r.id)<>0 or (select max(ordinal) from public.canonical_mk1_translations where mk1_run_id=r.id)<>r.expected_tu_count-1 then raise exception 'MK1 ordinal coverage mismatch' using errcode='23514';end if;
 if not exists(select 1 from public.document_artifacts a where a.id=p_sdlxliff_artifact_id and a.project_id=g.project_id and a.document_id=g.document_id and a.document_version_id=g.document_version_id and a.processing_generation_id=g.id and a.artifact_type='STUDIO_SDLXLIFF_MK1' and a.status='uploading' and a.sha256=p_sdlxliff_sha256 and a.byte_size=p_sdlxliff_size) or not exists(select 1 from public.document_artifacts a where a.id=p_docx_artifact_id and a.project_id=g.project_id and a.document_id=g.document_id and a.document_version_id=g.document_version_id and a.processing_generation_id=g.id and a.artifact_type='TARGET_DOCX' and a.status='uploading' and a.sha256=p_docx_sha256 and a.byte_size=p_docx_size) then raise exception 'MK1 output artifact identity mismatch' using errcode='23514';end if;
 if (select count(*) from public.processing_generation_inputs i where i.generation_id=g.id)<>2 then raise exception 'MK1 input count mismatch' using errcode='23514';end if;
 if not exists(select 1 from public.processing_generation_inputs i join public.cat_projections p on p.id=r.cat_projection_id where i.generation_id=g.id and i.artifact_id=p.sdlxliff_artifact_id and i.input_role='studio_skeleton' and i.expected_sha256=p.sdlxliff_sha256) or not exists(select 1 from public.processing_generation_inputs i join public.canonical_snapshots s on s.id=r.canonical_snapshot_id where i.generation_id=g.id and i.artifact_id=s.validated_docx_artifact_id and i.input_role='validated_docx' and i.expected_sha256=s.validated_docx_sha256) then raise exception 'MK1 immutable input lineage mismatch' using errcode='23514';end if;
 update public.document_artifacts set status='available',available_at=now() where id in(p_sdlxliff_artifact_id,p_docx_artifact_id) and status='uploading';
 update public.canonical_mk1_runs set status='available',translated_tu_count=expected_tu_count,target_units_sha256=p_target_units_sha256,mk1_sdlxliff_artifact_id=p_sdlxliff_artifact_id,mk1_docx_artifact_id=p_docx_artifact_id,available_at=now() where id=r.id;
 insert into public.artifact_relationships(project_id,parent_artifact_id,child_artifact_id,relationship_type,input_role,input_ordinal) values(g.project_id,(select sdlxliff_artifact_id from public.cat_projections where id=r.cat_projection_id),p_sdlxliff_artifact_id,'injected_from','studio_skeleton',0),(g.project_id,(select validated_docx_artifact_id from public.canonical_snapshots where id=r.canonical_snapshot_id),p_docx_artifact_id,'rendered_from','validated_docx',0);
 update public.processing_generations set status='completed',validation_status='PASS',source_coverage_status='PASS',ordered_token_status='PASS',completed_at=now() where id=g.id returning * into result;return result;
end;$$;
revoke all on function public.complete_canonical_mk1(uuid,uuid,uuid,text,bigint,uuid,text,bigint,text) from public;grant execute on function public.complete_canonical_mk1(uuid,uuid,uuid,text,bigint,uuid,text,bigint,text) to authenticated;
