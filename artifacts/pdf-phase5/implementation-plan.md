# File-by-file implementation plan

| File/area | Current responsibility | Proposed change | Risk/tests |
|---|---|---|---|
| `workers/pdf-to-docx/app/main.py` | Worker HTTP/auth and legacy conversion | Add versioned reconstruction endpoint/service contract after library extraction | Medium; worker API and fixture tests |
| `workers/pdf-to-docx/app/` new reconstruction modules | None in production | Move only generalized typed model, inference, decisions, renderer and validators | High; all fixtures, synthetic cases, integrity |
| `src/infrastructure/document-conversion/pdf-to-docx.ts` | Worker calls and DOCX checks | Add typed result/artifact-manifest contract and versioned endpoint handling | Medium; mocked worker/error tests |
| `src/app/.../document-actions.ts` | Transformation orchestration/status/storage | Persist immutable artifact generations and gate downstream publication | High; rollback/idempotency/storage tests |
| `src/app/.../celex-actions.ts` | CELEX PDF import | Preserve source hash/artifact identity; do not reconstruct inline | Medium; import/retry tests |
| `src/app/.../translation-actions.ts` | Flat DOCX extraction/segments/MK1 | Project validated typed model to canonical nodes before CAT/MK1 | High; canonical mapping and source-identity tests |
| `src/application/documents/` | Readiness/domain helpers | Add typed artifact/readiness contracts, no UI assumptions | Low/medium; unit tests |
| `supabase/migrations/` new migration | Existing document/version schema | Add append-only artifact manifest/provenance tables only after design approval | High; RLS, rollback, migration tests |
| `scripts/docx_validator.py` | DOCX structural/count validation | Extend for typed gate attestations without weakening existing checks | Medium; XML and integrity tests |

No production file should be changed until Stage 1 library extraction and Stage 2 shadow comparison are complete. Existing production behavior remains the rollback baseline.
