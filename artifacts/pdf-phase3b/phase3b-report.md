# Phase 3B table-boundary and cross-page reconstruction

## Result: FAIL

The required pre-change analysis was completed and the document-independent rule set was implemented in the isolated spike. The 32006L0114 regression remained clean: 3 tables, 48 rows, 100 cells, complete span coverage and valid Article/Annex order; the focused tests passed 3/3.

## Frozen-run failure

The single frozen 32006L0126 run did not return a typed model. On page 4, the generalized aligned-list negative-evidence rule correctly created an `aligned-body-columns-not-table` ambiguity, but that record contains `evidence` rather than the `reason` key expected by generic decision logging. The builder raised `KeyError: 'reason'` at `typed_model_phase1.py:554`.

This is a new Phase 3B implementation defect. In accordance with the instruction to document and stop after a new defect appears in the frozen run, it was not repaired and the document was not rerun.

Consequently the page-4 structural outcome, page-40 boundary extension, page-41 same-page join, pages-41–43 logical continuity, revised paragraph ambiguities and text-integrity gates cannot be claimed as validated. No experimental DOCX or SDLXLIFF was generated.

## Frozen inputs

- 32006L0126 source PDF SHA-256: `0E6E7DF9EF641AFEBECF692CE9E1AF7C8CA2F2AD2E4C82950AD6ECF81A3D55EE`
- Experimental DOCX SHA-256: unavailable

No CELEX/page/Article/Annex-specific control was added. Production, DB and CAT code remain unchanged.
