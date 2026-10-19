# Current production pipeline audit

The current path is:

`celex-actions.ts` resolves/downloads and persists the official PDF → `document-actions.ts` transforms a PDF → `pdf-to-docx.ts` calls the Python worker → the derived DOCX is stored as a document/version → `translation-actions.ts` extracts flat `document_segments` → later translation/MK1 actions consume those segments.

Key code:

- `src/app/app/projects/[projectId]/celex-actions.ts`: `resolveCelexDocuments`, `importCelexDocuments`; CELEX metadata, duplicate checks, PDF analysis, Storage upload and `documents`/`document_versions` writes.
- `src/app/app/projects/[projectId]/document-actions.ts`: upload, `transformPdfDocument`, source download, worker analysis/conversion, temporary files, `validateDocx`, derived-document/version writes and `transformation_status`.
- `src/infrastructure/document-conversion/pdf-to-docx.ts`: `analyzePdf`, `convertPdfToDocx`, `validateDocx`; worker URL/token, ten-minute timeout, response attestations and bounded errors.
- `workers/pdf-to-docx/app/main.py`: authenticated `/health`, `/analyze/pdf`, `/convert/pdf-to-docx`; PyMuPDF integrity/extraction and `ConversionService`.
- `src/app/app/projects/[projectId]/translation-actions.ts`: `ensureDocumentSegments`, raw DOCX extraction, flat segment insertion, `document_versions.extraction_status`, and MK1 orchestration.

Storage uses the private `source-documents` bucket. Current paths are user/project/document/version for source and derived files; DOCX is a derived document linked by `derived_from_document_id` and `derivation_type='pdf_to_docx'`. Current database state is distributed across `documents`, `document_versions`, `document_segments`, translations and translation-version tables. `documents.transformation_status` is `processing|ready|failed|needs_review`; extraction status is `pending|processing|completed|failed`.

Current safeguards include PDF signature/size checks, worker authentication, worker timeouts, source analysis integrity reports, DOCX OOXML/content-type/header attestations, DOCX validator execution, cleanup on failed writes, and explicit failure/needs-review status. There is no atomic artifact manifest tying source hash, typed model hash, decisions, DOCX hash and canonical projection together. The current canonical extraction also assumes paragraphs are the principal structure and does not preserve native PDF table provenance.
