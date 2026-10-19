# Minimal repair

1. Added the existing shadow invocation immediately after successful authoritative PDF upload and `document_versions` persistence in both normal and corrigendum CELEX import branches.
2. Passed `documentId`, `versionId` as `importId`, and CELEX so durable evidence can be correlated to the real import.
3. Extracted the existing shadow/evidence implementation into `shadow-reconstruction.ts` without changing reconstruction behavior or the worker contract.
4. Extended the isolation boundary to include missing/invalid service configuration and request construction. Such failures now produce a failed non-authoritative evidence record where writable and return a failed diagnostic result rather than failing active import/conversion.
5. Added `logical_table_count` and `reconstruction_version` passthrough fields already allowed by the Phase 6B.2 schema when the worker supplies them.

No reconstruction rule, active PDF bytes, DOCX converter output, database schema, persistence model, extraction, CAT, or translation behavior changed.
