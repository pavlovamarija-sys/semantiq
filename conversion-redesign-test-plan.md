# Conversion redesign test plan

## Test principles

Tests must verify text conservation, typed structure, provenance, rendering, and segmentation independently. AI output must never be the sole oracle. The neutral 32006L0114 document is a required regression fixture.

## 1. Low-level extraction tests

- Every PDF text span receives a stable ID, page, bounding box, font evidence, and reading-order candidate.
- Repeated extraction produces identical IDs and ordering.
- Excluded running margins remain in diagnostics with exclusion reasons.
- Character conservation is checked before structural reconstruction.

## 2. Layout-region tests

- Single-column, two-column, and mixed full-width/two-column pages.
- Text-only tables with no ruling lines.
- Ruled and partially ruled tables.
- Footnote regions and repeated running headers/footers.
- Tables inside annexes and body articles.
- Short centered lines that are and are not headings.

For 32006L0114 assert:

- Annex I Part A is represented as a table-like region with approximately 3 rows and 2 columns.
- Annex I Part B is exactly 4 rows × 3 columns.
- Annex II is exactly 41 rows × 2 columns.
- `Article 1` and `Annex I` inside Annex II are `TableCell` content, not headings.

## 3. Paragraph reconstruction tests

- Normal visual line wraps remain one paragraph.
- Separate PDF blocks with strong continuation evidence merge.
- Uppercase and digit-led continuations can merge when geometry and region evidence support it.
- Separate legal paragraphs never merge merely because the next starts lowercase.
- Cross-page paragraph continuation is preserved as one logical paragraph with an internal `PageBreak` provenance event.
- Hyphenated line wraps conserve original spans and produce a documented canonical text decision.
- Numbered paragraphs, points, and subpoints retain marker/body separation and nesting.

For 32006L0114 assert:

- the split citation/footnote continuation is one logical node;
- each multi-line Annex I Part A cell is one cell paragraph;
- preamble clauses remain distinct despite similar typography;
- each genuine Article heading remains separate from its body.

## 4. Footnote tests

- Marker, call site, and body are linked from source evidence.
- Multiple markers on one page resolve deterministically or produce a review state.
- Footnote bodies never remain duplicated in body nodes.
- Footnote references containing legal labels do not enter heading validation.

## 5. Typed reading-order validation

- Genuine Article 1–12 headings pass in order.
- Annex I–II headings pass in order.
- Standalone `Article 1` and `Annex I` table cells do not participate in heading sequences.
- A genuinely reordered heading fails with page/node provenance.
- Numbering is scoped to the correct section, list, table, or annex.

## 6. DOCX rendering tests

- Tables render as native Word tables with correct row/cell counts.
- Lists render using Word numbering while preserving literal legal labels where required.
- Footnotes render as native Word footnotes.
- Headings, body paragraphs, cells, and notes retain stable node mappings.
- OOXML reopens successfully and exact visible text is conserved.
- A DOCX round trip does not flatten tables or duplicate footnotes.

## 7. Canonical-node and translation-unit tests

- Translation units derive from typed nodes rather than XML paragraph count.
- Table-cell units retain row/column and neighboring-cell context.
- Page breaks do not create empty or duplicate units.
- Fragment merges reduce unnecessary units without merging separate legal provisions.
- Stable node IDs survive DOCX generation and MK1 reconstruction.

## 8. Studio interoperability tests

- Exported DOCX/SDLXLIFF exposes headings, body paragraphs, lists, table cells, and footnotes as intended.
- Studio SRX sentence segmentation operates within logical nodes.
- Table row/column context is recoverable in package metadata or provenance.
- Reimport maps every target segment to the original canonical node exactly once.

## 9. AI-classifier tests

- Use a frozen set of ambiguous boundary cases with human labels.
- Require structured labels, evidence references, and confidence.
- Verify byte-for-byte source-text preservation.
- Reject outputs that rewrite, omit, add, translate, or reorder text.
- Route low-confidence cases to review rather than silently deciding.
- Benchmark against the deterministic baseline and adopt only if boundary precision improves materially.

## 10. Acceptance gates

The redesign is acceptable only when:

1. all source spans are accounted for;
2. 32006L0114 has three retained tables and no table-cell heading false positives;
3. genuine Article and Annex sequence defects still fail;
4. confirmed false paragraph boundaries are eliminated without merging distinct legal units;
5. canonical-node text equals rendered DOCX visible text under the defined whitespace policy;
6. TranslationUnit count and boundaries are explainable from typed nodes;
7. Studio round-trip mapping is complete and one-to-one.
