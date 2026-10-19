# Constraints and indexes

- Scope triggers require project/document/version consistency for generations and artifacts.
- Composite `(id, project_id)` foreign keys prevent generation, input, and relationship cross-project references.
- SHA-256 values require 64 lowercase hexadecimal characters; byte size is positive.
- Lifecycle and vocabulary values use checks from the accepted design.
- Artifact generation and generation attempt numbers are unique within their scope.
- Storage `(bucket,path)` is unique; upload uses `upsert:false`.
- Generation idempotency is unique by `(project_id,generation_kind,idempotency_key)`.
- A partial unique index permits only one active generation for the same version/kind/input fingerprint.
- Relationship primary/unique keys reject duplicate role/ordinal and duplicate parent-child semantics.
- A recursive trigger rejects lineage cycles and self-links are rejected by a check.
- Lookup indexes cover document/version/type, available hash, generation, generation recency, and parent lineage traversal.
