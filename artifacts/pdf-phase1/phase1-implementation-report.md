# PDF→DOCX typed-model spike — Phase 1

## Result: PASS

Phase 1 satisfies the requested acceptance conditions for CELEX 32006L0114:

- source-to-model span coverage and token inventory pass;
- model-to-DOCX ordered token integrity passes;
- all three known whitespace-aligned tables are typed and rendered as native DOCX tables;
- table-cell references `Article 1` and `Annex I` remain inside `<w:tc>` structures;
- structural validation sees genuine Article 1–12 and Annex I–II headings only;
- the four previously confirmed unnecessary boundaries are repaired deterministically;
- no production conversion module imports or invokes the spike;
- no database, CAT, SDLXLIFF, or production route was changed.

## Isolated implementation

The spike lives under:

- `workers/pdf-to-docx/spikes/typed_model_phase1.py`
- `workers/pdf-to-docx/scripts/run_phase1_spike.py`
- `workers/pdf-to-docx/tests/test_typed_model_phase1.py`

The production `ConversionService`, reconstruction functions, worker endpoints, and validation path are unchanged.

## Typed model

The experimental model contains:

- `Document`
- `Heading`
- `Paragraph`
- `ListItem`
- `Table`
- `TableRow`
- `TableCell`
- `Footnote`
- `PageBreak`
- `InlineSpan`

Every node has source evidence. Content nodes retain page, PDF block index, source line IDs, source span IDs, bounding boxes, reading-order position, font families, font sizes, bold/italic evidence, exact source text, deterministic classification evidence, and confidence.

Individual PDF spans are preserved as `InlineSpan` children with their original text. Parent logical nodes use layout-whitespace normalization only. Empty inferred table cells retain row-source evidence and are explicitly marked `inferredEmpty`.

Every classification, merge, and table-region split is recorded in the reconstruction decision log.

## Deterministic reconstruction

The spike uses PDF geometry and repetition rather than `Page.find_tables()` alone:

- Annex I Part A: 3 rows × 2 columns, 6 cells;
- Annex I Part B: 4 rows × 3 columns, 12 cells;
- Annex II correlation table: 41 rows × 2 columns, 82 cells.

Total: 3 tables, 48 rows, and 100 cells.

Annex II is detected from its explicit table region, two stable x anchors, and 41 repeated row baselines. Annex I Part B uses three stable x anchors and four repeated baselines. Annex I Part A combines multi-line fragments into cells using row ranges and left/right column anchors.

Normal body fragments merge only when page/column geometry, vertical proximity, style, punctuation, and continuation evidence agree. The spike records 18 deterministic merge decisions; four correspond to the unnecessary boundaries previously confirmed by the architecture investigation.

## Integrity gates

Two separate checks run:

1. Source → typed model:
   - exact source-span coverage with no duplicate span IDs;
   - unchanged token inventory;
   - unchanged non-whitespace characters between each logical node and its source spans;
   - deterministic row-major order for recovered tables while preserving order within each cell.
2. Typed model → DOCX:
   - exact ordered token sequence after layout-only whitespace normalization.

Results:

- 3,362 source spans represented exactly once;
- 3,389 normalized visible-text tokens;
- source-to-model integrity: PASS;
- model-to-DOCX integrity: PASS;
- rendered token hash: `c1041d1e04032898999d7bf32d1a541f49943eb770d06d4daac906622edc59ab`.

## Old versus experimental

| Metric | Production raw reconstruction | Experimental typed reconstruction |
|---|---:|---:|
| Non-empty DOCX paragraphs | 259 | 270 total; 169 outside tables |
| Reconstructed logical paragraphs/cells | Not represented | 243 |
| Typed content nodes / potential TUs | Paragraph-driven | 269 |
| Native DOCX tables | 0 | 3 |
| Rows | 0 | 48 |
| Cells | 0 | 100 |
| Confirmed false boundaries repaired | 0 | 4 |
| Unresolved structural ambiguities | Not represented | 7 |
| Article sequence | Fails after table flattening | PASS: 1–12 |
| Annex sequence | Fails after table flattening | PASS: I–II |

The experimental DOCX paragraph count is not directly comparable to the old count as a segmentation measure: Word tables require paragraphs inside cells. Those paragraphs now have typed table ownership and cannot be confused with body headings.

## Direct DOCX inspection

The generated package contains three native `<w:tbl>` structures. Inspection through the DOCX object model confirms:

- `Article 1` occurs in a cell of table 3;
- `Annex I` occurs in a cell of table 3;
- neither participates in structural heading validation;
- genuine Article and Annex labels are rendered as heading paragraphs outside tables.

## Translation-unit projection

If units were derived directly from all translatable typed content nodes in this Phase 1 model, the document would yield 269 candidate units:

- headings remain explicit contextual units;
- logical body paragraphs, list items, and footnotes remain semantic units;
- each non-empty table cell is a context-bearing table unit;
- page breaks produce no units.

This is a structural projection only. Studio/SRX sentence segmentation, running-margin exclusion policy, and CAT packaging remain deliberately out of scope. The important difference is that a Word paragraph inside a table is no longer semantically equivalent to a body paragraph or heading.

## Known Phase 1 limits

- Seven short/bold lines remain explicitly marked as ambiguous heading-versus-fragment classifications.
- Running-margin handling is preserved for integrity but is not yet modeled as a dedicated canonical node type.
- Native Word footnote rendering is not migrated in this spike; footnotes are typed, while production’s later footnote package logic remains untouched.
- Table detection is deterministic and sufficient for this neutral document, but needs a broader fixture corpus before production generalization.
- No AI classification is present.

These limits do not violate the Phase 1 acceptance gate and are retained as explicit follow-up work rather than hidden guesses.

## Verification

- Phase 1 tests: 2 passed.
- Complete PDF worker suite: 25 passed.
- Application TypeScript check: passed.
- Production behavior changed: no.
