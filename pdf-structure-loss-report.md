# PDF structure-loss report: CELEX 32006L0114

## Executive finding

The conversion preserves most text and obtains a plausible reading stream, but it does not preserve a document structure model. PDF lines are grouped into transient `TextBlock` objects and then immediately serialized as ordinary DOCX paragraphs. Tables, cells, lists, page provenance, column membership, and detailed inline style evidence are lost before validation and segmentation.

For this document, the most consequential loss is three visually evident Annex tables. PyMuPDF's generic `Page.find_tables()` detects none because these tables are primarily aligned text without dependable ruling lines. Geometry nevertheless identifies approximately 100 logical cells. The production converter emits 101 ordinary paragraph fragments for them.

## Exact transformation

1. `page.get_text("dict", sort=False)` returns PDF blocks containing lines and spans.
2. `_line_block` concatenates every span in one line and keeps only page, bounding box, maximum font size, any-bold, and any-italic.
3. `_blocks_from_dict` joins adjacent lines only when the vertical gap is at most 1.15 line heights and left edges differ by at most 25 points.
4. `_reading_order` removes likely running margins, detects a coarse two-column layout, then emits top-full-width, left-column, right-column, and footnote-like blocks.
5. `_write_blocks` emits one DOCX paragraph per ordered block unless `_can_continue` joins it to the previous paragraph. Joining is text-driven: the previous text must not end in `. ; : ? !`, and the next block must begin with lowercase text or a quote.
6. The raw DOCX carries no PDF node IDs, page number, coordinates, table membership, column membership, or confidence.
7. Reading-order validation reclassifies structure from paragraph text alone.
8. Footnotes are reconstructed after validation by matching citation-like body paragraphs and source markers.
9. Normalization changes styling and page setup but does not restore lost structure.
10. `extractDocxLegalText` turns each visible DOCX paragraph into one newline. `segmentLegalDocument` treats every non-empty line as a segment, so conversion paragraph boundaries become CAT/translation boundaries.

## Detectable PDF evidence versus retained evidence

| Evidence available from current stack | Currently retained after reconstruction |
|---|---|
| Text blocks, lines, spans | Only concatenated text |
| Page and block order | Implicit paragraph order only |
| Bounding boxes and character geometry | Lost |
| Font name, size, flags, color and span boundaries | Reduced to max size and any-bold/italic |
| Repeated x positions and aligned row baselines | Lost |
| Page dimensions and margins | Used transiently, then lost |
| Two-column regions | Linearized; region identity lost |
| Running-header/footer geometry | Used by a heuristic; decision provenance lost |
| Heading typography and placement | Reduced to regex or coarse bold/size test |
| Footnote placement and marker evidence | Flattened, then heuristically reconstructed |
| Lists and numbering | Literal text only |
| Page boundaries | Empty DOCX break paragraphs, without content provenance |
| Tables/rows/cells | Generic detector returns none; aligned cells become paragraphs |

## 32006L0114 measurements

Direct measurements:

- 7 PDF pages
- 195 PDF text blocks
- 554 PDF lines
- 3,362 PDF spans
- 287 production `TextBlock` objects after line grouping
- 275 ordered content blocks
- 12 blocks removed as running margins
- 265 raw DOCX paragraphs, including 6 empty page-break paragraphs
- 259 non-empty raw DOCX paragraphs
- 33 paragraphs styled as headings by the writer
- 0 tables and 0 cells detected by `Page.find_tables()`

Reviewed structural inventory:

- Annex I Part A: one text-aligned two-column table, approximately 3 rows and 6 logical cells; emitted as 7 fragments.
- Annex I Part B: one 4 × 3 table, 12 logical cells; emitted as 12 paragraphs.
- Annex II: one 41 × 2 correlation table, 82 logical cells; emitted as 82 paragraphs.
- Total: 3 source tables, approximately 100 logical cells, and no DOCX table nodes.
- Estimated non-table logical nodes: 157, medium confidence.
- Confirmed unnecessary paragraph boundaries: at least 4—three multi-line Annex I Part A cells and one split citation/footnote continuation. This is a lower bound, not a claim that every short fragment should be merged.

## Structure-specific findings

### Correlation and Annex tables

Rows and columns are visually recoverable from repeated x anchors and matching y baselines. The page 7 correlation table has two stable columns and 41 row baselines. Flattening destroys row pairing and causes table references such as `Article 1` and `Annex I` to be indistinguishable from headings.

### Article and Annex headings

Genuine headings have useful evidence beyond text: placement, surrounding whitespace, font evidence, sequence context, and neighboring body structure. That evidence is discarded. A table cell with identical text therefore becomes equivalent to a heading paragraph.

### Numbered legal paragraphs and lists

Numbering remains literal text. There is no `ListItem`, nesting level, marker/body separation, or continuation relationship. A wrapped continuation can become a new paragraph if its source block or indentation differs.

### Recitals

Only text beginning `(<number>) ` receives a left indent. No recital node or stable recital identifier is retained. Recital continuations and cross-page continuation are not represented explicitly.

### Footnotes and citations

Footnote text starts in the body stream. A later pass recognizes only OJ-style notes and searches earlier paragraphs for marker text. Page boundaries are inferred from DOCX breaks. Source coordinates, baseline, note region, and marker-to-note geometry are unavailable. One citation continuation in this document is split because the continuation starts with a digit.

### Page boundaries and columns

Page boundaries become empty break paragraphs. `_write_blocks` may merge over a page boundary only when `_can_continue` permits it, but no node records that the logical paragraph spans pages. Columns are linearized correctly for the main body, but the column-region evidence is lost and table columns are confused with page columns.

### Multi-line paragraphs

Normal visual wrapping does not inherently create a new paragraph when lines remain in the same PDF block and satisfy the geometry threshold. Fragmentation still occurs when:

- the PDF producer emits separate source blocks;
- indentation changes by more than 25 points;
- vertical spacing exceeds 1.15 line heights;
- the next block begins with uppercase text, a number, or most punctuation;
- a page, column, table, list, or footnote region boundary intervenes.

Conversely, multiple source blocks should be merged when they share a typed paragraph identity and continuation evidence. Text casing alone is not sufficient.

## Structurally different content currently flattened identically

All of the following can become an ordinary `<w:p>` with literal text:

- a legal heading;
- a body paragraph;
- a numbered paragraph or list item;
- a table cell;
- a footnote body before reconstruction;
- a citation;
- a running-margin fragment that escaped filtering;
- an Annex label used as a table reference;
- a short isolated title or subtitle;
- a continuation fragment from another PDF block.

The result is not merely a formatting problem. The same paragraph stream feeds legal validation and one-line-per-segment translation units.

## Recommendation

Introduce a typed, provenance-preserving intermediate document before DOCX generation. Table detection must combine text geometry, repeated x anchors, row baselines, whitespace gutters, and optional ruling lines; it cannot depend only on `find_tables()`. Validation and segmentation should consume typed nodes, while DOCX becomes one rendering of the same model.

AI should be reserved for low-confidence boundary or role choices after deterministic evidence has been computed. It should choose among supplied node/boundary labels and copy source text unchanged.
