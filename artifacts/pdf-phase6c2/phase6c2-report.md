# Phase 6C.2 report

## Classification: PASS

The immutable foundation was safely deployed and runtime-verified. Ten authoritative PDF versions were inventoried. The one candidate whose exact persisted bytes were legitimately available was registered idempotently; `32008L0050` matches the expected SHA-256 exactly. A second run created no duplicate. Existing storage bytes and paths were untouched.

The remaining nine candidates cannot be downloaded by this CLI under Storage RLS because it has neither the user's authenticated browser session nor a service credential. They are explicitly `UNAUTHORIZED`, not skipped or substituted with EUR-Lex downloads. This is the sole material blocker to complete historical backfill and therefore requires PARTIAL rather than PASS.

Future successful primary and corrigendum CELEX imports now download their just-persisted authoritative object, validate PDF signature, hash actual bytes, and idempotently register `SOURCE_PDF`. Registration failure leaves existing source persistence authoritative and recoverable. No reconstruction, DOCX, canonical, CAT, SDLXLIFF, or translation artifact adoption occurred.

Validation: new tests 16/16, 6C.1 tests 16/16, CELEX orchestration 5/5, worker 38/38, three reconstruction fixtures PASS, TypeScript PASS. Broad suite: 87 PASS and the same two unrelated legacy-TM fixture failures.

No Phase 6C.3 work was started.

## Phase 6C.2A history

Access auditing confirmed that `32008L0050` was available only through retained bytes from a prior user-mediated authenticated download. The remaining objects use the same protected storage design and require the user's browser session. Phase 6C.2 remains PARTIAL pending nine explicit authenticated downloads listed in `artifacts/pdf-phase6c2a/manual-backfill-manifest.json`. No database or storage mutation occurred during this continuation.

Eight downloads are now present and valid but remain unregistered pending the complete-set gate. The missing evidence is `31990L0426R(01)`, version `57353de3-1373-4be2-97f4-91f5d23c2225`. Route investigation found no duplicate manifest entry; details are preserved in the Phase 6C.2A evidence.

## Final Phase 6C.2A completion

The complete nine-file manual set was validated before registration. Every file is non-empty, begins with `%PDF-`, and was correlated to its explicit project/document/version through the existing authenticated route plus a route-selected-version equality guard.

All nine remaining historical versions were registered against their existing Supabase paths without uploading, moving, replacing, or deleting source objects. With the previously registered `32008L0050`, the final inventory contains 10 available `SOURCE_PDF` artifacts and 10 completed source-registration generations. Postcheck reports zero missing, invalid, ambiguous, failed, or non-source artifacts.

The final idempotency run found all 10 already registered and created zero artifacts. IDs, hashes, sizes, and paths were unchanged. The identical bytes for `31990L0426R(01)` and `31990L0427R(01)` are legitimate and independently correlated to distinct identities.

Final validation passed: immutable-artifact tests 16/16, source-registration tests 16/16, CELEX orchestration 5/5, worker tests 38/38, TypeScript, and all three frozen reconstruction fixtures. The broad suite remains 87/89 with the same two unrelated legacy-TM fixture failures. No Phase 6C.3 work was started.
