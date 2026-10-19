# Downstream non-authority audit

The active DOCX remains the only value written by `document-actions.ts` to `source-documents`, the only version marked ready, and the only file later downloaded by `translation-actions.ts` for extraction into `document_segments`. Shadow results are returned only to the logging helper and are not persisted, passed to extraction, canonical projection, Studio, CAT, MK1 or MK2.

The shadow endpoint never returns a DOCX body; it returns summaries and a temporary-output hash only. Shadow failures are caught by `runShadowReconstruction` and cannot alter the active transformation result.
