# Phase 6C.7 DOCX protected-line-break correction

## Renderer correction

The renderer no longer creates `<w:br/>` inside replacement text. It parses the existing paragraph text and break nodes, requires the translated target to contain the same number of non-page line breaks, places each target line into the corresponding existing text region, and leaves the source break node and run formatting in place.

The operation fails closed for page breaks, break-count mismatches, terminal/empty lines, adjacent breaks without a writable text region, missing text nodes, or changed structure. Mixed runs and multiple separated line breaks are supported deterministically.

## Immutable correction generation

`POST /api/projects/{projectId}/mk1-docx-corrections` creates a separate `target_render` generation. It reads only the completed recovery run `7ec58b3d-5829-48da-83e5-9146097dc06b`, its immutable 265 translations, three protected codes and the authoritative validated DOCX. It creates one new `TARGET_DOCX`; it does not create or modify an SDLXLIFF.

Atomic finalization verifies the completed recovery/run identities, both immutable generation inputs, artifact hash/size and project/document/version scope. The new artifact records `rendered_from` lineage to the validated DOCX and `supersedes` lineage to flawed artifact `d67fe184-9227-40e1-81ef-082f6249608a`. Existing generations and artifacts remain unchanged.

The correction service has no GPT/OpenAI provider import, parameter or fallback.

## Validation

- Clean local migration replay through `20261031000000`: PASS.
- Linked migration deployment: PASS.
- Focused tests: 46 PASS, 0 FAIL.
- TypeScript: PASS.
- Next.js webpack production build: PASS.
- Synthetic 265-TU reconstruction: PASS.
- Real persisted-translation offline preflight: 265 TUs, 3 protected codes, 273 paragraphs, 3 tables, 48 rows, 100 cells, 6 page breaks and 1 section; PASS.
- Offline candidate SHA-256: `e87ccb54bfa3878a107889e9bdc071c6977a4f213c11da88a8639018f536c088`.
- Offline candidate size: `887530` bytes.

Phase 6C.7 remains PARTIAL until an authenticated generation is executed and its actual persisted bytes are independently downloaded and verified.
