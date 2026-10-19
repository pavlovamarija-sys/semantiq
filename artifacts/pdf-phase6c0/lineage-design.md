# Lineage design

Use both a generation link and a relationship table.

- `document_artifacts.processing_generation_id` answers which execution produced an output.
- `artifact_relationships(parent_artifact_id, child_artifact_id, relationship_type, input_role, input_ordinal)` represents exact inputs, supports multiple inputs, and remains queryable without parsing JSON.
- A direct `parent_artifact_id` column is rejected because CAT injection, packages, reports, and reconciliation are multi-input operations. A single optional `primary_parent_artifact_id` would duplicate truth and is unnecessary.

Required relationship types include `derived_from`, `rendered_from`, `extracted_from`, `projected_from`, `injected_from`, `reviewed_from`, `reconciled_from`, `packaged_from`, and `supersedes`. Parent and child must share a project; self-links and cycles are rejected by application validation, with a DB self-check.

Typical chain:

`SOURCE_PDF` → `RECONSTRUCTION_MODEL` → `VALIDATED_DOCX` → canonical snapshot → `STUDIO_SDLXLIFF_SOURCE` → `STUDIO_SDLXLIFF_MK1` → `STUDIO_SDLXLIFF_REVIEWED` → reconciliation generation/MK2 versions → approval → trusted TM.

The MK1 CAT artifact additionally relates to a canonical snapshot and exact translation versions through `artifact_translation_versions`. Reviewed CAT relates to its untouched skeleton and usually the injected parent. Reconciliation links reviewed CAT, canonical snapshot, and produced MK2 translation versions. Approval remains an explicit later event, never implied by lineage.
