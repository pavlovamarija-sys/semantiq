# Storage path design

Recommended new-object path:

`{owner_id}/{project_id}/{document_id}/{document_version_id}/artifacts/{artifact_id}/{sanitized_filename}`

This deliberately retains the existing owner/project leading segments required by Storage RLS, while adding version and artifact identity. The artifact UUID makes paths collision-safe and immutable; the filename is descriptive only.

Use the existing `source-documents` bucket for existing PDF/DOCX objects and initial source registration. Create a private `document-artifacts` bucket for JSON, SDLXLIFF/XML, DOCX, PDF and ZIP with class-appropriate size limits. Do not move legacy bytes merely to normalize paths.

Paths are stored verbatim in `document_artifacts` and uniquely constrained with bucket. Upload is `upsert:false`; no UPDATE Storage policy. A path must match row owner/project/document/version/artifact segments before an available transition.
