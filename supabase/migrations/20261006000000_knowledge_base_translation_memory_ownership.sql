-- Move approved legacy TM out of project ownership and into owner-scoped
-- Knowledge Base data. This changes ownership only; no TM content is copied.
create table public.translation_knowledge_bases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete restrict,
  name text not null default 'Approved translation memory'
    check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.translation_knowledge_bases enable row level security;
create policy translation_knowledge_bases_owned on public.translation_knowledge_bases
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

insert into public.translation_knowledge_bases (owner_id)
select distinct p.owner_id
from public.approved_translation_memory_units tm
join public.projects p on p.id = tm.project_id
where tm.source_kind = 'legacy_import'
on conflict (owner_id) do nothing;

alter table public.approved_translation_memory_units
  rename column project_id to originating_project_id;

alter table public.approved_translation_memory_units
  add column knowledge_base_id uuid references public.translation_knowledge_bases(id) on delete restrict;

alter table public.approved_translation_memory_units
  alter column originating_project_id drop not null;

update public.approved_translation_memory_units tm
set knowledge_base_id = kb.id,
    originating_project_id = null
from public.projects p
join public.translation_knowledge_bases kb on kb.owner_id = p.owner_id
where tm.originating_project_id = p.id
  and tm.source_kind = 'legacy_import';

drop policy approved_tm_units_owned on public.approved_translation_memory_units;
drop index approved_tm_legacy_tu_identity_idx;
drop index approved_tm_exact_lookup_idx;
drop index approved_tm_source_document_idx;

alter table public.approved_translation_memory_units
  add constraint approved_tm_ownership_kind_check check (
    (source_kind = 'legacy_import' and knowledge_base_id is not null and originating_project_id is null)
    or (source_kind = 'human_approved' and knowledge_base_id is null and originating_project_id is not null)
  );

create unique index approved_tm_legacy_tu_identity_idx
  on public.approved_translation_memory_units(knowledge_base_id, source_document, original_tmx_tu_id)
  where source_kind = 'legacy_import' and original_tmx_tu_id is not null;

create index approved_tm_exact_lookup_idx
  on public.approved_translation_memory_units
    (knowledge_base_id, source_language, target_language, source_text_hash)
  where trust_status = 'approved' and knowledge_base_id is not null;

create index approved_tm_project_exact_lookup_idx
  on public.approved_translation_memory_units
    (originating_project_id, source_language, target_language, source_text_hash)
  where trust_status = 'approved' and originating_project_id is not null;

create index approved_tm_source_document_idx
  on public.approved_translation_memory_units(knowledge_base_id, source_document)
  where knowledge_base_id is not null;

create policy approved_tm_units_owned on public.approved_translation_memory_units
  for all to authenticated
  using (
    exists (
      select 1 from public.translation_knowledge_bases kb
      where kb.id = knowledge_base_id and kb.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.projects p
      where p.id = originating_project_id and p.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.translation_knowledge_bases kb
      where kb.id = knowledge_base_id and kb.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.projects p
      where p.id = originating_project_id and p.owner_id = (select auth.uid())
    )
  );

create trigger translation_knowledge_bases_updated_at
  before update on public.translation_knowledge_bases
  for each row execute function public.set_updated_at();

comment on table public.translation_knowledge_bases is
  'Owner-scoped reusable translation knowledge. Knowledge Base ownership is distinct from originating project ownership.';
comment on column public.approved_translation_memory_units.knowledge_base_id is
  'Owner-scoped Knowledge Base for reusable approved legacy TM units.';
comment on column public.approved_translation_memory_units.originating_project_id is
  'Project provenance for future human-approved translations; legacy Knowledge Base imports leave this null.';
