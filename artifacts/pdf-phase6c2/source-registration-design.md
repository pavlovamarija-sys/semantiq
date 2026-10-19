# SOURCE_PDF registration design

`registerPersistedSourcePdf` accepts existing document/version/storage identity only after authoritative persistence succeeds. It downloads the stored object through the authenticated Supabase client, requires `%PDF-`, computes SHA-256 and size from those bytes, checks the expected size, and registers a completed source-registration generation plus an available `SOURCE_PDF` artifact.

Idempotency is `(project, source_registration, document-version + SHA-256)` plus artifact `(document_version, SOURCE_PDF, generation 1)`. A rerun verifies all immutable metadata. Changed bytes or storage identity fail closed; they never update the artifact. A new authoritative byte state requires a new document version.

During this additive slice, registration failure is logged and leaves a recoverable registry gap. It does not roll back or corrupt the already-authoritative document version/source object.
