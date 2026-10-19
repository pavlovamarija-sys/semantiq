# Observability design

Emit one import/transformation correlation ID and structured stage events: source retrieval, extraction, typed reconstruction, table inference, boundary decisions, validation, DOCX write, canonical projection and CAT export. Include document/version/artifact IDs, CELEX, algorithm/worker version, durations and byte sizes; never log full confidential text.

Metrics: pages, regions, blocks, lines, spans, table candidates, physical/logical tables, rows/cells, MERGE/KEEP/ABSTAIN counts, unresolved diagnostics, source/DOCX tokens, missing/added/duplicated/changed/reordered counts, stage durations, retries and worker health/version. Store detailed provenance in the versioned artifact, with bounded summaries in application logs.

Every failure records stage, typed error code, retryability, parent artifact and validation state. Correlation IDs must cross Next.js, worker and storage/database operations.
