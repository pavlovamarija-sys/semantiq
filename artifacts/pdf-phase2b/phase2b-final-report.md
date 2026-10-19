# Phase 2B post-Studio validation

## Final result: PASS

The fresh untouched Studio projection validates the Phase 2B renderer experiment. All three Annex I Part A logical cells now remain single CAT units through DOCX and Studio, while their internal visual separation is retained as a safe literal line feed inside the SDLXLIFF source.

## Immutable inputs

- V2 DOCX SHA-256: `058065F2A20068752432963D50608AB2463E2DB7F35C370405DDA70EF3F0F813` — matches the frozen expected hash.
- V2 SDLXLIFF SHA-256: `D54A6E2034A93E547D54311754FE33B7F7983726710D696B3E9A8A836464D165`.
- Embedded Studio source file: `D:\EU Acquis AI App\.tmp-architecture-spike\complex-fixture\Neuer Ordner\Project 1\en-GB\32006L0114-experimental-v2.docx`.
- Source language: `en-GB`.

Neither input was modified.

## Actual Studio projection

| Metric | Actual | Predicted |
|---|---:|---:|
| Trans-units | 273 | 273 |
| Visible CAT segments | 267 | 267 |
| Empty/structural units | 6 | 6 |
| Table-context units | 98 | 98 |
| Table rows represented | 48 | 48 |
| Non-empty table cells represented | 98 | 98 |
| Cells producing >1 trans-unit | 0 | 0 |
| Cells producing >1 CAT segment | 0 | 0 |

The prediction matches exactly. The 100 native cells comprise 98 non-empty represented cells and two intentionally empty cells with no Studio unit.

## Three target cells

Each of `tablecell-e795a50cb0cdd25f`, `tablecell-1170670854759090`, and `tablecell-dcc19ff200192bde` produces exactly one DOCX paragraph, one Studio trans-unit and one CAT segment. Studio preserves the controlled Word line break as one literal LF within `<source>` and `<seg-source>`. It emits no `mrk mtype=seg` boundary around that line break.

## Text and structure

- PDF → typed model: PASS; 3,362 source spans represented exactly once.
- Typed model → V2 DOCX: PASS.
- V2 DOCX → V2 SDLXLIFF source: PASS.
- Ordered normalized tokens: 3389; hash `c1041d1e04032898999d7bf32d1a541f49943eb770d06d4daac906622edc59ab`.
- Missing, added, duplicated, changed or reordered source tokens: 0.
- Native structure: 3 tables, 48 rows, 100 cells.
- Studio table context: retained for all 98 represented non-empty cells.
- Genuine Articles 1–12 and Annexes I–II: valid and heading-context units outside tables.
- Exact Article/Annex references in tables: table-context units without heading context.

## Four repaired boundaries

All four Phase 1 boundaries remain repaired through Studio:

- three Annex I Part A instrument/citation cells: one paragraph → one trans-unit → one CAT segment each;
- page-1 citation/footnote continuation: one paragraph → one trans-unit → one CAT segment.

The V2 body projection is identical to V1. After collapsing only the three known V1 title/citation pairs, the complete table projection is identical to V2. No material CAT regression was introduced.

Production conversion behavior remains unchanged. No production integration was performed.
