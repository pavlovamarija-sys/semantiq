# Phase 3A pre-change assumption audit

This inventory freezes the behavior of `workers/pdf-to-docx/spikes/typed_model_phase1.py` before Phase 3A changes.

| Area | Current assumption | Classification | Consequence |
|---|---|---|---|
| Extraction | Text lines from one PDF block are joined when vertical gap is at most 1.15 line heights and left edges differ by at most 25 points. | Heuristic but document-independent | Can join visual wraps, but can also hide intra-block structural boundaries. |
| Reading order | `_two_column_order` infers two columns from page midpoint, left/right populations and vertical overlap. | Heuristic but document-independent | Useful basis, but supports only one top full-width region and no lower full-width transition. |
| Reading order | Use `_two_column_order` only while `page_number < 6`. | Document-specific fixed-page rule | Corrupts later two-column pages; caused the frozen 32006L0126 Article-order defect. |
| Reading order | From page 6 onward, globally sort all fragments by `(y0, x0)`. | Document-specific fixed-page rule | Interleaves left and right columns. |
| Page structure | Treat physical page 6 as the page containing two Annex I tables. | Document-specific | Crashes or misclassifies unrelated documents. |
| Table trigger | Require exact `PART A` and `PART B` text on page 6. | Document-specific text control | Missing labels raise `StopIteration`. |
| Table boundary | First page-6 table is between the two labels and below fixed y=180. | Document-specific position | Cannot generalize to other pages or layouts. |
| Table rows | First table row starts are left-side fragments with `x0 < 150` whose text does not start with `(`. | Document-specific geometry/text | Encodes one known table's title/citation pattern. |
| Table columns | First table splits at fixed x=300. | Document-specific geometry | Assumes the known page width and column placement. |
| Table trigger | Treat physical page 7 as the correlation-table page and require exact `CORRELATION TABLE`. | Document-specific text/page control | Missing label raises `StopIteration`; other tables are ignored. |
| Table boundary | Correlation table uses fixed y range 146–770. | Document-specific position | Encodes one fixture's table extent. |
| Table columns | Page-6 second table uses `[93.5, 233.4, 368.4]`; page-7 table uses `[92.5, 301.9]`. | Document-specific geometry | Hard-codes known column anchors. |
| Table count | Exactly three tables are constructed: two on page 6 and one on page 7. | Document-specific | Cannot discover arbitrary table counts. |
| Table naming | Names are hard-coded as Annex I Part A, Annex I Part B and Annex II correlation table. | Document-specific semantic knowledge | Leaks fixture identity into the structural model. |
| Node ordering | Before page 6 ordinary nodes retain inferred column order; page 6 onward ordinary and structural nodes are re-sorted by y. | Document-specific fixed-page rule | Reintroduces column interleaving after structural detection. |
| Heading detection | Exact isolated `Article N` and `ANNEX Roman` labels outside tables are headings. | General legal-structure rule | Safe only after correct table/region ownership is established. |
| Other headings | Known generic legal labels or short bold text are headings. | Heuristic but document-independent | Ambiguous short/bold items must remain explicitly reported. |
| Paragraph merging | Adjacent same-column/style fragments merge only with punctuation and lowercase/digit continuation evidence. | Heuristic but document-independent | Conservative; can retain false splits and cannot merge across pages. |
| Page breaks | Every physical PDF boundary after page 1 creates a PageBreak node. | General | Preserves provenance and physical pagination. |
| Phase 2B rendering | Every logical table cell is one Word paragraph; internal source fragments use controlled line breaks. | General | Preserves logical cell identity through DOCX/Studio. |

Phase 3A must remove every document-specific control above. No CELEX, title, Article number, Annex name, fixed physical page, fixed table count, fixed coordinate, or exact PART label may control reconstruction.
