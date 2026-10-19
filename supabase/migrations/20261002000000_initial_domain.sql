-- Initial domain only. RLS denies client access until ownership and policies are added.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  source_language text not null check (length(btrim(source_language)) > 0),
  target_language text not null check (length(btrim(target_language)) > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_distinct_languages check (source_language <> target_language)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  title text not null check (length(btrim(title)) > 0),
  document_type text,
  celex_number text,
  source_language text not null check (length(btrim(source_language)) > 0),
  source_filename text,
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_project_id_idx on public.documents(project_id);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  raw_text text,
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'processing', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

create table public.document_segments (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  segment_index integer not null check (segment_index >= 0),
  segment_type text not null check (length(btrim(segment_type)) > 0),
  source_text text not null,
  parent_segment_id uuid,
  chapter_number text,
  article_number text,
  paragraph_number text,
  point_number text,
  created_at timestamptz not null default now(),
  unique (document_version_id, segment_index),
  unique (document_version_id, id),
  constraint document_segments_parent_same_version foreign key (document_version_id, parent_segment_id)
    references public.document_segments(document_version_id, id) on delete restrict,
  constraint document_segments_not_own_parent check (parent_segment_id is distinct from id)
);
create index document_segments_parent_idx on public.document_segments(document_version_id, parent_segment_id)
  where parent_segment_id is not null;

create table public.translations (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.document_segments(id) on delete restrict,
  target_language text not null check (length(btrim(target_language)) > 0),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (segment_id, target_language)
);

create table public.translation_versions (
  id uuid primary key default gen_random_uuid(),
  translation_id uuid not null references public.translations(id) on delete restrict,
  target_text text not null,
  origin text not null check (origin in ('ai', 'translator', 'reviewer')),
  model_provider text,
  model_name text,
  prompt_version text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index translation_versions_translation_id_created_at_idx
  on public.translation_versions(translation_id, created_at);

create table public.terminology_entries (
  id uuid primary key default gen_random_uuid(),
  source_language text not null check (length(btrim(source_language)) > 0),
  target_language text not null check (length(btrim(target_language)) > 0),
  source_term text not null check (length(btrim(source_term)) > 0),
  target_term text not null check (length(btrim(target_term)) > 0),
  definition text,
  domain text,
  context text,
  source_type text,
  source_reference text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'deprecated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index terminology_entries_lookup_idx
  on public.terminology_entries(source_language, target_language, source_term);

create table public.translation_evidence (
  id uuid primary key default gen_random_uuid(),
  translation_version_id uuid not null references public.translation_versions(id) on delete restrict,
  evidence_type text not null check (length(btrim(evidence_type)) > 0),
  source_name text,
  source_reference text,
  source_text text,
  target_text text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index translation_evidence_translation_version_id_idx
  on public.translation_evidence(translation_version_id);

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();
create trigger translations_updated_at before update on public.translations
  for each row execute function public.set_updated_at();
create trigger terminology_entries_updated_at before update on public.terminology_entries
  for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_segments enable row level security;
alter table public.translations enable row level security;
alter table public.translation_versions enable row level security;
alter table public.terminology_entries enable row level security;
alter table public.translation_evidence enable row level security;

-- No policies yet: authenticated/anon clients cannot read or modify these rows.
-- Add ownership columns and scoped policies with the authentication milestone.
