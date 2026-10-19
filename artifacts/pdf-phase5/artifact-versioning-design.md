# Artifact versioning design

Introduce an application-level artifact manifest before migration. Each artifact has `artifact_id`, import/document/version IDs, artifact type, generation, SHA-256, byte size, created time, producer/version, parent artifact IDs and validation status. Suggested types: `source_pdf`, `extraction`, `typed_model`, `reconstruction_decisions`, `validation_report`, `validated_docx`, `canonical_projection`, `studio_skeleton`, `mk1_sdlxliff`, `mk2_sdlxliff`.

Storage objects are immutable (`upsert=false`) under document/version/artifact-generation paths. Database rows are append-only for material artifacts; a current pointer may be updated only after a complete validated generation. Filenames are display metadata, never identity. A failed generation remains auditable and cannot replace a ready generation.

SDLXLIFF source identity, MK1 and reviewed MK2 must be separate artifacts with parent links and explicit status. Deletion should be retention-policy controlled, not part of ordinary retry cleanup.
