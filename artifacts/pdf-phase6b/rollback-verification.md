# Phase 6B rollback verification

## Classification: PASS

The normal development configuration is healthy: `http://127.0.0.1:3000/` returned HTTP 200 and `http://127.0.0.1:8000/health` returned HTTP 200 with `{"status":"ok"}`.

The Next.js implementation has safe default-OFF behavior. `runShadowReconstruction` immediately returns unless `PDF_TO_DOCX_SHADOW_RECONSTRUCTION` is exactly the case-sensitive string `true`. An absent value, `false`, `False`, `1`, or any other value does not enable shadow. The Python worker does not read or own this flag.

The live Next.js process environment cannot be independently enumerated from this CLI without process-level access that is not available. Current configuration is therefore established by the user's explicit stop and fresh restart after assigning `PDF_TO_DOCX_SHADOW_RECONSTRUCTION=false`, combined with the exact parser and passing orchestration test.

The Phase 6B.3 orchestration suite passed 5/5. Its OFF case confirms no fetch to `/shadow/reconstruct` and no evidence file, while the authoritative result remains unchanged. The hook occurs only after successful authoritative persistence, so shadow cannot rescue an active failure; ON/OFF changes only observation.

Historical evidence remains preserved at `artifacts/shadow-runs/13c13a7c-ef87-47f7-8844-58be5e8de75e.json` with SHA-256 `957a8a2e4ae7696b62ba8375cfc4492cbb44fa9e067045bb2dce5f1e74b748be`. Its existence records the completed controlled run and is not evidence that shadow is currently enabled.

No CELEX import, shadow endpoint invocation, reconstruction, conversion, database/RLS operation, code change, environment change, CAT/translation action, or Phase 6C work occurred during this audit.
