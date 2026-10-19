# Exact immutable-artifact readback

Implemented generic authenticated route:

`GET /api/projects/[projectId]/artifacts/[artifactId]`

The route authenticates through the existing cookie-backed application session, validates both UUIDs, and resolves `document_artifacts` by exact `id + project_id` under existing RLS. The caller cannot provide a bucket, object path, document, version, filename, or artifact type.

Only `available` artifacts are readable. The route downloads the persisted bucket/path from the immutable row and delegates SHA-256 and byte-size validation to the existing `readVerifiedArtifact` service. Missing or mismatched bytes fail closed and are never returned. The response uses persisted MIME type, a safe trusted metadata filename, `private, no-store`, and returns the original byte sequence without transformation.

The boundary is generic across immutable artifact types. It creates or mutates no artifact, generation, relationship, document version, or downstream state.
