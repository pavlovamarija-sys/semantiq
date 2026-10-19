# Phase 6B report

## Overall classification: PASS

The final source-identity blocker is closed. The user retrieved the already-imported CELEX 32008L0050 source PDF through the application's normal authenticated source-PDF download/open function and placed it in the manual-verification directory. Codex did not authenticate to Supabase or access the user's browser cookies; authentication and retrieval were user-mediated, followed by independent local byte inspection and hashing by Codex.

Exactly one plausible PDF was present: `e66411bf-204a-4d08-8035-35a161cdc0cf.pdf`, matching the correlated version/import ID. It is 499,951 bytes, starts with `%PDF-`, and opens as a 44-page PDF. Its independently computed SHA-256 is `37e412c00e79cf64f5f2a9f104abb9369ecf88814fd577070032300907fb1c87`, exactly equal to the real shadow run's source SHA-256.

Combined evidence now proves that real production CELEX orchestration invoked shadow, durable correlated evidence exists, authenticated persisted source bytes match the shadow source exactly, shadow reconstruction and ordered-token integrity passed, active authority and failure isolation remained intact, shadow remained non-authoritative, no downstream contamination occurred, and no reconstruction tuning was performed for the controlled document.

Earlier PARTIAL attempts are preserved in the evidence history: unauthenticated access was correctly blocked by RLS, and the CLI lacked the browser session needed by the existing authenticated route. No security control was weakened to obtain PASS.

## Rollback verification

Rollback is PASS. After the user stopped both development processes and restarted Next.js with `PDF_TO_DOCX_SHADOW_RECONSTRUCTION=false`, the application returned HTTP 200 and the worker health endpoint returned HTTP 200/healthy. Direct live-process environment enumeration was unavailable, but the implementation enables shadow only for the exact string `true`; explicit `false` is disabled. The Phase 6B.3 orchestration suite was rerun and passed 5/5, including the OFF case proving no shadow request and no evidence creation while preserving the active path.

The successful controlled-run evidence remains intact at `artifacts/shadow-runs/13c13a7c-ef87-47f7-8844-58be5e8de75e.json`; it was not deleted or interpreted as current enablement. Its SHA-256 at rollback verification was `957a8a2e4ae7696b62ba8375cfc4492cbb44fa9e067045bb2dce5f1e74b748be`.

Phase 6B is formally closed with shadow mode disabled. Phase 6C was not started during this verification.
