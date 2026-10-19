# Phase 6C.7 failed controlled-run diagnosis

## Identity

- User request key: `phase6c7-controlled-32006l0114-v1`
- Derived idempotency key: `mk1-injection:19a6bccb1df238fa5242e1f52d366fd89451eaf991daccfce71930029fee32bb`
- Generation: `1ccd6fd8-c75e-4515-84c5-5e7511f64297`
- Input fingerprint: `300fd3a69f814cbd7fd599b6ccfa98f5e3d807fce7e2dfe8e368ec804a756ff3`

## Persisted state

- Status: `failed`
- Validation status: `NULL` because validation was never reached
- Created: `2026-10-12T08:17:41.809Z`
- Started: `2026-10-12T08:17:43.110Z`
- Terminal update (`completed_at`): `2026-10-12T08:20:48.776Z`
- Error code: `canonical_mk1_failed`
- Provider response: HTTP 429, `credit_balance_exhausted`
- MK1 run rows: 0
- Completed batch rows: 0
- Persisted translation rows: 0
- SDLXLIFF/DOCX output artifacts: 0

`processing_generations` has no general `updated_at` column; `started_at` and terminal `completed_at` are the available lifecycle timestamps.

Both authoritative input bindings were persisted before the call: Studio skeleton artifact `9b2bc2fa-99ad-464d-b905-1dacf790de7a` with SHA-256 `588de15278fef72518c567f3c3e9a9ed279efece6b8733776a1375e794abe2a4`, and validated DOCX artifact `b0e8fec5-91c8-4755-87a4-ff8f6dd8d307` with SHA-256 `2dc5da5384974468da3d1711f6194e03187274f225a9ef99dcc3027b3ee5a971`.

## Root cause and model-call accounting

The first sequential GPT-5.6 batch request reached OpenAI and was rejected before completion because the organization had no API credits. The implementation uses one direct `fetch` call and performs no automatic HTTP retry. The thrown first-batch error immediately terminated the generation.

- Provider calls attempted: 1
- Provider calls completed: 0
- TUs returned by the provider: 0
- TUs persisted: 0
- Recorded token usage: none

There is no evidence of billable model inference. The request was rejected for exhausted credit before a response or usage record was produced. Account-level billing is not available in the application database, so this is not presented as an independent billing-account audit.

## Retry protection and recovery

The identical request correctly resolves to the existing failed generation and is rejected before provider construction or invocation. This prevents duplicate model calls and preserves the failed audit record.

Resume is not supported and would add no value here: no completed batch checkpoint exists. Do not mutate, delete, or reset the failed generation. After API credits are restored, the safe path is an explicitly authorized new immutable generation with a new request key. That key must be supplied only in a future authorization; none is created or proposed by this diagnosis.

No code correction is required for the failure. The root cause is provider account quota, and the fail-closed/idempotency behavior operated as designed.
