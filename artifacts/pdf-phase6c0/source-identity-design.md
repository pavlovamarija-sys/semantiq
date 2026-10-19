# Source identity design

Register each authoritative source as a `SOURCE_PDF` artifact tied to its existing `document_version`. Persist actual-byte SHA-256, size, MIME, language and storage identity. Keep CELEX and logical relationships on `documents`; keep retrieval-specific facts in explicit artifact/source fields or constrained provenance JSON: requested URL, final resolved URL, retrieval time, HTTP status, content type/length/ETag where available, provider and source type (`celex`, `user_upload`).

Corrigenda remain distinct `documents` linked by `parent_document_id`; each has its own source version/artifact/hash. Language is explicit and must agree with document/project rules.

A re-download never overwrites. If bytes match, record a retrieval observation without duplicating bytes if policy permits; if bytes differ, create a new document version and `SOURCE_PDF` artifact, retaining the previous version. The application must not silently move a document-version pointer to new bytes.

For legacy versions, backfill from actual Storage bytes—not metadata. Register the existing bucket/path, compute hash/size/MIME, and mark provenance `legacy_backfill`. If bytes are inaccessible/missing, create no available artifact; record a failed backfill generation. Historically unknowable HTTP metadata remains null.
