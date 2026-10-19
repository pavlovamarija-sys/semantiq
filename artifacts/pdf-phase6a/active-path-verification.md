# Active-path verification

The active path remains unchanged. `workers/pdf-to-docx/app/main.py` still exposes the existing `/analyze/pdf` and `/convert/pdf-to-docx` handlers and imports no `app.reconstruction` module. `src/infrastructure/document-conversion/pdf-to-docx.ts` still calls `/convert/pdf-to-docx`; no new endpoint or feature flag was added. CELEX actions, document actions, storage, database, canonical extraction, CAT and translation code were not modified.

The new reconstruction package is imported only by the Phase 6A regression runner/tests. Existing worker tests pass 34/34 and TypeScript typecheck passes.
