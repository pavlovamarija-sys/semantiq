# Production isolation

Repository search confirms the new artifact service is imported only by its test. `celex-actions.ts` contains no reference to `document_artifacts`, `processing_generations`, or the immutable service.

Therefore:

- CELEX import and working-document conversion retain existing persistence.
- Extraction, canonical behavior, CAT projection, translation, and legacy TM are unchanged.
- No existing artifact is migrated and no storage object is moved, renamed, or deleted.
- The new migration was not applied during implementation.
- Shadow invocation remains guarded by exact comparison to `"true"`; Phase 6B rollback state remains OFF.
- The primitives are inactive until a later explicitly authorized integration slice.
