alter table public.terminology_entries
  add column knowledge_base_id uuid references public.translation_knowledge_bases(id) on delete restrict,
  add column provenance jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provenance) = 'object');

create unique index terminology_entries_corpus_supported_unique_idx
  on public.terminology_entries(knowledge_base_id, source_language, target_language, source_term, target_term)
  where source_type = 'corpus_supported' and knowledge_base_id is not null;

create index terminology_entries_knowledge_base_lookup_idx
  on public.terminology_entries(knowledge_base_id, source_language, target_language, source_term)
  where knowledge_base_id is not null;

create policy terminology_entries_knowledge_base_owned on public.terminology_entries
  for all to authenticated
  using (
    knowledge_base_id is not null
    and exists (
      select 1 from public.translation_knowledge_bases kb
      where kb.id = knowledge_base_id and kb.owner_id = (select auth.uid())
    )
  )
  with check (
    knowledge_base_id is not null
    and exists (
      select 1 from public.translation_knowledge_bases kb
      where kb.id = knowledge_base_id and kb.owner_id = (select auth.uid())
    )
  );

comment on column public.terminology_entries.source_type is
  'Evidence/type of terminology record, including corpus_supported; status remains separate for later reviewer or official approval.';
comment on column public.terminology_entries.provenance is
  'Supporting corpus evidence, including frequencies, document counts, CELEX values, and TM unit IDs.';
