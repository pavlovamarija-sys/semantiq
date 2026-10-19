# Conservative Phase 6C implementation slices

## 6C.1 — Schema and immutable storage primitives

Add migrations for generations/artifacts/relationships, RLS, immutable triggers and private artifact bucket; add domain types and repository/service tests. No production caller. Rollback: stop before migration application or leave unused additive objects.

Likely files: new migration, `src/domain/records.ts`, new `src/infrastructure/artifacts/*`, tests.

## 6C.2 — Authoritative source registration/backfill

Register newly imported/uploaded `SOURCE_PDF` after current success; provide read-only backfill script that hashes Storage bytes. Preserve CELEX behavior and legacy columns. Tests cover differing re-download bytes, RLS and idempotency. Rollback: disable dual-write; legacy path remains authoritative.

## 6C.3 — Reconstruction generation persistence

Wrap validated reconstruction calls in generation reservation/status/diagnostic persistence, still non-authoritative. Persist model/QA artifacts only. Tests cover retries, failures and no active-path effect.

## 6C.4 — Validated DOCX artifact persistence

Persist/hash/read-back immutable DOCX artifacts alongside existing working-document versions; compare identities. Do not cut over reads until equivalence gates pass. Rollback: legacy DOCX path remains selected.

## 6C.5 — Canonical snapshot binding

Add snapshot root and future node/TU/inline-code schema; extract from exact validated DOCX artifact; dual-run against current segments. No translation cutover. Tests cover immutable re-extraction and source hash binding.

## 6C.6 — CAT artifact lineage

Add untouched/MK1/reviewed SDLXLIFF registration, skeleton/source/inline-code validators, artifact relations and signed downloads. Studio-created untouched SDLXLIFF remains immutable. No automatic translation/trust effects.

## 6C.7 — Translation and reconciliation lineage

Add artifact↔translation-version mappings and reconciliation generations/reports; create MK2 drafts only after validation. Extend approval provenance, never auto-approve.

## 6C.8 — Stale guards and end-to-end validation

Enforce selected artifact/snapshot IDs at every transition, concurrency/idempotency, missing-byte quarantine, immutable exports and package manifests. Cut over one read path at a time after regression evidence.

Every slice runs current CELEX, working-DOCX, MK1, approval, TM and RLS regressions. Phase 6B shadow remains OFF. No slice destructively migrates current data.
