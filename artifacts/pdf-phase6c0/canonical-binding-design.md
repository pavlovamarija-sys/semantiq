# Canonical snapshot binding

Introduce `canonical_snapshots` as the immutable root for future normalized `DocumentNode`, `TranslationUnit`, and `InlineCode` rows. Each snapshot belongs to one document version and one available `VALIDATED_DOCX` artifact; it also records the DOCX SHA-256, extractor/schema version, source language, normalized source hash, status and creation identity.

Future canonical rows carry `canonical_snapshot_id`; stable node/TU/code IDs are unique within that snapshot. Production segments must either gain `canonical_snapshot_id` plus canonical TU identity or be superseded by dedicated canonical tables. Existing `document_segments` continues unchanged until the canonical migration.

Re-extraction always creates a new snapshot and rows. It never rewrites an available snapshot. A snapshot becomes consumable only after all nodes/TUs/codes and counts are inserted transactionally and its source hash equals the validated DOCX artifact hash.

Translation runs and CAT projections bind to the snapshot ID, not “latest document version.” This makes a snapshot reproducible and permits deterministic stale checks when a newer reconstruction exists.
