# Migration compatibility

Adopt additively; do not repurpose existing IDs or columns.

1. Create new tables/policies/bucket with no production reads or writes.
2. Register existing `document_versions` as legacy `SOURCE_PDF` or `VALIDATED_DOCX` artifacts by hashing actual stored bytes. Preserve their current paths; new path format applies only to new artifacts.
3. Backfill `document_translation_artifacts` as legacy artifacts where bytes verify. Preserve old rows and download routes during dual-read.
4. Historically unknowable producer/config/HTTP lineage remains null only on rows marked `legacy_backfill`; source/document/version/path/hash must still be known for availability.
5. Dual-write one artifact class at a time behind server-side rollout controls, compare results, then switch reads. Rollback stops new writes and returns to legacy reads; no new table must be dropped.
6. Canonical/CAT schema adoption occurs after source/reconstruction artifact primitives are stable. Existing segments/translations/TM remain valid.

Deletion RPCs must not be altered until new artifact FK/retention semantics are deliberately integrated. Use `ON DELETE RESTRICT` for new immutable lineage so accidental legacy tree deletion fails visibly rather than cascading audit history.
