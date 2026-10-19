-- PHASE 6C.0 DESIGN ONLY. Do not apply as a migration.
-- All objects are additive. Existing documents/document_versions remain intact.

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
  storage_bucket text,
  storage_path text,
  original_filename text,
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint check (byte_size is null or byte_size > 0),
  mime_type text,
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
  check (
    status <> 'available' or
    (storage_bucket is not null and storage_path is not null and sha256 is not null
      and byte_size is not null and mime_type is not null and available_at is not null)
  )
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

create table public.canonical_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  processing_generation_id uuid not null,
  validated_docx_artifact_id uuid not null,
  snapshot_generation integer not null check (snapshot_generation > 0),
  status text not null default 'building' check (status in ('building','available','failed','quarantined')),
  schema_version text not null,
  extractor_version text not null,
  source_language text not null check (length(btrim(source_language)) > 0),
  validated_docx_sha256 text not null check (validated_docx_sha256 ~ '^[0-9a-f]{64}$'),
  normalized_source_sha256 text not null check (normalized_source_sha256 ~ '^[0-9a-f]{64}$'),
  node_count integer not null default 0 check (node_count >= 0),
  translation_unit_count integer not null default 0 check (translation_unit_count >= 0),
  inline_code_count integer not null default 0 check (inline_code_count >= 0),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  available_at timestamptz,
  unique (document_version_id, snapshot_generation),
  unique (id, project_id),
  foreign key (processing_generation_id, project_id) references public.processing_generations(id, project_id) on delete restrict,
  foreign key (validated_docx_artifact_id, project_id) references public.document_artifacts(id, project_id) on delete restrict,
  check (status <> 'available' or available_at is not null)
);

create table public.artifact_canonical_bindings (
  artifact_id uuid primary key,
  project_id uuid not null,
  canonical_snapshot_id uuid not null,
  skeleton_sha256 text check (skeleton_sha256 is null or skeleton_sha256 ~ '^[0-9a-f]{64}$'),
  source_units_sha256 text check (source_units_sha256 is null or source_units_sha256 ~ '^[0-9a-f]{64}$'),
  target_language text,
  studio_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(studio_metadata) = 'object'),
  foreign key (artifact_id, project_id) references public.document_artifacts(id, project_id) on delete restrict,
  foreign key (canonical_snapshot_id, project_id) references public.canonical_snapshots(id, project_id) on delete restrict
);

create table public.artifact_translation_versions (
  artifact_id uuid not null,
  project_id uuid not null,
  canonical_snapshot_id uuid not null,
  canonical_tu_key text not null check (length(btrim(canonical_tu_key)) > 0),
  translation_version_id uuid not null references public.translation_versions(id) on delete restrict,
  mapping_role text not null check (mapping_role in ('injected_mk1','reconciled_mk2','rendered_target')),
  unit_ordinal integer not null check (unit_ordinal >= 0),
  created_at timestamptz not null default now(),
  primary key (artifact_id, mapping_role, unit_ordinal),
  unique (artifact_id, mapping_role, canonical_tu_key),
  unique (artifact_id, mapping_role, translation_version_id),
  foreign key (artifact_id, project_id) references public.document_artifacts(id, project_id) on delete restrict,
  foreign key (canonical_snapshot_id, project_id) references public.canonical_snapshots(id, project_id) on delete restrict
);

-- Required migration implementation details (not expanded in this design file):
-- 1. ownership RLS policies equivalent to existing project-owner joins;
-- 2. triggers validating project/document/version consistency;
-- 3. immutable-column and allowed-state-transition triggers;
-- 4. cycle rejection for artifact relationships;
-- 5. storage policies validating owner/project/document/version/artifact path segments;
-- 6. SECURITY INVOKER finalization RPC that verifies expected state and atomically
--    publishes artifact/generation metadata after application byte read-back/hash.
