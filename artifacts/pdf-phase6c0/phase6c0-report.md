# Phase 6C.0 report

## Classification: READY_FOR_IMPLEMENTATION

The current persistence architecture can support an additive immutable-artifact model without destructive migration. Existing `documents` and `document_versions` remain the logical/version boundaries; source metadata immutability, `upsert:false`, private owner/project-scoped Storage paths, derived-version provenance, append-oriented translation versions, run-segment mappings and explicit human approval are reusable foundations.

The principal gaps are now resolved at design level:

- stable UUID artifact identity with persisted actual-byte SHA-256, size and MIME;
- explicit processing-generation identity and deterministic idempotency;
- multi-input artifact lineage rather than filename conventions;
- immutable source/model/DOCX/CAT/export generations;
- canonical snapshots bound to an exact validated DOCX artifact/hash;
- untouched SDLXLIFF preserved as immutable Studio skeleton;
- exact artifact-to-translation-version mappings for MK1 and MK2;
- explicit stale guards and fail-closed integrity transitions;
- additive owner/project RLS and collision-safe paths retaining current path semantics;
- gradual backfill/dual-write/dual-read adoption with legacy rollback.

The typed reconstruction model is stored as immutable JSON plus indexed generation summaries; canonical nodes/TUs/codes are normalized under a separate immutable snapshot. Artifact availability never marks translation content approved or trusted.

The proposed SQL is deliberately a design artifact, not a migration. Phase 6C.1 must implement and test consistency/immutability/state-transition triggers, project-owner RLS, and artifact-bucket policies before any production caller writes the new tables. These are implementation details with a settled data model, not unresolved architecture decisions.

Current mutable translation-report replacement is explicitly identified for later retirement; existing behavior remains untouched until its migration slice. Existing CELEX import, working-document conversion, translation, approval, TM, current RLS, and production data remain unchanged. Phase 6B shadow mode remains OFF and local shadow evidence is not part of the production artifact architecture.

No migration, Supabase operation, production-code change, import, reconstruction, converter cutover, canonical/CAT/translation change, or Phase 6C.1 implementation was performed.
