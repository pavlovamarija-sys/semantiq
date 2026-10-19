# CAT artifact lineage

`STUDIO_SDLXLIFF_SOURCE` is the immutable authoritative CAT skeleton for V1. Its generation records the source `VALIDATED_DOCX`, canonical snapshot ID, source/target languages, Studio version/project settings where known, byte SHA-256, normalized skeleton hash, source-unit hash, unit/segment counts and inline-code validation.

MK1 injection creates `STUDIO_SDLXLIFF_MK1`; it never updates the source artifact. Relationships point to the untouched CAT artifact and canonical snapshot. `artifact_translation_versions` enumerates every injected translation version/TU mapping.

Human review upload creates `STUDIO_SDLXLIFF_REVIEWED`, related to the exact untouched skeleton and, when applicable, MK1 artifact. Validate skeleton hash, source-unit identity/order, languages and inline codes before availability. Repeated reviews are new generations.

`TARGET_DOCX` is retained only when needed for delivery/audit. It relates to the reviewed CAT artifact, canonical snapshot and reconciliation generation. Studio metadata belongs in typed generation columns where queried and JSON only for vendor-specific settings.
