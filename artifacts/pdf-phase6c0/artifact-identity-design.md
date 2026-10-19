# Artifact identity design

`artifact_id` (UUID) is the stable identity. Filename, path, hash, generation number, and type are attributes and never substitutes for the ID.

Required columns are: `id`, `project_id`, `document_id`, `document_version_id`, `processing_generation_id` (nullable for externally acquired source/CAT uploads), `artifact_type`, `artifact_generation`, `storage_bucket`, `storage_path`, `sha256`, `byte_size`, `mime_type`, `original_filename`, `producer_kind`, `producer_version`, `status`, `created_by`, `created_at`, and optional `available_at`/`failure_code`.

- Project/document/version columns make RLS and common queries direct and auditable. A trigger validates their consistency.
- `artifact_generation` is monotonically allocated per `(document_version_id, artifact_type)`. It is human-debuggable ordering, not identity.
- SHA-256 is lowercase 64-hex over actual stored bytes. `content_hash`/config hashes remain separate concepts.
- `status` separates reserved/uploading rows from verified available artifacts and failed/quarantined records. Only `available` artifacts may be consumed.
- Producer identity records which implementation produced bytes; variable deterministic config belongs on the processing generation.
- Storage fields are required only for byte-bearing available artifacts. Failed generations can exist without an artifact; do not create empty artifact rows merely to represent failure.

Same bytes produced by different legitimate generations receive different artifact IDs and lineage. A hash index enables deduplication checks but does not collapse audit events across projects or generations.
