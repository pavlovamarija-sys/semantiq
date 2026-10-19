# Translation lineage

Add `artifact_translation_versions` with artifact ID, canonical TU ID (nullable only for legacy), translation-version ID, role, and ordinal. For MK1 CAT, role is `injected_mk1`; for reviewed reconciliation, role is `reconciled_mk2`; exports use `rendered_target`.

This proves “translation version X was injected into artifact Y” without copying text into artifact metadata. The reviewed CAT artifact plus reconciliation generation produces new human-origin translation versions; mappings record which reviewed CAT unit produced each version. A reconciliation report artifact captures unmatched/stale/QA outcomes.

Approval remains separate. Artifact availability never changes `translations.status`, `translation_versions.review_status`, TM trust, or terminology status. Only an explicit approval transaction may approve eligible human/reviewer versions and publish trusted TM/terminology, with the reconciliation generation and reviewed artifact included in approval provenance.

Existing `document_translation_run_segments` remains the MK1 run mapping during migration and can be back-referenced when creating CAT lineage.
