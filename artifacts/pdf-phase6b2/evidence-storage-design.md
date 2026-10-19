# Evidence storage design

Each enabled shadow invocation writes one immutable JSON file to `artifacts/shadow-runs/<shadow_run_id>.json`, unless `PDF_TO_DOCX_SHADOW_EVIDENCE_DIR` overrides the directory. The write uses a unique temporary file with `wx`, then an atomic rename. Existing files are never overwritten. Evidence is diagnostic and non-authoritative; no PDF/DOCX bytes or full text are stored.
