# Source persistence call graph

Both primary and corrigendum imports use this sequence:

1. Resolve and download the official English PDF.
2. Analyze the PDF through the existing worker.
3. Create or recover the existing `documents` identity.
4. Upload to the existing private `source-documents` path with `upsert:false`.
5. Insert/update the existing `document_versions` row.
6. Download the exact persisted object through the authenticated server client.
7. Validate `%PDF-`, calculate SHA-256 and byte size, then idempotently register `SOURCE_PDF`.
8. Continue existing optional shadow invocation and success bookkeeping.

Steps 1–5 remain authoritative. Registration failure is logged as `source-artifact-registration-failed`; it does not delete, replace, or mark successfully persisted source bytes as failed. This creates a recoverable registry gap consistent with additive adoption.

Manual upload remains on the existing path and is not adopted in this slice because the requested production integration boundary is CELEX primary/corrigendum import.
