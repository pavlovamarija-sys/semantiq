# Phase 6C.3 report

## Classification: PASS

The production persistence foundation is implemented and tested: exact registered source resolution, source byte verification and stale recheck, frozen deterministic reconstruction, stable typed-model JSON, immutable upload/read-back, atomic artifact publication plus lineage plus generation completion, metrics, failure recording, idempotency identities, authenticated project-scoped invocation, and production isolation.

Migration deployment and remote audit pass. The exact `32006L0114` source identity is confirmed. All focused, prior-phase, worker, TypeScript, and reconstruction regression gates pass; the broad suite has only the same two unrelated legacy-TM fixture failures.

## Authenticated controlled-run continuation

The user completed the authenticated invocation and exact retry. Independent production queries confirm one completed generation (`79e229f4-ad6d-47cd-a739-d955f14b8c46`), one available model (`5c09e46f-aa23-40d1-91e3-b9044a305272`), one exact SOURCE_PDF input, one `derived_from/source_pdf` lineage edge, and no duplicate generation, model, or relationship. Persisted metrics match the frozen `32006L0114` fixture: 7 pages, 3,362 spans, 3,389 tokens, 3 tables, 48 rows, 100 cells, 2 MERGE, 0 KEEP_BOUNDARY, and 1 ABSTAIN. Validation, source coverage, and ordered-token statuses are PASS with no failure code.

Production isolation passes: the generation produced no other artifact, and the document version has no `VALIDATED_DOCX`, canonical snapshot, SDLXLIFF, or target DOCX artifact.

The remaining blocker is independent readback of the private model object's actual bytes. The database records SHA-256 `63fb1a805d02484ca9aa5d951dd441b98a0e5155dd64f08fc5f25b623ac33520` and size 3,184,355, but no existing authenticated application route exposes `RECONSTRUCTION_MODEL` bytes to this agent. Supabase CLI 2.115 linked Storage copy failed with `LegacyStorageUnsupportedOperationError` for both exact-object and recursive attempts. Metadata was not substituted for an actual-byte hash, and JSON content was not claimed as independently parsed.

At that earlier checkpoint classification remained PARTIAL solely on the mandatory actual-byte readback gate. No code changed during that verification attempt.

## Phase 6C.3B exact-artifact readback

A generic authenticated exact-artifact route is now implemented at `GET /api/projects/[projectId]/artifacts/[artifactId]`. It resolves only exact `id + project_id` under RLS, reads the immutable row's own bucket/path, and reuses the existing verified artifact reader for actual SHA-256 and byte-size checks before returning unchanged bytes. Fifteen focused tests and all required prior-phase, worker, TypeScript, CELEX, and frozen-fixture gates pass.

At that historical stage Phase 6C.3 remained PARTIAL: route implementation alone did not satisfy the gate until the authenticated user downloaded the controlled artifact and its bytes were independently verified.

## Final authenticated readback and closure

The user downloaded the exact controlled artifact through the authenticated exact-ID route. Independent local-byte verification passed: SHA-256 `63fb1a805d02484ca9aa5d951dd441b98a0e5155dd64f08fc5f25b623ac33520`, byte size 3,184,355, and valid JSON.

The model contract and content pass independently. It identifies schema `eu-acquis.reconstruction-model.v1`, generation `79e229f4-ad6d-47cd-a739-d955f14b8c46`, SOURCE_PDF artifact `2a09f056-05a9-4f07-9340-6610ca1d829b`, and source SHA-256 `1b0fb08ec46c93b9df62675f2b898030511dfcf5df4832b15cde56681932008b`. It contains 3,687 ordered typed nodes, 3,362 inline spans, provenance/source references and boxes, 309 validated diagnostic decisions, seven retained ambiguities, three native table nodes, and PASS coverage/token/structural metadata.

Downloaded metrics exactly match the frozen `32006L0114` evidence: 7 pages, 3,362 spans, 3,389 tokens, 3 tables, 48 rows, 100 cells, 2 MERGE, 0 KEEP_BOUNDARY, and 1 ABSTAIN.

Final production queries reconfirm one completed/PASS generation, one available immutable model, one exact SOURCE_PDF input, one unambiguous lineage relationship, one idempotency identity, no duplicate or overwritten model, and no downstream artifact. Security tests, prior-phase tests, worker tests, TypeScript, CELEX orchestration, and all three frozen fixtures pass.

## Preserved phase history

1. Implementation completed while authenticated invocation was unavailable.
2. The user completed the authenticated generation and idempotent retry.
3. Persisted-byte readback remained unavailable through existing routes.
4. A generic authenticated exact-artifact route was added and validated.
5. The user completed authenticated actual-byte readback.
6. Independent byte, JSON, contract, production-state, lineage, idempotency, security, isolation, and regression verification passed.

No code or production state changed during final verification. Phase 6C.4 was not started.

Phase 6C.4 was not started.
