-- Phase 6C.5: immutable canonical snapshot and normalized document model.
create table public.canonical_snapshots (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  processing_generation_id uuid not null, validated_docx_artifact_id uuid not null,
  snapshot_generation integer not null check(snapshot_generation>0), status text not null default 'building' check(status in('building','available','failed','quarantined')),
  schema_version text not null, extractor_version text not null, source_language text not null check(length(btrim(source_language))>0),
  validated_docx_sha256 text not null check(validated_docx_sha256 ~ '^[0-9a-f]{64}$'), normalized_source_sha256 text not null check(normalized_source_sha256 ~ '^[0-9a-f]{64}$'),
  node_count integer not null default 0 check(node_count>=0), translation_unit_count integer not null default 0 check(translation_unit_count>=0), inline_code_count integer not null default 0 check(inline_code_count>=0),
  created_by uuid references auth.users(id) on delete restrict, created_at timestamptz not null default now(), available_at timestamptz,
  unique(document_version_id,snapshot_generation), unique(id,project_id), foreign key(processing_generation_id,project_id) references public.processing_generations(id,project_id) on delete restrict,
  foreign key(validated_docx_artifact_id,project_id) references public.document_artifacts(id,project_id) on delete restrict,
  check(status<>'available' or available_at is not null)
);
create table public.canonical_nodes (
  id text not null, project_id uuid not null, canonical_snapshot_id uuid not null, node_type text not null, ordinal integer not null check(ordinal>=0), parent_id text, source_location text not null, source_text text not null,
  primary key(canonical_snapshot_id,id), unique(canonical_snapshot_id,ordinal), foreign key(canonical_snapshot_id,project_id) references public.canonical_snapshots(id,project_id) on delete restrict
);
create table public.canonical_translation_units (
  id text not null, project_id uuid not null, canonical_snapshot_id uuid not null, node_id text not null, ordinal integer not null check(ordinal>=0), unit_type text not null, source_text text not null, source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
  primary key(canonical_snapshot_id,id), unique(canonical_snapshot_id,ordinal), foreign key(canonical_snapshot_id,project_id) references public.canonical_snapshots(id,project_id) on delete restrict
);
create table public.canonical_inline_codes (
  id text not null, project_id uuid not null, canonical_snapshot_id uuid not null, translation_unit_id text not null, ordinal integer not null check(ordinal>=0), code_type text not null, source_offset integer not null check(source_offset>=0), literal text not null,
  primary key(canonical_snapshot_id,id), unique(canonical_snapshot_id,translation_unit_id,ordinal), foreign key(canonical_snapshot_id,project_id) references public.canonical_snapshots(id,project_id) on delete restrict
);
create index canonical_tu_order_idx on public.canonical_translation_units(canonical_snapshot_id,ordinal);
create index canonical_nodes_order_idx on public.canonical_nodes(canonical_snapshot_id,ordinal);

create function public.canonical_scope_guard() returns trigger language plpgsql set search_path='' as $$ declare actual_project uuid; actual_document uuid; begin
  select d.project_id,dv.document_id into actual_project,actual_document from public.document_versions dv join public.documents d on d.id=dv.document_id where dv.id=new.document_version_id;
  if actual_project is null or actual_project<>new.project_id or actual_document<>new.document_id then raise exception 'canonical scope mismatch' using errcode='23514'; end if; return new; end; $$;
create trigger canonical_snapshot_scope before insert or update on public.canonical_snapshots for each row execute function public.canonical_scope_guard();
create function public.canonical_snapshot_control() returns trigger language plpgsql set search_path='' as $$ begin if tg_op='DELETE' then raise exception 'canonical rows are immutable' using errcode='55000'; end if; if old.status<>'building' or new.status not in ('available','failed','quarantined') then raise exception 'invalid canonical snapshot state transition' using errcode='23514'; end if; if (to_jsonb(new)-array['status','available_at','validated_docx_sha256','normalized_source_sha256','node_count','translation_unit_count','inline_code_count']) is distinct from (to_jsonb(old)-array['status','available_at','validated_docx_sha256','normalized_source_sha256','node_count','translation_unit_count','inline_code_count']) then raise exception 'canonical snapshot identity is immutable' using errcode='55000'; end if; return new; end; $$;
create function public.canonical_append_only() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'canonical rows are immutable' using errcode='55000'; end; $$;
create trigger canonical_snapshot_immutable before delete or update on public.canonical_snapshots for each row execute function public.canonical_snapshot_control();
create trigger canonical_nodes_immutable before delete or update on public.canonical_nodes for each row execute function public.canonical_append_only();
create trigger canonical_tus_immutable before delete or update on public.canonical_translation_units for each row execute function public.canonical_append_only();
create trigger canonical_codes_immutable before delete or update on public.canonical_inline_codes for each row execute function public.canonical_append_only();
create function public.complete_canonical_snapshot(p_generation_id uuid,p_snapshot_id uuid,p_docx_artifact_id uuid,p_expected_sha256 text,p_normalized_source_sha256 text,p_node_count integer,p_tu_count integer,p_code_count integer) returns public.processing_generations language plpgsql security invoker set search_path='' as $$ declare g public.processing_generations; s public.canonical_snapshots; result public.processing_generations; begin
  select * into g from public.processing_generations where id=p_generation_id for update;
  if g.id is null or g.generation_kind<>'canonical_extraction' or g.status<>'validating' then raise exception 'canonical completion precondition failed' using errcode='P0001'; end if;
  if not exists(select 1 from public.document_artifacts a where a.id=p_docx_artifact_id and a.project_id=g.project_id and a.document_id=g.document_id and a.document_version_id=g.document_version_id and a.artifact_type='VALIDATED_DOCX' and a.status='available' and a.sha256=p_expected_sha256) then raise exception 'exact VALIDATED_DOCX is unavailable or mismatched' using errcode='23514'; end if;
  update public.canonical_snapshots set status='available',available_at=now(),validated_docx_sha256=p_expected_sha256,normalized_source_sha256=p_normalized_source_sha256,node_count=p_node_count,translation_unit_count=p_tu_count,inline_code_count=p_code_count where id=p_snapshot_id and processing_generation_id=g.id and validated_docx_artifact_id=p_docx_artifact_id and status='building' returning * into s;
  if s.id is null then raise exception 'canonical snapshot finalization precondition failed' using errcode='P0001'; end if;
  update public.processing_generations set status='completed',validation_status='PASS',source_coverage_status='PASS',ordered_token_status='PASS',normalized_token_count=(select normalized_token_count from public.processing_generations where id=g.id),completed_at=now() where id=g.id and status='validating' returning * into result; return result; end; $$;
revoke all on function public.complete_canonical_snapshot(uuid,uuid,uuid,text,text,integer,integer,integer) from public; grant execute on function public.complete_canonical_snapshot(uuid,uuid,uuid,text,text,integer,integer,integer) to authenticated;

alter table public.canonical_snapshots enable row level security; alter table public.canonical_nodes enable row level security; alter table public.canonical_translation_units enable row level security; alter table public.canonical_inline_codes enable row level security;
create policy canonical_snapshots_owned on public.canonical_snapshots for all to authenticated using(exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid()))) with check(exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())) and created_by=(select auth.uid()));
create policy canonical_nodes_owned on public.canonical_nodes for all to authenticated using(exists(select 1 from public.canonical_snapshots s join public.projects p on p.id=s.project_id where s.id=canonical_snapshot_id and p.owner_id=(select auth.uid()))) with check(exists(select 1 from public.canonical_snapshots s join public.projects p on p.id=s.project_id where s.id=canonical_snapshot_id and p.owner_id=(select auth.uid())));
create policy canonical_tus_owned on public.canonical_translation_units for all to authenticated using(exists(select 1 from public.canonical_snapshots s join public.projects p on p.id=s.project_id where s.id=canonical_snapshot_id and p.owner_id=(select auth.uid()))) with check(exists(select 1 from public.canonical_snapshots s join public.projects p on p.id=s.project_id where s.id=canonical_snapshot_id and p.owner_id=(select auth.uid())));
create policy canonical_codes_owned on public.canonical_inline_codes for all to authenticated using(exists(select 1 from public.canonical_snapshots s join public.projects p on p.id=s.project_id where s.id=canonical_snapshot_id and p.owner_id=(select auth.uid()))) with check(exists(select 1 from public.canonical_snapshots s join public.projects p on p.id=s.project_id where s.id=canonical_snapshot_id and p.owner_id=(select auth.uid())));
