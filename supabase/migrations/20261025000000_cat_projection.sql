-- Phase 6C.6: immutable Studio source projection bound to an exact canonical snapshot.
create table public.cat_projections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  processing_generation_id uuid not null,
  canonical_snapshot_id uuid not null,
  sdlxliff_artifact_id uuid not null,
  projection_generation integer not null check(projection_generation > 0),
  status text not null default 'building' check(status in ('building','available','failed','quarantined')),
  source_language text not null,
  target_language text not null,
  studio_project_guid text not null,
  studio_project_sha256 text not null check(studio_project_sha256 ~ '^[0-9a-f]{64}$'),
  sdlxliff_sha256 text not null check(sdlxliff_sha256 ~ '^[0-9a-f]{64}$'),
  embedded_docx_sha256 text not null check(embedded_docx_sha256 ~ '^[0-9a-f]{64}$'),
  source_units_sha256 text not null check(source_units_sha256 ~ '^[0-9a-f]{64}$'),
  canonical_tu_count integer not null check(canonical_tu_count >= 0),
  studio_unit_count integer not null check(studio_unit_count >= 0),
  mapped_unit_count integer not null check(mapped_unit_count >= 0),
  excluded_structural_unit_count integer not null check(excluded_structural_unit_count >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), available_at timestamptz,
  unique(document_version_id, projection_generation), unique(id,project_id), unique(sdlxliff_artifact_id),
  foreign key(processing_generation_id,project_id) references public.processing_generations(id,project_id) on delete restrict,
  foreign key(canonical_snapshot_id,project_id) references public.canonical_snapshots(id,project_id) on delete restrict,
  foreign key(sdlxliff_artifact_id,project_id) references public.document_artifacts(id,project_id) on delete restrict,
  check(status <> 'available' or available_at is not null)
);

create table public.cat_projection_mappings (
  cat_projection_id uuid not null, project_id uuid not null,
  canonical_tu_id text not null, canonical_ordinal integer not null check(canonical_ordinal >= 0),
  studio_trans_unit_id text not null, studio_unit_index integer not null check(studio_unit_index >= 0),
  mapping_ordinal integer not null check(mapping_ordinal >= 0), source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
  primary key(cat_projection_id,mapping_ordinal), unique(cat_projection_id,canonical_tu_id), unique(cat_projection_id,studio_trans_unit_id),
  foreign key(cat_projection_id,project_id) references public.cat_projections(id,project_id) on delete restrict
);

create table public.cat_projection_structural_units (
  cat_projection_id uuid not null, project_id uuid not null, studio_trans_unit_id text not null,
  studio_unit_index integer not null check(studio_unit_index >= 0), structural_kind text not null check(structural_kind='excluded_page_break'),
  studio_tag_id text not null,
  primary key(cat_projection_id,studio_trans_unit_id), unique(cat_projection_id,studio_unit_index),
  foreign key(cat_projection_id,project_id) references public.cat_projections(id,project_id) on delete restrict
);

create function public.cat_projection_append_only() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'CAT projection rows are immutable' using errcode='55000'; end; $$;
create function public.cat_projection_control() returns trigger language plpgsql set search_path='' as $$ begin
  if tg_op='DELETE' then raise exception 'CAT projection rows are immutable' using errcode='55000'; end if;
  if old.status<>'building' or new.status not in ('available','failed','quarantined') then raise exception 'invalid CAT projection transition' using errcode='23514'; end if;
  if (to_jsonb(new)-array['status','available_at']) is distinct from (to_jsonb(old)-array['status','available_at']) then raise exception 'CAT projection identity is immutable' using errcode='55000'; end if;
  return new;
end; $$;
create trigger cat_projection_immutable before update or delete on public.cat_projections for each row execute function public.cat_projection_control();
create trigger cat_projection_mappings_immutable before update or delete on public.cat_projection_mappings for each row execute function public.cat_projection_append_only();
create trigger cat_projection_structural_immutable before update or delete on public.cat_projection_structural_units for each row execute function public.cat_projection_append_only();

create function public.complete_cat_projection(p_generation_id uuid,p_projection_id uuid,p_artifact_id uuid,p_expected_sha256 text,p_expected_size bigint) returns public.processing_generations language plpgsql security invoker set search_path='' as $$
declare g public.processing_generations; p public.cat_projections; result public.processing_generations;
begin
  select * into g from public.processing_generations where id=p_generation_id for update;
  select * into p from public.cat_projections where id=p_projection_id for update;
  if g.id is null or g.generation_kind<>'cat_projection' or g.status<>'validating' or p.id is null or p.status<>'building' or p.processing_generation_id<>g.id then raise exception 'CAT completion precondition failed' using errcode='P0001'; end if;
  if not exists(select 1 from public.document_artifacts a where a.id=p_artifact_id and a.project_id=g.project_id and a.document_id=g.document_id and a.document_version_id=g.document_version_id and a.artifact_type='STUDIO_SDLXLIFF_SOURCE' and a.status='uploading' and a.sha256=p_expected_sha256 and a.byte_size=p_expected_size) then raise exception 'CAT artifact identity mismatch' using errcode='23514'; end if;
  if (select count(*) from public.cat_projection_mappings m where m.cat_projection_id=p.id)<>p.mapped_unit_count or (select count(*) from public.cat_projection_structural_units s where s.cat_projection_id=p.id)<>p.excluded_structural_unit_count then raise exception 'CAT projection child count mismatch' using errcode='23514'; end if;
  if p.mapped_unit_count<>p.canonical_tu_count or p.studio_unit_count<>p.mapped_unit_count+p.excluded_structural_unit_count then raise exception 'CAT projection coverage mismatch' using errcode='23514'; end if;
  if exists(select 1 from public.cat_projection_mappings m join public.canonical_translation_units t on t.canonical_snapshot_id=p.canonical_snapshot_id and t.id=m.canonical_tu_id where m.cat_projection_id=p.id and (m.canonical_ordinal<>t.ordinal or m.source_sha256<>t.source_hash)) then raise exception 'CAT canonical mapping mismatch' using errcode='23514'; end if;
  update public.document_artifacts set status='available',available_at=now() where id=p_artifact_id and status='uploading';
  update public.cat_projections set status='available',available_at=now() where id=p.id and status='building';
  insert into public.artifact_relationships(project_id,parent_artifact_id,child_artifact_id,relationship_type,input_role,input_ordinal) values(g.project_id,(select validated_docx_artifact_id from public.canonical_snapshots where id=p.canonical_snapshot_id),p_artifact_id,'projected_from','validated_docx',0);
  update public.processing_generations set status='completed',validation_status='PASS',source_coverage_status='PASS',ordered_token_status='PASS',completed_at=now() where id=g.id and status='validating' returning * into result;
  return result;
end; $$;
revoke all on function public.complete_cat_projection(uuid,uuid,uuid,text,bigint) from public; grant execute on function public.complete_cat_projection(uuid,uuid,uuid,text,bigint) to authenticated;

alter table public.cat_projections enable row level security; alter table public.cat_projection_mappings enable row level security; alter table public.cat_projection_structural_units enable row level security;
create policy cat_projections_owned on public.cat_projections for all to authenticated using(exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid()))) with check(exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())) and created_by=(select auth.uid()));
create policy cat_mappings_owned on public.cat_projection_mappings for all to authenticated using(exists(select 1 from public.cat_projections c join public.projects p on p.id=c.project_id where c.id=cat_projection_id and p.owner_id=(select auth.uid()))) with check(exists(select 1 from public.cat_projections c join public.projects p on p.id=c.project_id where c.id=cat_projection_id and p.owner_id=(select auth.uid())));
create policy cat_structural_owned on public.cat_projection_structural_units for all to authenticated using(exists(select 1 from public.cat_projections c join public.projects p on p.id=c.project_id where c.id=cat_projection_id and p.owner_id=(select auth.uid()))) with check(exists(select 1 from public.cat_projections c join public.projects p on p.id=c.project_id where c.id=cat_projection_id and p.owner_id=(select auth.uid())));
