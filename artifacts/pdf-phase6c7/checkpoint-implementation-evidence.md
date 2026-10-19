# Phase 6C.7 durable checkpoint implementation

## Status

Implementation readiness: **PARTIAL**. The migration is deployed and catalog-verified; local focused validation passes. No new paid generation has been invoked.

## Contract

`canonical_mk1_batch_checkpoints` is append-only and keyed by `(mk1_run_id, batch_ordinal)`. Each row binds the project, canonical snapshot, TU IDs, source hashes, translated target payloads and hashes, model/prompt identity, provider response ID, and input/output token usage. RLS is project-owner scoped. Update/delete triggers reject mutation.

Token usage is retained per batch and the application exposes a deterministic estimate using the configured GPT-5.6 rates ($4/M input, $20/M output). Missing provider usage remains explicitly null rather than guessed.

The orchestration now creates the immutable MK1 run before the first provider call. After each validated response it appends the checkpoint, canonical translations, and batch evidence before the next batch is requested. Any failed insert aborts the generation and no later provider call is made.

`generateCanonicalMk1` accepts a validated completed-checkpoint map. Such checkpoints are reused only when batch ordinal and TU range match exactly; otherwise it fails closed. This prevents repeating paid calls after an interruption. Historical failed generations are not retrofitted or resumed.

Final artifact generation and atomic completion remain gated on complete ordered coverage and immutable readback validation.

## Tests

- TypeScript: PASS
- Focused translation/CAT/DOCX tests: PASS
- Checkpoint contract tests: PASS
- Synthetic DOCX reconstruction: 265/265 PASS
- Paid model calls: 0

The migration deployment is complete. Rolled-back insertion/readback, duplicate rejection, mutation protection, lineage, synthetic interruption recovery, all-27-batch recovery, and 265-TU DOCX/SDLXLIFF readback pass. The RLS policy is catalog-verified, but a direct authenticated-role cross-project probe was not available from this environment. No v4 run instructions are issued yet.
