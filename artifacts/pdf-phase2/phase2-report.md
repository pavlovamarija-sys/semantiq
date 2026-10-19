# Phase 2 old-vs-new CAT/Studio assessment

## Result: PARTIAL

NEW measurably improves structural identity and preserves text, but it does not meet the Phase 2 PASS gate because three of the four known repaired boundaries reappear as separate DOCX paragraphs, Studio trans-units, and CAT segments inside Annex I Part A cells.

## Frozen inputs

- PDF SHA-256: `1B0FB08EC46C93B9DF62675F2B898030511DFCF5DF4832B15CDE56681932008B`
- OLD DOCX SHA-256: `79C255B2AC45DAED7D4725D1E8E803179CCE6F743F225D5A48E56B723E8A9F45`
- NEW DOCX SHA-256: `90BDF31CEEB6A0C85B7C7432C2A3A7B89213FFA0A0909EBCD083FCF9F177F0C5`
- OLD SDLXLIFF SHA-256: `7905821B5D31EC0E0D066B9A3C72084E8AE92878CB820881CD5BDEC3BA07B33D`
- NEW SDLXLIFF SHA-256: `7DDAD148910BE6C1AC0EB7F9B0AAA0A188320BF27BD8D3E0B85D81514B58FA9D`

Studio identifies the files as `32006L0114-old-raw.docx` and `32006L0114-experimental.docx`, both with source language `en-GB`. The actual untouched filenames retain Studio's `.docx.sdlxliff` suffix.

## Projection metrics

| Metric | OLD | NEW | Assessment |
|---|---:|---:|---|
| DOCX paragraphs, total | 265 | 278 | Structural difference |
| DOCX paragraphs, non-empty | 259 | 270 | Structural difference |
| Native DOCX tables | 0 | 3 | IMPROVED |
| Rows / cells | 0 / 0 | 48 / 100 | IMPROVED |
| Studio trans-units | 265 | 276 | +11 |
| Visible trans-units | 259 | 270 | +11 |
| CAT segments | 259 | 270 | +11 |
| Empty structural units | 6 | 6 | UNCHANGED |
| Studio table-context units | 0 | 101 | IMPROVED |

Studio created one trans-unit per represented DOCX paragraph. No `mrk mtype=seg` subdivision is present, so every visible trans-unit is one CAT segment. Six empty units in each file represent page-break structure. NEW has two empty table-cell paragraphs for which Studio creates no unit.

The higher NEW unit count is not by itself a regression: 101 units carry explicit table-cell context. However, three of those boundaries are avoidable intra-cell paragraph splits.

## Tables

OLD exposes the Annex tables as ordinary paragraph units with no table, row, or cell context. Several exact `Article N` and `Annex N` table references also inherit heading context because the flattened DOCX styled them as headings.

NEW exposes all three tables through Studio's `x-tm-table-cell`, `sdl:table-row`, and `sdl:table` contexts. Row-major order is preserved. The correlation-table `Article 1` and `Annex I` references are table-cell units and are not heading units. Genuine Article and Annex headings remain heading-context units outside tables.

Cell projection in NEW:

- 100 native cells;
- 2 intentionally empty cells have no Studio unit;
- 95 cells have one Studio unit;
- 3 cells have two Studio units.

Thus native tables materially improve structural identity, but native table ownership does not automatically prevent CAT fragmentation inside a cell.

## Known repaired boundaries

- Page-1 citation/footnote continuation: remains repaired; one logical node → one DOCX paragraph → one Studio trans-unit → one CAT segment.
- Three Annex I Part A multi-line cells: each reappears as two DOCX paragraphs and therefore two Studio units/segments. The table-cell identity is preserved, but the logical cell paragraph remains fragmented.

Result: one of four boundaries remains repaired through Studio; three reappear. This blocks PASS.

## Seven retained ambiguities

The seven items are the document title, date, subject subtitle, codification label, EEA relevance label, and two Annex I captions. Each projects to exactly one Studio trans-unit and one CAT segment with heading context. None currently creates CAT fragmentation. Their precise semantic heading levels remain unresolved, but leaving them unresolved has no meaningful Phase 2 CAT effect.

## Text integrity

- PDF → typed model: PASS, 3,362 source spans represented once.
- Typed model → NEW DOCX: PASS.
- NEW DOCX → NEW SDLXLIFF source: PASS.
- Normalized ordered source tokens: 3389.
- Table order is explicitly evaluated in typed row-major order.
- Additions, omissions, changes, duplications, or ordering defects found: 0.

## Classification of differences

- Table structure preservation: IMPROVED.
- Heading/reference distinction: IMPROVED.
- Correlation-table row/column identity: IMPROVED.
- Page-1 repaired boundary: IMPROVED.
- Annex I Part A intra-cell boundaries: UNCHANGED at CAT segmentation level, although table ownership is improved.
- Empty/page-break units: UNCHANGED.
- Seven ambiguities: UNCERTAIN semantically, but no meaningful CAT effect.
- Text integrity: UNCHANGED/PASS.
- Material CAT regressions introduced by NEW: none observed.

## Recommendation

The typed reconstruction is sufficiently beneficial to continue architecture work, but not yet ready for production integration. Before integration, the experimental DOCX renderer should emit one Word paragraph per logical table-cell paragraph for the three Annex I Part A cells, using inline runs or controlled line breaks rather than multiple `<w:p>` elements. That change must be re-run through this same untouched-Studio experiment.

Production integration remains out of scope and was not performed.
