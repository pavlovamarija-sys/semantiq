# Phase 6C.7 v3 reconstruction failure

## Persisted generation

- Request key: `phase6c7-controlled-32006l0114-v3-inline-code-preflight`
- Generation: `b2d41b63-8b63-4b7a-8fa3-df65e5ee64d3`
- Project/document/version: `ac1e24ca-b699-4863-ba99-f310fa220a8a` / `6b8a3125-eda7-46a2-9066-9b6d619713dc` / `74a67935-d57f-428f-aa34-d8d603ddda1e`
- Status: `failed`
- Validation status: `NULL`
- Created: `2026-10-12T09:28:36.268Z`
- Started: `2026-10-12T09:28:37.506Z`
- Failed: `2026-10-12T09:33:41.525Z`
- Failure stage: DOCX reconstruction, after provider translation and before MK1 run/batch/translation/output persistence.
- Exact error: `MK1 reconstruction could not map every segment exactly once. Missing: 158:tu-1d6b6715f26ec06e48647069, 159:tu-7bf505c2a900f9a86b97de59, 160:tu-edbd0025cb74eda0d259f0f4`

No `canonical_mk1_runs`, batch, translation, or output-artifact rows exist for this generation. The application does not persist provider usage until after rendering, so exact token totals and charges are unavailable. Execution reached all 27 bounded provider batches before the deterministic renderer failed; this is inferred from the request duration and failure stage, not presented as persisted usage accounting.

## Root cause

The three failed TUs are Annex I citation paragraphs, ordinals 158–160. Each canonical source contains one protected line-break code:

`Council Directive 84/450/EEC\n(OJ L 250, 19.9.1984, p. 17)`

and the equivalent 1997 and 2005 citations. The validated DOCX stores each as one paragraph with two text runs separated by `<w:br/>`. The old source extractor concatenated `<w:t>` contents and discarded `<w:br/>`, producing `EEC(OJ...)`. Canonical normalization produces `EEC (OJ...)`, so exact paragraph matching failed for all three. This is not a model segmentation, repeated-text, table identity, or canonical-source defect.

The SDLXLIFF literal-newline issue was already fixed separately. This failure was the analogous DOCX-side representation loss.

## Fix

`paragraphText` now emits `\n` for `<w:br/>` while reading a DOCX paragraph. Existing normalization then compares the reconstructed source layout to canonical source without rewriting legal text. The original DOCX and canonical snapshot are unchanged.

Offline tests now cover the three affected citation TUs and a synthetic all-265-TU reconstruction. DOCX reconstruction maps 265/265 ordered identities, including all three protected line breaks. Existing SDLXLIFF protected-code tests remain green.

The failed v1, v2, and v3 generations remain immutable. No retry or paid call was executed. A future recovery requires a new explicitly authorized request key after the fix is deployed.
