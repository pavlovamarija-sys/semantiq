# Phase 6C.1 implementation summary

Implemented an additive, inactive immutable-artifact foundation. The migration adds `processing_generations`, `document_artifacts`, `processing_generation_inputs`, and `artifact_relationships`; a private `document-artifacts` bucket; project-owner RLS; scope and immutability triggers; cycle prevention; and a security-invoker finalization function.

Application primitives provide deterministic paths, actual-byte SHA-256/size calculation, artifact-type MIME validation, upload with `upsert:false`, mandatory read-back verification, atomic finalization through a repository boundary, verified reads, and resumable handling of storage-success/database-failure.

No production caller imports the new service. Existing CELEX, converter, canonical, CAT, translation, and legacy-TM paths are unchanged.

Files changed:

- `supabase/migrations/20261019000000_immutable_document_artifacts.sql`
- `src/domain/document-artifacts.ts`
- `src/infrastructure/artifacts/artifact-integrity.ts`
- `src/infrastructure/artifacts/immutable-artifact-service.ts`
- `src/infrastructure/artifacts/immutable-artifacts.test.mjs`
- `package.json` (test command only)
- Phase 6C.1 evidence artifacts

No database migration was applied and no storage object was written by this implementation task.
