# Proposed schema rationale

## `processing_generations`

Identity/project/document/version locate the execution and support RLS. Kind/number separate retries and operation classes. Idempotency key and input fingerprint prevent duplicate active work. Producer/algorithm/config fields make results reproducible. Explicit gate/metric columns serve common operational queries; variable config stays JSON. Status/timestamps/error model lifecycle without pretending failures are artifacts.

## `document_artifacts`

This is the generalized immutable byte registry. Artifact type/generation describe the role; storage/hash/size/MIME verify actual bytes; producer and generation link explain origin. Project/document/version are intentionally denormalized for direct ownership and lookup, with consistency triggers. Available rows require complete byte identity. Filename is descriptive only.

## `processing_generation_inputs`

Generations need exact immutable input identities and expected hashes before outputs exist. This table supports multiple ordered/role-labelled inputs and deterministic stale checks.

## `artifact_relationships`

Artifacts also need durable derivation/supersession lineage independent of an execution. A join table, rather than one parent column, supports CAT/package/reconciliation multi-input derivations. Composite project FKs prevent cross-project edges.

## `canonical_snapshots`

The canonical model needs an immutable root before node/TU/code rows are introduced. It binds exact validated DOCX bytes to extractor/schema versions and normalized counts/hashes. Node tables are deliberately deferred to the canonical implementation slice.

## `artifact_canonical_bindings`

CAT artifacts require snapshot, skeleton/source hashes, target language and variable Studio metadata. Keeping this out of the generic artifact table avoids nullable CAT-only columns.

## `artifact_translation_versions`

This proves exact MK1 injection, MK2 reconciliation and target rendering at TU granularity. It references existing immutable translation versions while using a future canonical TU key scoped by snapshot. Artifact persistence itself confers no trust.

## Deliberate exclusions

No global content-addressable blob table, workflow engine, generic arbitrary relationship JSON, organization/team layer, billing, or replacement canonical node schema is proposed. `document_translation_artifacts` remains during migration but should become read-only legacy once all consumers move.
