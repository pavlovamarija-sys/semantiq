# Phase 6C.7 v4 digest failure diagnosis

The v4 generation `01eb331b-427d-4e77-b9ab-e40412bdef0a` failed during atomic database finalization, after all translation work and artifact serialization had completed. The immutable run is `63a18859-19eb-4b91-afc3-0221b0544f1a`.

## Durable work and cost evidence

- 27 provider responses/checkpoints exist, covering TU ordinals 0–264.
- 265 translations are persisted; readback reports zero target-hash mismatches.
- Provider usage is 17,890 input tokens and 23,432 output tokens (41,322 total).
- No monetary charge value was persisted, so an exact currency charge cannot be independently reported.
- SDLXLIFF and DOCX artifact rows exist but are correctly marked `failed`; neither is authoritative.

## Root cause and fix

`pgcrypto` was already installed in schema `extensions`. `public.complete_canonical_mk1` deliberately has `SET search_path TO ''`, but the original function called unqualified `digest(...)`. PostgreSQL therefore could not resolve it. This was an unqualified reference, not a missing extension.

Forward migration `20261029000000_fix_mk1_digest_schema.sql` recreates only that function with `extensions.digest(...)`. Historical migrations and persisted records were not modified. Clean local replay, a rolled-back local Unicode hash probe, linked deployment, linked catalog/hash probes, all 265 persisted target hashes, eight focused tests, and TypeScript pass.

## Recovery

The same request key cannot resume. Current orchestration rejects a matching failed generation before any provider call, and failed run/artifact records are immutable. Operational recovery requires a separately authorized immutable generation that imports and validates the exact 27 checkpoints against the same source/model/prompt identities, then finalizes without provider calls.

No paid retry, MK2 work, or production cutover was performed.
