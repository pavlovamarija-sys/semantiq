-- Approved translation memory foundation. This migration creates schema only;
-- legacy corpus data is intentionally not imported here.
create table public.approved_translation_memory_units (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  source_language text not null check (length(btrim(source_language)) > 0),
  target_language text not null check (length(btrim(target_language)) > 0),
  source_text text not null check (length(btrim(source_text)) > 0),
  target_text text not null check (length(btrim(target_text)) > 0),
  source_text_hash text generated always as (md5(source_text)) stored,
  celex text,
  source_document text not null check (length(btrim(source_document)) > 0),
  provenance jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provenance) = 'object'),
  original_tmx_tu_id text,
  source_kind text not null check (source_kind in ('legacy_import', 'human_approved')),
  alignment_confidence numeric(5,4) not null
    check (alignment_confidence >= 0 and alignment_confidence <= 1),
  trust_status text not null default 'approved'
    check (trust_status in ('pending_validation', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approved_tm_languages_distinct check (source_language <> target_language),
  constraint approved_tm_legacy_identity_required check (
    source_kind <> 'legacy_import'
    or (original_tmx_tu_id is not null and length(btrim(original_tmx_tu_id)) > 0)
  ),
  constraint approved_tm_legacy_trust_gate check (
    source_kind <> 'legacy_import'
    or trust_status in ('pending_validation', 'approved')
  )
);

create unique index approved_tm_legacy_tu_identity_idx
  on public.approved_translation_memory_units(project_id, source_document, original_tmx_tu_id)
  where source_kind = 'legacy_import' and original_tmx_tu_id is not null;

create index approved_tm_exact_lookup_idx
  on public.approved_translation_memory_units
    (project_id, source_language, target_language, source_text_hash)
  where trust_status = 'approved';

create index approved_tm_source_document_idx
  on public.approved_translation_memory_units(project_id, source_document);

create trigger approved_translation_memory_units_updated_at
  before update on public.approved_translation_memory_units
  for each row execute function public.set_updated_at();

alter table public.approved_translation_memory_units enable row level security;

create policy approved_tm_units_owned on public.approved_translation_memory_units
  for all to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ));

comment on table public.approved_translation_memory_units is
  'Approved EN/MK and future multilingual translation-memory units with preserved provenance. Legacy imports are deduplicated by project, source document, and original TMX TU identity.';
comment on column public.approved_translation_memory_units.provenance is
  'Immutable import/source metadata, including original files, identifiers, retrieval details, and alignment evidence.';
comment on column public.approved_translation_memory_units.source_text_hash is
  'Deterministic MD5 hash of the exact source text for exact TM lookup; source_text remains the authoritative value.';
