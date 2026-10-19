# Phase 6C.7 implementation evidence

## Scope

Phase 6C.7 adds an inactive, authenticated `mk1_injection` stage. It reads one exact available canonical snapshot, one exact available CAT projection, the immutable Studio source SDLXLIFF, and the immutable validated DOCX. It does not alter CELEX import, reconstruction, canonical extraction, CAT projection, working DOCX, MK1/MK2 legacy behavior, or invoke itself automatically.

## Translation contract

- Model: `gpt-5.6`
- Prompt identity: `canonical-eu-legal-en-mk-v1`
- Producer identity: `canonical-mk1-phase6c7-v1`
- Source/target: `en-GB` to `mk-MK`, proven by the available CAT projection
- Batch size: 10; 265 TUs therefore require 27 bounded model responses
- Each response must return every requested canonical TU ID and ordinal exactly once.
- Empty targets, partial batches, duplicate IDs, changed ordinals, and altered protected codes fail closed.
- Model calls complete before any translation, batch, or output artifact is persisted.

Protected inline-code literals are replaced with immutable placeholders before translation, validated exactly once in the response, and restored only during output rendering. The Studio output is populated into the original Studio-derived SDLXLIFF; its six excluded page-break trans-units are left unchanged. No SDLXLIFF is synthesized.

## Persistence and lineage

Migration `20261026000000_canonical_mk1.sql` is deployed. It creates immutable runs, batches, and source-linked TU translations with project-scoped RLS. Atomic finalization independently verifies persisted UTF-8 target hashes, canonical source identity/order, complete ordinal coverage, input bindings, output artifact identities, and uploaded byte metadata.

Lineage:

- Studio source SDLXLIFF -> MK1 SDLXLIFF: `injected_from / studio_skeleton`
- Validated DOCX -> MK1 target DOCX: `rendered_from / validated_docx`

Outputs remain unavailable until readback succeeds and the atomic completion function passes.

## Files

- `src/application/translation/canonical-mk1.ts`
- `src/infrastructure/translation/canonical-mk1-generation.ts`
- `src/infrastructure/cat/mk1-artifacts.ts`
- `src/infrastructure/document-output/reconstruct-mk1-docx.ts`
- `src/app/api/projects/[projectId]/mk1-generations/route.ts`
- `supabase/migrations/20261026000000_canonical_mk1.sql`

