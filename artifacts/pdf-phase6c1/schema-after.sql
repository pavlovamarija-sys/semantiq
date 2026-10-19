-- Expected additive Phase 6C.1 schema snapshot.
-- Canonical executable DDL:
--   supabase/migrations/20261019000000_immutable_document_artifacts.sql
-- Migration SHA-256:
--   7068D6A0B57FFD2629BFAEED3BD5A09D5E240AA127FD900538B2248D60F4CEAE

-- New public relations:
--   public.processing_generations
--   public.document_artifacts
--   public.processing_generation_inputs
--   public.artifact_relationships
-- New private bucket:
--   document-artifacts
-- Existing relations and storage objects are unchanged.

select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('processing_generations','document_artifacts','processing_generation_inputs','artifact_relationships')
order by table_name;
