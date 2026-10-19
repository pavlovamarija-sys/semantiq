-- Phase 6C.1: additive, inactive immutable artifact foundation.
-- Existing persistence paths are deliberately not changed by this migration.

create table public.processing_generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  generation_kind text not null check (generation_kind in (
    'source_registration','pdf_reconstruction','canonical_extraction','cat_projection',
    'mk1_injection','cat_review_import','mk2_reconciliation','target_render','qa','export_package'
  )),
  generation_number integer not null check (generation_number > 0),
  idempotency_key text not null check (length(btrim(idempotency_key)) > 0),
  input_fingerprint_sha256 text not null check (input_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in (
    'pending','running','validating','completed','failed','failed_validation','abandoned'
  )),
  producer_kind text not null check (length(btrim(producer_kind)) > 0),
  producer_version text not null check (length(btrim(producer_version)) > 0),
  algorithm_version text,
  config_sha256 text check (config_sha256 is null or config_sha256 ~ '^[0-9a-f]{64}$'),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  validation_status text check (validation_status is null or validation_status in ('PASS','WARNING','FAIL')),
  source_coverage_status text check (source_coverage_status is null or source_coverage_status in ('PASS','FAIL')),
  ordered_token_status text check (ordered_token_status is null or ordered_token_status in ('PASS','FAIL')),
  page_count integer check (page_count is null or page_count >= 0),
  block_count integer check (block_count is null or block_count >= 0),
  line_count integer check (line_count is null or line_count >= 0),
  span_count integer check (span_count is null or span_count >= 0),
  normalized_token_count integer check (normalized_token_count is null or normalized_token_count >= 0),
  physical_table_count integer check (physical_table_count is null or physical_table_count >= 0),
  logical_table_count integer check (logical_table_count is null or logical_table_count >= 0),
  row_count integer check (row_count is null or row_count >= 0),
  cell_count integer check (cell_count is null or cell_count >= 0),
  merge_count integer check (merge_count is null or merge_count >= 0),
  keep_boundary_count integer check (keep_boundary_count is null or keep_boundary_count >= 0),
  abstain_count integer check (abstain_count is null or abstain_count >= 0),
  error_code text,
  error_summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (document_version_id, generation_kind, generation_number),
  unique (project_id, generation_kind, idempotency_key),
  unique (id, project_id),
  check (completed_at is null or started_at is not null),
  check (status not in ('completed','failed','failed_validation','abandoned') or completed_at is not null)
);

create unique index processing_generations_one_active_input_idx
  on public.processing_generations(document_version_id, generation_kind, input_fingerprint_sha256)
  where status in ('pending','running','validating');
create index processing_generations_document_created_idx
  on public.processing_generations(document_version_id, created_at desc);

create table public.document_artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  processing_generation_id uuid,
  artifact_type text not null check (artifact_type in (
    'SOURCE_PDF','RECONSTRUCTION_MODEL','VALIDATED_DOCX','CANONICAL_SNAPSHOT',
    'STUDIO_SDLXLIFF_SOURCE','STUDIO_SDLXLIFF_MK1','STUDIO_SDLXLIFF_REVIEWED',
    'TARGET_DOCX','QA_REPORT','RECONCILIATION_REPORT','EXPORT_PACKAGE'
  )),
  artifact_generation integer not null check (artifact_generation > 0),
  status text not null default 'reserved' check (status in ('reserved','uploading','available','failed','quarantined')),
  storage_bucket text not null check (length(btrim(storage_bucket)) > 0),
  storage_path text not null check (length(btrim(storage_path)) > 0),
  original_filename text not null check (length(btrim(original_filename)) > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size > 0),
  mime_type text not null check (length(btrim(mime_type)) > 0),
  producer_kind text not null check (length(btrim(producer_kind)) > 0),
  producer_version text not null check (length(btrim(producer_version)) > 0),
  failure_code text,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  available_at timestamptz,
  unique (document_version_id, artifact_type, artifact_generation),
  unique (storage_bucket, storage_path),
  unique (id, project_id),
  foreign key (processing_generation_id, project_id)
    references public.processing_generations(id, project_id) on delete restrict,
  check (status <> 'available' or available_at is not null),
  check (status = 'available' or available_at is null)
);

create index document_artifacts_document_type_created_idx
  on public.document_artifacts(document_version_id, artifact_type, created_at desc);
create index document_artifacts_sha256_idx on public.document_artifacts(sha256) where status = 'available';
create index document_artifacts_generation_idx on public.document_artifacts(processing_generation_id)
  where processing_generation_id is not null;

create table public.processing_generation_inputs (
  generation_id uuid not null,
  project_id uuid not null,
  artifact_id uuid not null,
  input_role text not null check (length(btrim(input_role)) > 0),
  input_ordinal integer not null default 0 check (input_ordinal >= 0),
  expected_sha256 text not null check (expected_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (generation_id, input_role, input_ordinal),
  unique (generation_id, artifact_id, input_role),
  foreign key (generation_id, project_id) references public.processing_generations(id, project_id) on delete restrict,
  foreign key (artifact_id, project_id) references public.document_artifacts(id, project_id) on delete restrict
);

create table public.artifact_relationships (
  project_id uuid not null,
  parent_artifact_id uuid not null,
  child_artifact_id uuid not null,
  relationship_type text not null check (relationship_type in (
    'derived_from','rendered_from','extracted_from','projected_from','injected_from',
    'reviewed_from','reconciled_from','packaged_from','supersedes'
  )),
  input_role text not null default 'primary' check (length(btrim(input_role)) > 0),
  input_ordinal integer not null default 0 check (input_ordinal >= 0),
  created_at timestamptz not null default now(),
  primary key (child_artifact_id, relationship_type, input_role, input_ordinal),
  unique (child_artifact_id, parent_artifact_id, relationship_type, input_role),
  foreign key (parent_artifact_id, project_id) references public.document_artifacts(id, project_id) on delete restrict,
  foreign key (child_artifact_id, project_id) references public.document_artifacts(id, project_id) on delete restrict,
  check (parent_artifact_id <> child_artifact_id)
);
create index artifact_relationships_parent_idx on public.artifact_relationships(parent_artifact_id);

create function public.validate_artifact_scope() returns trigger language plpgsql set search_path = '' as $$
declare actual_project uuid; actual_document uuid;
begin
  select d.project_id, dv.document_id into actual_project, actual_document
  from public.document_versions dv join public.documents d on d.id = dv.document_id
  where dv.id = new.document_version_id;
  if actual_project is null or actual_project <> new.project_id or actual_document <> new.document_id then
    raise exception 'document artifact scope does not match document version' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger processing_generations_scope before insert or update on public.processing_generations
  for each row execute function public.validate_artifact_scope();
create trigger document_artifacts_scope before insert or update on public.document_artifacts
  for each row execute function public.validate_artifact_scope();

create function public.enforce_artifact_immutability() returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['status','available_at','failure_code'])
      is distinct from (to_jsonb(old) - array['status','available_at','failure_code']) then
    raise exception 'immutable artifact identity or metadata cannot be changed' using errcode = '55000';
  end if;
  if not ((old.status = 'reserved' and new.status in ('uploading','failed')) or
          (old.status = 'uploading' and new.status in ('available','failed')) or
          (old.status = 'available' and new.status = 'quarantined')) then
    raise exception 'invalid artifact state transition: % -> %', old.status, new.status using errcode = '23514';
  end if;
  if new.status = 'available' and (new.available_at is null or new.failure_code is not null) then
    raise exception 'available artifact requires available_at and no failure_code' using errcode = '23514';
  end if;
  if new.status in ('failed','quarantined') and nullif(btrim(new.failure_code), '') is null then
    raise exception 'failed or quarantined artifact requires failure_code' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger document_artifacts_immutable before update on public.document_artifacts
  for each row execute function public.enforce_artifact_immutability();

create function public.enforce_generation_updates() returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['status','validation_status','source_coverage_status','ordered_token_status',
       'page_count','block_count','line_count','span_count','normalized_token_count','physical_table_count',
       'logical_table_count','row_count','cell_count','merge_count','keep_boundary_count','abstain_count',
       'error_code','error_summary','started_at','completed_at'])
     is distinct from
     (to_jsonb(old) - array['status','validation_status','source_coverage_status','ordered_token_status',
       'page_count','block_count','line_count','span_count','normalized_token_count','physical_table_count',
       'logical_table_count','row_count','cell_count','merge_count','keep_boundary_count','abstain_count',
       'error_code','error_summary','started_at','completed_at']) then
    raise exception 'processing generation identity/configuration cannot be changed' using errcode = '55000';
  end if;
  if not ((old.status = 'pending' and new.status in ('running','failed','abandoned')) or
          (old.status = 'running' and new.status in ('validating','failed','abandoned')) or
          (old.status = 'validating' and new.status in ('completed','failed','failed_validation','abandoned'))) then
    raise exception 'invalid generation state transition: % -> %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger processing_generations_controlled_updates before update on public.processing_generations
  for each row execute function public.enforce_generation_updates();

create function public.reject_artifact_relationship_cycle() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (
    with recursive descendants(id) as (
      select new.child_artifact_id
      union
      select ar.child_artifact_id from public.artifact_relationships ar
      join descendants d on ar.parent_artifact_id = d.id
    ) select 1 from descendants where id = new.parent_artifact_id
  ) then
    raise exception 'artifact relationship would create a cycle' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger artifact_relationships_no_cycles before insert on public.artifact_relationships
  for each row execute function public.reject_artifact_relationship_cycle();

create function public.reject_immutable_row_change() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% rows are append-only', tg_table_name using errcode = '55000';
end;
$$;
create trigger artifact_relationships_append_only before update or delete on public.artifact_relationships
  for each row execute function public.reject_immutable_row_change();
create trigger processing_generation_inputs_append_only before update or delete on public.processing_generation_inputs
  for each row execute function public.reject_immutable_row_change();
create trigger document_artifacts_no_delete before delete on public.document_artifacts
  for each row execute function public.reject_immutable_row_change();
create trigger processing_generations_no_delete before delete on public.processing_generations
  for each row execute function public.reject_immutable_row_change();

create function public.finalize_document_artifact(p_artifact_id uuid, p_expected_sha256 text, p_expected_byte_size bigint)
returns public.document_artifacts language plpgsql security invoker set search_path = '' as $$
declare result public.document_artifacts;
begin
  update public.document_artifacts
  set status = 'available', available_at = now(), failure_code = null
  where id = p_artifact_id and status = 'uploading'
    and sha256 = p_expected_sha256 and byte_size = p_expected_byte_size
  returning * into result;
  if result.id is null then raise exception 'artifact finalization precondition failed' using errcode = 'P0001'; end if;
  return result;
end;
$$;
revoke all on function public.finalize_document_artifact(uuid,text,bigint) from public;
grant execute on function public.finalize_document_artifact(uuid,text,bigint) to authenticated;

alter table public.processing_generations enable row level security;
alter table public.document_artifacts enable row level security;
alter table public.processing_generation_inputs enable row level security;
alter table public.artifact_relationships enable row level security;

create policy processing_generations_owned on public.processing_generations for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())) and created_by = (select auth.uid()));
create policy document_artifacts_owned on public.document_artifacts for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())) and created_by = (select auth.uid()));
create policy processing_generation_inputs_owned on public.processing_generation_inputs for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy processing_generation_inputs_insert_owned on public.processing_generation_inputs for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy artifact_relationships_owned on public.artifact_relationships for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy artifact_relationships_insert_owned on public.artifact_relationships for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('document-artifacts','document-artifacts',false,157286400,array[
  'application/pdf','application/json','application/zip','application/xml','text/xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/x-xliff+xml','application/x-sdlxliff'
]) on conflict (id) do nothing;

create policy document_artifacts_storage_select_owned on storage.objects for select to authenticated using (
  bucket_id = 'document-artifacts'
  and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
  and exists (select 1 from public.projects p where p.id::text = (storage.foldername(storage.objects.name))[2] and p.owner_id = (select auth.uid()))
);
create policy document_artifacts_storage_insert_reserved on storage.objects for insert to authenticated with check (
  bucket_id = 'document-artifacts'
  and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.document_artifacts a join public.projects p on p.id = a.project_id
    where p.owner_id = (select auth.uid()) and a.storage_bucket = bucket_id and a.storage_path = storage.objects.name
      and a.status in ('reserved','uploading')
  )
);
create policy document_artifacts_storage_delete_uncommitted on storage.objects for delete to authenticated using (
  bucket_id = 'document-artifacts'
  and exists (
    select 1 from public.document_artifacts a join public.projects p on p.id = a.project_id
    where p.owner_id = (select auth.uid()) and a.storage_bucket = bucket_id and a.storage_path = storage.objects.name
      and a.status in ('reserved','uploading','failed')
  )
);
-- No storage UPDATE policy: immutable paths are uploaded with upsert=false.
