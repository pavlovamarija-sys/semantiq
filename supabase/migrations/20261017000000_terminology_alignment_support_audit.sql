alter table public.terminology_entries
  add column if not exists alignment_support_audit_status text
    check (alignment_support_audit_status in ('trusted','quarantined')),
  add column if not exists alignment_support_audit_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(alignment_support_audit_reasons)='array'),
  add column if not exists alignment_support_audit_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(alignment_support_audit_evidence)='object'),
  add column if not exists alignment_support_audited_at timestamptz;

create index if not exists terminology_entries_dual_audit_trusted_idx
  on public.terminology_entries(knowledge_base_id,source_language,target_language,source_term)
  where source_type='corpus_supported' and audit_status='valid' and alignment_support_audit_status='trusted';
