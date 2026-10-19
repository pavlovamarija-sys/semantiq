# Live CELEX import call graph

## Before Phase 6B.3

1. `CelexImport` in `celex-import.tsx` submits `resolveCelexDocuments`, then `importCelexDocuments` as Next.js Server Actions.
2. `resolveCelexDocuments` calls `resolveEnglishCelexPdf` to resolve official English PDF metadata.
3. `importCelexDocuments` authenticates the user and project, validates transferred CELEX/resolved-PDF fields, and calls `downloadEnglishCelexPdf`.
4. `analyzePdf` in `pdf-to-docx.ts` sends the PDF from the Next.js server to `POST /analyze/pdf` on the FastAPI worker with bearer authentication.
5. The action creates/reuses document IDs, uploads the authoritative PDF to Supabase Storage, and inserts/updates `documents` and `document_versions`.
6. The action marks the CELEX item imported and revalidates the project page.

This path did **not** call `convertPdfToDocx` or `runShadowReconstruction`. PDF→DOCX is a separate user action: `DocumentControls` → `transformPdfToWorkingDocument` → `POST /convert/pdf-to-docx` → active DOCX validation → `runShadowReconstruction` → active DOCX persistence/read-back validation/readiness.

## After the minimal repair

After successful authoritative PDF upload and document-version persistence, both the primary-document and corrigendum branches call:

`runShadowReconstruction(official.bytes, filename, { documentId, importId: versionId, celex })`

The helper, owned by the Next.js process, checks `PDF_TO_DOCX_SHADOW_RECONSTRUCTION` at request time. Exact value `true` sends `POST /shadow/reconstruct` to the FastAPI worker. The worker authenticates with `PDF_TO_DOCX_SERVICE_TOKEN`, reconstructs into a temporary directory, returns diagnostics/hashes, and deletes its temporary DOCX. The Next.js helper writes the returned summary atomically as non-authoritative evidence.

The CELEX import remains a PDF acquisition/analysis/persistence operation; this repair does not make active PDF→DOCX conversion part of import. Shadow execution is post-persistence observation and cannot rescue or replace an active import failure.
