# Phase 6C.7 immutable v4 checkpoint recovery

## Implementation

The recovery endpoint is separate from paid MK1 generation: `POST /api/projects/{projectId}/mk1-recoveries`. It accepts the exact failed generation/run identities and invokes `recoverAndPersistCanonicalMk1`. The recovery module does not import an OpenAI provider, expose a provider parameter, call `generateCanonicalMk1`, or contain a network fallback.

The source generation must be failed and use producer algorithm `canonical-mk1-phase6c7-v4-durable-checkpoints`. The source run must match the requested project, document, version, canonical snapshot and CAT projection. The canonical snapshot, Studio projection, source SDLXLIFF and validated DOCX must all remain available under the same scope and hashes.

All 27 source checkpoints are validated in ordinal order against canonical batches. Validation covers batch boundaries, model and prompt, provider response identity, TU IDs, source hashes, target text UTF-8 hashes, persisted translation rows, ordinals, QA state and all protected-code tokens. Missing, duplicate, reordered or altered evidence fails before a new generation is reserved.

The new generation uses kind `mk1_injection` but distinct producer/algorithm `canonical-mk1-phase6c7-v4-checkpoint-recovery-v1`, idempotency prefix `mk1-recovery`, and config flag `providerCallsAllowed: false`. The new run records foreign-keyed `recovered_from_generation_id` and `recovered_from_run_id`. Checkpoints, batches and translations are copied append-only with the original model, prompt, response IDs and token usage.

The existing validated DOCX renderer and Studio-skeleton injector generate new immutable artifacts. Both are downloaded and byte-verified before the existing atomic completion RPC makes both artifacts available and records lineage. The failed v4 generation, run, checkpoints, translations and failed artifacts are never changed.

## Validation

- Clean local migration replay through `20261030000000`: PASS.
- Linked additive lineage migration deployment: PASS.
- Pure 265-TU/27-batch recovery: PASS with zero provider calls.
- Missing/duplicate batches: rejected.
- Source/hash/translation alteration: rejected.
- Missing, duplicate or altered protected codes: rejected.
- Focused canonical/CAT/DOCX/MK1 tests: 41 PASS, including recovery idempotency.
- TypeScript: PASS.
- Next.js webpack production build: PASS; route `/api/projects/[projectId]/mk1-recoveries` is present.

The default Turbopack build encountered an unrelated access-denied panic while scanning `.tmp/pytest-phase6a`; the webpack build compiled and typechecked successfully without changing that directory.

## Remaining risk

The real recovery has deliberately not been invoked. Actual persisted artifact IDs, hashes, byte sizes and final database lineage can only be verified after the authenticated controlled invocation. Phase 6C.7 therefore remains PARTIAL.
