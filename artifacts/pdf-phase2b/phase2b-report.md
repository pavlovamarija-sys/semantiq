# Phase 2B multi-line table-cell serialization experiment

## Result: PASS (pre-Studio)

The three affected Annex I Part A cells are each one logical cell paragraph, not two logical paragraphs. V1 converted the newline inside each `TableCell.exact_text` into a second Word paragraph. The isolated V2 renderer instead emits one `<w:p>` containing two runs separated by one controlled `<w:br>`.

## Cell finding

The affected cells are table 0 (`Annex I Part A`), rows 0–2, column 0:

| Row | Typed node | PDF page | V1 paragraphs | V2 paragraphs | Classification |
|---:|---|---:|---:|---:|---|
| 0 | `tablecell-e795a50cb0cdd25f` | 6 | 2 | 1 | A |
| 1 | `tablecell-1170670854759090` | 6 | 2 | 1 | A |
| 2 | `tablecell-dcc19ff200192bde` | 6 | 2 | 1 | A |

In every case the first fragment is an instrument title and the second is its parenthetical Official Journal citation. Both fragments have the same left edge, font family, font size, weight and style. Their approximately 13.66-point vertical separation is visual citation layout within one cell. There is no competing paragraph-style or indentation evidence for two logical paragraphs.

## V1 vs V2

| Metric | V1 | V2 | Delta |
|---|---:|---:|---:|
| Total DOCX paragraphs | 278 | 275 | -3 |
| Non-empty DOCX paragraphs | 270 | 267 | -3 |
| Table paragraphs | 103 | 100 | -3 |
| Logical cells with >1 paragraph | 3 | 0 | -3 |

V2 preserves 3 tables, 48 rows and 100 cells. Body paragraphs, table dimensions, all visible cell text, and every unaffected cell's paragraph sequence are identical to V1. Genuine Article 1–12 and Annex 1–2 structural headings still validate in order. Exact `Article 1` and `Annex I` references remain inside table cells.

## Integrity

- PDF → typed model: PASS; 3362 source spans represented exactly once.
- Typed model → V2 DOCX: PASS; 3389 normalized ordered tokens, hash `c1041d1e04032898999d7bf32d1a541f49943eb770d06d4daac906622edc59ab`.
- Added, removed, changed, duplicated or reordered source words: 0.
- Change outside the three target cells: none.

## Expected Studio effect

Based on the measured Phase 2 mapping, V2 should reduce the projection from 276 to 273 trans-units and from 270 to 267 visible CAT segments. Each affected cell should become one trans-unit/segment. This remains an expectation until a fresh untouched Studio SDLXLIFF is created and measured.

No SDLXLIFF was generated. Production conversion behavior and the typed-model architecture were not changed.
