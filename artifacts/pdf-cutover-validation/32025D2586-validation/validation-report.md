# CELEX 32025D2586 reconstruction validation

## Result

**PASS — the shared typed converter is ready for a separately authorized controlled cutover.**

The production Generate DOCX endpoint remains unchanged. No database records, Supabase objects, immutable artifacts, or translation models were used or modified.

## Source and integrity

- Source SHA-256: `a189c5b49a8fef33e3bc873d3d03491213ee05187a3eb1813110a677e5d4f69d`
- Source size: 890,782 bytes
- Source pages: 3
- Span accounting: 136 extracted = 120 legal + 16 explicitly excluded furniture spans
- Ordered legal tokens: 833
- Missing, added, duplicated, changed, or reordered legal tokens: 0
- Unresolved structural diagnostics: 0

## Reconstruction

- Four recitals were derived and bound in legal-number order.
- Articles 1 and 2 validate in order.
- The unnumbered Annex heading is represented structurally.
- Ruled-grid detection identifies the five source column boundaries from PDF drawing primitives.
- PDF pages 2 and 3 are represented as two physical table segments sharing one logical table identity.
- The repeated page-3 header is marked as a repeated logical header, not a data row.
- Logical table: one header plus four data rows, five columns.
- DOCX: one native `w:tbl`, five rows, 25 cells, fixed source-derived column proportions, repeating header, and non-splitting data rows.
- A landscape OOXML section contains the Annex table; the portrait main act remains portrait.

## Furniture and footnote

- Portrait top/bottom and rotated side furniture are excluded using page-margin geometry plus publication-label evidence.
- Excluded material retains page, block, line, span, box, and original-text provenance.
- The source note is represented as one native Word footnote with one proven same-page anchor.
- The malformed `(1)1)` PDF metadata sequence is corrected only after overlapping span boxes prove the first metadata span represents the opening parenthesis; original metadata remains in correction diagnostics.

## Visual comparison

The generated DOCX renders to three pages: one portrait page and two landscape Annex pages, matching the source's page-orientation structure. Every source page and rendered page was inspected.

The Annex retains the five source columns, row associations, wrapped text, variable-height rows, repeated continuation header, and four entries. Page furniture is absent. Minor typography and margin differences remain because the platform intentionally applies its standard Times New Roman 12 pt formatting rather than reproducing the Official Journal typeface.

Rendered evidence is stored as `source-page-*.png` and `docx-page-*.png` in this directory.

## Regression results

- Worker tests: **67 passed**, one third-party Starlette/httpx deprecation warning.
- Frozen Phase 6A fixture runner: **PASS** for 32006L0114, 32006L0126, and 32006L0042.
- New 32025D2586 fixture: **PASS** with exact source hash, cell-content assertions, landscape OOXML, native footnote, furniture accounting, and fixed table geometry.
- TypeScript: **PASS** (`tsc --noEmit`).

## Remaining limitations

- Visual validation used LibreOffice headless rendering, not Microsoft Word.
- The detector handles complete ruled grids and retains the existing whitespace-grid path for unruled tables. It deliberately rejects partial internal-rule patterns narrower than 55% of the page so they fall back to whitespace inference; additional blind ruled-table fixtures would further strengthen generalization evidence.
- No production endpoint cutover was performed in this phase.
