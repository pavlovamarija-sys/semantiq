alter table public.document_translation_artifacts
  drop constraint document_translation_artifacts_artifact_type_check,
  add constraint document_translation_artifacts_artifact_type_check
    check (artifact_type in ('mk1_docx', 'translation_report_docx')),
  add column content_hash text;

comment on column public.document_translation_artifacts.content_hash is
  'Deterministic fingerprint of the persisted inputs used to generate a derived artifact.';
