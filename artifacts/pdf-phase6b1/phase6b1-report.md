# Phase 6B.1 final closure audit

## Classification: PARTIAL

The real normal CELEX 32008L0050 import produced a genuine, correlated, immutable non-authoritative shadow record. The run completed in 1,200 ms with validation PASS. The frozen official PDF independently re-downloaded at 499,951 bytes and matched the shadow source SHA-256 exactly. Code and tests prove the same `official.bytes` buffer was uploaded and then submitted to shadow after version persistence.

However, the authoritative stored PDF could not be independently downloaded in this audit: the configured anonymous Supabase client correctly returned no row under RLS without the authenticated browser session. Its SHA-256 therefore could not be computed directly. The task explicitly requires exact equality against the persisted object and mandates PARTIAL when that cannot be independently established.

`active_docx_sha256: null` is expected and is not a defect. CELEX import persists a PDF; active DOCX creation is a later, separate action. The shadow DOCX was temporary, non-authoritative, and never entered persistence or downstream processing.

Prior attempts are accounted for: 32009L0104 predates durable evidence and remains unverifiable; 32014L0035 exposed the missing CELEX wiring fixed in Phase 6B.3; 32016L0210 was never imported because resolution failed; 32008L0050 is the sole successful real operational shadow run.

Phase 6B cannot be closed as PASS until the correlated persisted PDF is downloaded through an authenticated read-only context and its SHA-256 is shown equal to `37e412c00e79cf64f5f2a9f104abb9369ecf88814fd577070032300907fb1c87`.
