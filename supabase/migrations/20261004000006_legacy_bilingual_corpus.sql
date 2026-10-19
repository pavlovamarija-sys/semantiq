create table public.legacy_corpus_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  language text not null check (length(btrim(language)) > 0),
  corpus_role text not null check (corpus_role in ('source', 'approved_translation')),
  celex_number text,
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  trust_status text not null default 'pending_validation' check (trust_status in ('pending_validation', 'trusted', 'rejected')),
  created_at timestamptz not null default now(),
  unique (document_version_id),
  unique (id, language),
  unique (id, corpus_role)
);

create function public.validate_legacy_corpus_document() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actual_document_id uuid;
  actual_project_id uuid;
begin
  select dv.document_id, d.project_id into actual_document_id, actual_project_id
  from public.document_versions dv join public.documents d on d.id = dv.document_id
  where dv.id = new.document_version_id;
  if actual_document_id is null or actual_document_id <> new.document_id or actual_project_id <> new.project_id then
    raise exception 'Legacy corpus provenance must reference a version of the declared document and project';
  end if;
  return new;
end;
$$;

create trigger legacy_corpus_documents_validate
  before insert or update on public.legacy_corpus_documents
  for each row execute function public.validate_legacy_corpus_document();

create table public.legacy_corpus_pairs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  source_document_id uuid not null,
  target_document_id uuid not null,
  source_language text not null,
  target_language text not null,
  pairing_status text not null default 'matched' check (pairing_status in ('matched', 'alignment_ready', 'in_review', 'approved', 'rejected')),
  match_provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(match_provenance) = 'object'),
  created_at timestamptz not null default now(),
  constraint legacy_pair_source foreign key (source_document_id, source_language)
    references public.legacy_corpus_documents(id, language) on delete restrict,
  constraint legacy_pair_target foreign key (target_document_id, target_language)
    references public.legacy_corpus_documents(id, language) on delete restrict,
  constraint legacy_pair_distinct_documents check (source_document_id <> target_document_id),
  constraint legacy_pair_distinct_languages check (source_language <> target_language),
  unique (source_document_id, target_document_id)
);

create function public.validate_legacy_corpus_pair() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_record record;
  target_record record;
begin
  select d.project_id, d.language, d.corpus_role, d.celex_number into source_record
  from public.legacy_corpus_documents d where d.id = new.source_document_id;
  select d.project_id, d.language, d.corpus_role, d.celex_number into target_record
  from public.legacy_corpus_documents d where d.id = new.target_document_id;
  if source_record.corpus_role <> 'source' or target_record.corpus_role <> 'approved_translation' then
    raise exception 'Legacy pairs require a source and an approved translation document';
  end if;
  if source_record.project_id <> new.project_id or target_record.project_id <> new.project_id then
    raise exception 'Legacy pair documents must belong to the same project';
  end if;
  if source_record.language <> new.source_language or target_record.language <> new.target_language then
    raise exception 'Legacy pair languages must match their corpus documents';
  end if;
  if source_record.celex_number is not null and target_record.celex_number is not null
     and source_record.celex_number <> target_record.celex_number then
    raise exception 'Legacy pair documents have conflicting CELEX provenance';
  end if;
  return new;
end;
$$;

create trigger legacy_corpus_pairs_validate
  before insert or update on public.legacy_corpus_pairs
  for each row execute function public.validate_legacy_corpus_pair();

create table public.legacy_corpus_segments (
  id uuid primary key default gen_random_uuid(),
  corpus_document_id uuid not null references public.legacy_corpus_documents(id) on delete restrict,
  segment_index integer not null check (segment_index >= 0),
  segment_type text not null check (segment_type in ('title', 'preamble', 'recital', 'chapter', 'article', 'paragraph', 'point', 'annex', 'footnote', 'text')),
  structural_key text,
  structural_path jsonb not null default '{}'::jsonb check (jsonb_typeof(structural_path) = 'object'),
  source_start integer not null check (source_start >= 0),
  source_end integer not null check (source_end >= source_start),
  exact_text text not null,
  created_at timestamptz not null default now(),
  unique (corpus_document_id, segment_index),
  unique (id, corpus_document_id)
);
create index legacy_corpus_segments_structure_idx
  on public.legacy_corpus_segments(corpus_document_id, structural_key, segment_index);

create table public.legacy_alignment_units (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.legacy_corpus_pairs(id) on delete restrict,
  alignment_index integer not null check (alignment_index >= 0),
  alignment_cardinality text not null check (alignment_cardinality in ('1:1', '1:N', 'N:1')),
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  confidence_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(confidence_evidence) = 'object'),
  review_status text not null default 'proposed' check (review_status in ('proposed', 'needs_review', 'validated', 'rejected')),
  knowledge_status text not null default 'excluded' check (knowledge_status in ('excluded', 'eligible', 'approved')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (pair_id, alignment_index),
  constraint legacy_alignment_reuse_gate check (
    knowledge_status = 'excluded'
    or (review_status = 'validated' and confidence >= 0.9000)
  ),
  constraint legacy_alignment_approval_audit check (
    knowledge_status <> 'approved'
    or (reviewed_by is not null and reviewed_at is not null and approved_at is not null)
  )
);

create table public.legacy_alignment_unit_segments (
  alignment_unit_id uuid not null references public.legacy_alignment_units(id) on delete restrict,
  segment_id uuid not null references public.legacy_corpus_segments(id) on delete restrict,
  side text not null check (side in ('source', 'target')),
  position integer not null check (position >= 0),
  primary key (alignment_unit_id, side, position),
  unique (alignment_unit_id, segment_id)
);
create index legacy_alignment_unit_segments_segment_idx on public.legacy_alignment_unit_segments(segment_id);

create function public.validate_legacy_alignment_segment_side() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected_document_id uuid;
  actual_document_id uuid;
begin
  select case when new.side = 'source' then cp.source_document_id else cp.target_document_id end
    into expected_document_id
  from public.legacy_alignment_units au join public.legacy_corpus_pairs cp on cp.id = au.pair_id
  where au.id = new.alignment_unit_id;
  select s.corpus_document_id into actual_document_id
  from public.legacy_corpus_segments s where s.id = new.segment_id;
  if expected_document_id is null or actual_document_id <> expected_document_id then
    raise exception 'Alignment segment does not belong to the declared source/target side';
  end if;
  return new;
end;
$$;

create trigger legacy_alignment_unit_segments_validate
  before insert or update on public.legacy_alignment_unit_segments
  for each row execute function public.validate_legacy_alignment_segment_side();

alter table public.legacy_corpus_documents enable row level security;
alter table public.legacy_corpus_pairs enable row level security;
alter table public.legacy_corpus_segments enable row level security;
alter table public.legacy_alignment_units enable row level security;
alter table public.legacy_alignment_unit_segments enable row level security;

create policy legacy_corpus_documents_owned on public.legacy_corpus_documents for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy legacy_corpus_pairs_owned on public.legacy_corpus_pairs for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy legacy_corpus_segments_owned on public.legacy_corpus_segments for all to authenticated
  using (exists (select 1 from public.legacy_corpus_documents d join public.projects p on p.id = d.project_id where d.id = corpus_document_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.legacy_corpus_documents d join public.projects p on p.id = d.project_id where d.id = corpus_document_id and p.owner_id = (select auth.uid())));
create policy legacy_alignment_units_owned on public.legacy_alignment_units for all to authenticated
  using (exists (select 1 from public.legacy_corpus_pairs cp join public.projects p on p.id = cp.project_id where cp.id = pair_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.legacy_corpus_pairs cp join public.projects p on p.id = cp.project_id where cp.id = pair_id and p.owner_id = (select auth.uid())));
create policy legacy_alignment_unit_segments_owned on public.legacy_alignment_unit_segments for all to authenticated
  using (exists (select 1 from public.legacy_alignment_units au join public.legacy_corpus_pairs cp on cp.id = au.pair_id join public.projects p on p.id = cp.project_id where au.id = alignment_unit_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.legacy_alignment_units au join public.legacy_corpus_pairs cp on cp.id = au.pair_id join public.projects p on p.id = cp.project_id where au.id = alignment_unit_id and p.owner_id = (select auth.uid())));

comment on table public.legacy_alignment_units is
  'Reviewable EN/MK alignment proposals. Only validated units at confidence >= 0.90 can become eligible or approved reusable knowledge.';
