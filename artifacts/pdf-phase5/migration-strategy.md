# Migration strategy

1. Extract generalized reconstruction library and contracts from the spike; add unit tests; keep inactive.
2. Add artifact-manifest persistence and feature flags without changing the current converter.
3. Run shadow reconstruction beside the current converter for selected imports. Persist only diagnostic artifacts, compare hashes/structure/integrity and do not alter user-facing output.
4. Promote the new path for allow-listed projects/documents after regression and shadow evidence. On any gate failure, mark review-required or block; do not silently fall back.
5. Expand rollout, monitor metrics, and retain the old converter behind a rollback flag until evidence and retention requirements are satisfied.
6. Remove obsolete behavior only after all active artifacts are independent of it and a documented rollback window expires.

Rollback is a feature-flagged selection of the prior converter for new generations only. Existing immutable artifacts remain unchanged; never overwrite a validated DOCX or canonical/CAT identity. Recovery retries create a new generation.
