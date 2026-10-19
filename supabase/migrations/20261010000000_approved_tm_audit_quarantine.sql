alter table public.approved_translation_memory_units
  add column audit_status text not null default 'valid'
    check (audit_status in ('valid', 'corrupt', 'uncertain')),
  add column audit_reasons jsonb not null default '[]'::jsonb
    check (jsonb_typeof(audit_reasons) = 'array'),
  add column audit_evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(audit_evidence) = 'object'),
  add column audited_at timestamptz;

create index approved_tm_valid_exact_lookup_idx
  on public.approved_translation_memory_units(knowledge_base_id, source_language, target_language, source_text_hash)
  where trust_status = 'approved' and source_kind = 'legacy_import' and audit_status = 'valid';

create index approved_tm_audit_status_idx
  on public.approved_translation_memory_units(knowledge_base_id, audit_status, celex)
  where source_kind = 'legacy_import';

comment on column public.approved_translation_memory_units.audit_status is
  'Deterministic legacy-TM quality gate. Quarantined corrupt/uncertain rows remain immutable and are excluded from retrieval.';
comment on column public.approved_translation_memory_units.audit_reasons is
  'Structured audit findings; original source and target text are never rewritten.';
