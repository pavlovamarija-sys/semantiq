# Phase 6C.7 report

## Classification: PASS

The isolated immutable MK1 generation stage is implemented, deployed, and regression-clean. It is intentionally not invoked automatically. The first authenticated controlled run created generation `1ccd6fd8-c75e-4515-84c5-5e7511f64297`, but its first provider request was rejected with HTTP 429 `credit_balance_exhausted`.

The stage binds the exact canonical snapshot and CAT projection, translates all 265 ordered canonical TUs in bounded GPT-5.6 batches, preserves protected inline codes, populates the untouched Studio-derived skeleton while retaining six excluded page-break units, renders an MK1 DOCX from the exact validated DOCX, uploads both outputs immutably, verifies actual-byte readback, and atomically finalizes only after database integrity gates pass.

Validation completed:

- 34 focused canonical/CAT/artifact/MK1 tests passed.
- 6 Phase 6C.7 unit/contract tests passed.
- TypeScript passed.
- The production Next.js build passed with webpack and includes `/api/projects/[projectId]/mk1-generations`.
- 5 CELEX shadow orchestration regressions passed.
- 11 focused worker/canonical/DOCX regressions passed.
- Migration `20261026000000_canonical_mk1.sql` deployed successfully.

The default Turbopack build encountered a pre-existing filesystem access denial at `.tmp/pytest-phase6a`; the webpack production build completed successfully. ESLint 9 could not run because this repository has no `eslint.config.*` flat configuration. Neither tooling issue was changed as part of this phase.

The failed generation contains zero MK1 runs, completed batches, translations, or output artifacts. One provider request was attempted and zero completed; there is no application evidence of billable usage. The identical request is correctly blocked before another provider call.

A new producer version, `canonical-mk1-phase6c7-v3-inline-code-preflight`, is prepared but not executed under request key `phase6c7-controlled-32006l0114-v3-inline-code-preflight`. It retains GPT-5.6 with high reasoning and adds a 4,000-output-token ceiling to each of the 27 bounded requests. Deterministic preflight passes all 265 TUs and all three protected codes before any provider request; all three are literal Studio line-break representations. The original SDLXLIFF source and skeleton remain the immutable input. Focused tests pass, including direct verification of the model, reasoning setting, output ceiling, literal line-break serialization, and preflight rejection behavior without a real API call.

The v2 controlled generation `ad3a8f31-663d-460a-af31-e0fc8c985db3` completed all provider batches but failed before persistence because Studio represented three canonical line-break codes as literal newlines rather than `<x/>` tags. The renderer assumption was corrected in `canonical-mk1-phase6c7-v3-inline-code-preflight`. All 265 Studio mappings and all three codes pass preflight before provider construction. Ten focused tests pass. The failed v2 generation remains unchanged.

Remaining PASS gate: after API credits are restored, an explicitly authorized new immutable generation with a new request key must perform the GPT-5.6 generation, followed by independent readback and verification of the persisted 265 MK1 translations, MK1 SDLXLIFF, MK1 DOCX, lineage, idempotency, and project isolation. The failed generation must remain unchanged as audit evidence. Manual Trados quality or linguistic approval is not claimed.

No MK2, approval, trusted-TM ingestion, automatic invocation, or production cutover was introduced.

Durable per-batch checkpoints and provider token-usage accounting were assessed and deliberately deferred until after this controlled run. The current append-only immutable generation contract records validated batches after generation; safely adding checkpoints requires a separate append-only attempt/checkpoint schema and atomic finalization design. No partial checkpoint change was introduced before the paid run.

## v3 controlled-run result

The v3 request created failed generation `b2d41b63-8b63-4b7a-8fa3-df65e5ee64d3`. All 27 bounded GPT-5.6 calls reached completion before DOCX reconstruction failed. The exact missing segments were ordinals 158, 159 and 160, the three Annex I citation TUs containing protected line breaks. The DOCX reader discarded `<w:br/>` between text runs, causing the canonical source match to fail. No run, batch, translation, or output artifacts were persisted, and exact provider token usage was not durably recorded.

The deterministic fix preserves `<w:br/>` as a newline during source extraction. Offline validation now maps the affected citations and all 265 canonical TUs exactly once and in order. Focused tests: 14 passed, 0 failed. No paid retry was made. The v3 generation remains immutable evidence; recovery requires a new authorized request key.

## Durable checkpoint implementation

The append-only checkpoint migration `20261027000000_canonical_mk1_checkpoints.sql` is now deployed to the linked Supabase project and catalog-verified. Runs are reserved before provider calls; each validated batch records immutable TU/source-hash/target/token/provider evidence before the next request. Completed checkpoint maps are validated for exact batch/TU identity and can be reused by the batch generator without repeating paid calls. The failed v1–v3 generations remain untouched.

Implementation readiness remains **PARTIAL** pending an authenticated operational resume path and controlled rollback probes for database insertion, duplicate rejection, cross-project isolation, and mutation protection. No new request key has been executed.

## Authenticated RLS gate

The local migration-order defect was fixed by removing the premature `audit_status` predicate from the 070 replay definition; migration 110 restores the audit-gated function after migration 100 adds the column. A forward-compatible local grant/policy migration supplies only the privileges required for RLS evaluation. Local reset from zero now passes.

Two local Auth users and projects were tested with real JWTs. Same-project requests reached the checkpoint foreign-key boundary (proving RLS allowed the project), while cross-project requests returned HTTP 403 / SQLSTATE 42501. Effective user endpoints returned HTTP 200. Fixtures were deleted. Production was not touched. The authenticated RLS gate is **PASS**.

Producer version `canonical-mk1-phase6c7-v4-durable-checkpoints` and the new request key are prepared in `v4-controlled-run-instructions.md`. No v4 request or paid model call was executed.

## Final production readiness

Linked project `yswudlrbswpwifbgqldh` (`EU Acquis AI App`) had only migration `20261028000000` pending. It was reviewed and deployed. Production catalog readback confirms authenticated checkpoint SELECT/INSERT privileges, direct project-owner RLS checks, and unchanged immutable protection. Historical v1–v3 failures remain unchanged. Next.js and worker health both return HTTP 200. Twelve focused tests and TypeScript pass. v4 is ready but unexecuted.

## v4 controlled-run finalization failure

The v4 generation `01eb331b-427d-4e77-b9ab-e40412bdef0a` completed all 27 provider calls and durably stored 27 checkpoints and 265 translations before atomic finalization failed. Recorded usage is 17,890 input plus 23,432 output tokens. Two serialized artifact records exist but remain `failed`, so no MK1 output became authoritative.

The failure was an unqualified `digest(...)` call inside `complete_canonical_mk1`: `pgcrypto` was installed under `extensions`, while the function intentionally uses an empty search path. Forward migration `20261029000000_fix_mk1_digest_schema.sql` now calls `extensions.digest(...)`. Clean local replay, rolled-back local Unicode hashing, linked deployment, linked catalog/hash probes, all 265 persisted target hashes, eight focused tests and TypeScript pass.

The failed v4 generation and checkpoints remain unchanged. The same request key cannot resume because the API rejects immutable failed generations before provider invocation. A separately authorized recovery generation must reuse and validate the exact 27 checkpoints without model calls. Phase 6C.7 remains **PARTIAL** pending recovery and independent final-artifact verification.

## Immutable v4 checkpoint recovery readiness

A separate authenticated recovery-only endpoint and deterministic orchestration are implemented. The path validates all checkpoint, canonical, CAT, artifact, model, prompt, source-hash, target-hash and protected-code identities before reserving a new immutable generation. It copies the 27 checkpoints, 265 translations and original token/provider metadata into a new foreign-key-linked run, renders from the authoritative DOCX and Studio skeleton, readback-verifies both outputs and finalizes them atomically. There is no GPT provider dependency or fallback.

Migration `20261030000000_mk1_checkpoint_recovery_lineage.sql` passed clean local replay and is deployed to the linked database. Forty-one focused regressions including recovery idempotency, TypeScript and a webpack production build pass. The controlled recovery has not been invoked, so Phase 6C.7 remains **PARTIAL** until the resulting persisted artifacts and lineage are independently verified.

## Recovery persisted-state verification

Authenticated recovery generation `0aef4e29-711a-4cd1-9e9d-1d3f4bc560a2` completed with validation, coverage and ordering PASS. Run `7ec58b3d-5829-48da-83e5-9146097dc06b` is available and explicitly references failed v4 generation/run `01eb331b-427d-4e77-b9ab-e40412bdef0a` / `63a18859-19eb-4b91-afc3-0221b0544f1a`.

Database readback confirms 27 checkpoints, 265 translations, 265 CAT mappings and three protected codes with zero identity, order, source-hash, target-hash or protected-code errors. SQL set comparison found zero differences between source and recovered checkpoints/translations. Exactly one recovery generation and run exist for the idempotency identity. Historical v1–v4 failures remain unchanged. Recovery configuration forbids provider calls and preserves the original 17,890 input and 23,432 output token accounting.

Both output artifacts are available with atomic lineage, but independent actual-byte download remains pending because the agent has no authenticated browser cookie and anonymous storage access is correctly denied by RLS. Phase 6C.7 remains **PARTIAL** until the authenticated downloads are supplied for byte hashing and structural parsing.

## Final actual-byte readback

Both authenticated downloads match persisted SHA-256 and byte size exactly. The SDLXLIFF passes: 265 ordered targets, six preserved empty page-break units, exact untouched Studio skeleton after target removal, three protected codes, no omissions, duplicates, mismatches or Unicode corruption. Forty-three source-identical targets are invariant structural identifiers rather than untranslated lexical units.

The DOCX is valid OOXML and preserves 273 paragraphs, 3 tables, 48 rows, 100 cells, 6 page breaks, section structure and all 265 ordered TU placements. However, ordinals 158–160 each contain two line breaks where the persisted target has one. The renderer inserted a target `<w:br/>` while retaining the source paragraph's existing `<w:br/>`. This is a real deterministic output defect, so Phase 6C.7 remains **PARTIAL**, not PASS. Existing outputs remain immutable; correction requires a new artifact generation.

## DOCX line-break correction readiness

The renderer now reuses existing source text-wrapping break nodes and preserves surrounding runs. It fails closed on ambiguous, adjacent, terminal, page-break or count-mismatched layouts. A separate authenticated `target_render` correction path creates only a new DOCX, records rendered-from and supersedes lineage, and leaves the completed recovery, translations, checkpoints and validated SDLXLIFF unchanged.

Clean local migration replay and linked deployment pass. Forty-six focused tests, TypeScript and production build pass. Synthetic and real-data offline preflights verify 265/265 TUs, three protected breaks, 273 paragraphs, 3 tables, 48 rows, 100 cells, 6 page breaks and one section. The controlled correction has not been executed; Phase 6C.7 remains **PARTIAL** pending actual persisted-byte verification.

## Corrected DOCX controlled-run verification

The authenticated correction completed as generation `d3500ee6-2040-40ea-a20c-01e784074c63` with validation, source coverage and ordering marked PASS. It created one available `TARGET_DOCX`, artifact `15e2967c-6cd6-42e4-b3d1-e93cf9f28890`; the idempotency identity resolves to exactly one generation. Immutable lineage is present from the authoritative validated DOCX (`rendered_from`) and the flawed recovered DOCX (`supersedes`). Its configuration forbids provider calls, confirming zero additional GPT-5.6 calls.

Final closure is fail-closed. The persisted artifact record reports 887,530 bytes but SHA-256 `220155a219b20a735b7f8ec999fc1dbbfc1862e5c65319303f2229121b9fa25b`, not the required `e87ccb54bfa3878a107889e9bdc071c6977a4f213c11da88a8639018f536c088`. No downloaded corrected DOCX is present under `artifacts/pdf-phase6c7/`; only the earlier 887,584-byte flawed recovery DOCX is available. Actual corrected bytes therefore could not be independently hashed or parsed, and the 265-TU, protected-break, OOXML structure and formatting gates cannot be claimed from metadata alone.

Phase 6C.7 remains **PARTIAL**. Download the exact persisted artifact through the authenticated artifact route, then explain the hash discrepancy and run independent byte and OOXML validation.

A subsequent verification request named `artifacts/pdf-phase6c7/corrected-docx-readback/32006L0114-mk1-corrected.docx`, but the file was still absent. A recursive workspace search found no file with the expected 887,530-byte size or corrected filename; the normal Chrome Downloads directory also contained no matching file. No actual-byte or structural claim was added.

## Final corrected DOCX actual-byte verification

The corrected DOCX was subsequently supplied under `artifacts/pdf-phase6c7/recovery-readback/32006L0114-mk1-corrected.docx`. Its independently computed SHA-256 is `220155a219b20a735b7f8ec999fc1dbbfc1862e5c65319303f2229121b9fa25b` and its size is exactly 887,530 bytes, matching immutable artifact `15e2967c-6cd6-42e4-b3d1-e93cf9f28890`.

CRC-checked OOXML parsing and database-backed comparison validate all 265 persisted translations exactly once in ordinal order 0–264, with no omitted, duplicated, reordered or mismatched targets. Protected line-break TUs 158, 159 and 160 each contain exactly one target newline and one non-page `<w:br/>`. The document preserves 273 paragraphs, 3 tables, 48 rows, 100 cells, 6 page breaks and 1 section. Scrubbing only `<w:t>` payloads makes source and target `document.xml` structurally identical, and all non-document package parts remain unchanged.

The offline candidate hash differed because JSZip archive serialization is not byte-deterministic. Fresh in-memory reconstructions had the same size but different archive hashes, while `word/document.xml` was byte-identical (`1e0b3e866f2e4ba951ef771ed07c9165a1a1090440e1dd73c20b197f085c54ca`) and every OOXML file-entry payload matched. The difference is ZIP metadata/directory-entry serialization, not document content.

Immutable lineage passes: the corrected artifact is `rendered_from` validated DOCX `b0e8fec5-91c8-4755-87a4-ff8f6dd8d307` and `supersedes` flawed DOCX `d67fe184-9227-40e1-81ef-082f6249608a`. Exactly one correction generation exists. The validated SDLXLIFF remains unchanged at SHA-256 `2c00162dd6545a51f23fcbf1fe2df8c60a11ac0d4c95abd67614703517ad5639`. The provider-free correction made zero additional GPT-5.6 calls. Seven focused regressions pass.

All Phase 6C.7 gates now pass. **Phase 6C.7 is formally PASS.** No MK2 or production cutover was performed.
