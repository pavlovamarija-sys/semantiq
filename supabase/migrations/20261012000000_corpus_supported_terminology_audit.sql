alter table public.terminology_entries
  add column if not exists audit_status text not null default 'valid'
    check (audit_status in ('valid', 'quarantined')),
  add column if not exists audit_reasons jsonb not null default '[]'::jsonb
    check (jsonb_typeof(audit_reasons) = 'array'),
  add column if not exists audit_evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(audit_evidence) = 'object'),
  add column if not exists audited_at timestamptz;

create index if not exists terminology_entries_trusted_corpus_idx
  on public.terminology_entries(knowledge_base_id, source_language, target_language, source_term)
  where source_type = 'corpus_supported' and audit_status = 'valid';
