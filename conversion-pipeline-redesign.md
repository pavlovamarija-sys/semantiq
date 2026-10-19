# PDF-to-DOCX conversion pipeline redesign

## Target pipeline

```text
PDF bytes
  -> immutable low-level extraction
  -> layout regions and reading order
  -> typed intermediate document
  -> deterministic structural validation
  -> optional constrained AI review of ambiguous boundaries
  -> canonical DocumentNodes and TranslationUnits
  -> DOCX renderer
  -> DOCX structural round-trip validation
```

## Stage 1: immutable extraction

Capture pages, text blocks, lines, spans, characters where necessary, images, drawings, font metadata, and bounding boxes. Assign stable source IDs before any merge. Preserve the original extracted text and record extraction-engine versions.

## Stage 2: layout-region analysis

Partition each page into running margins, full-width regions, columns, tables, footnote regions, and body regions. Use deterministic evidence:

- repeated header/footer positions across pages;
- whitespace gutters and overlapping y ranges for columns;
- repeated x anchors and y baselines for text-only tables;
- ruling lines and filled rectangles when present;
- font, placement, whitespace, and sequence context for headings;
- bottom-page placement, smaller type, markers, and call-site linkage for footnotes.

For 32006L0114, repeated x anchors and 41 paired y baselines deterministically identify the Annex II table even though `find_tables()` reports no table.

## Stage 3: paragraph and list reconstruction

Build logical paragraphs inside typed regions. Merge blocks deterministically when geometry, style, punctuation, indentation, and region continuity agree. Preserve a merge decision record.

Deterministic decisions include:

- joining normal wrapped lines within the same block;
- dehyphenating line-wrap hyphens only when lexical and geometry evidence support it, while retaining original spans;
- joining cross-block continuations with matching indentation/style inside one body region;
- keeping distinct numbered legal paragraphs and list items;
- pairing aligned table cells by row baseline;
- carrying a paragraph over a page break when continuation evidence is strong;
- excluding repeated running margins with recorded provenance.

## Stage 4: constrained ambiguity resolution

AI adds value only when deterministic evidence remains genuinely ambiguous, for example:

- whether an isolated short line is a heading or body fragment when typography is inconclusive;
- whether two cross-page fragments form one paragraph;
- whether an unusual aligned region is a table or parallel columns;
- whether indentation denotes a nested legal point or visual wrapping;
- whether an OCR-damaged marker denotes a footnote, recital, or list item.

The classifier receives exact candidate text, neighboring nodes, geometry summaries, and allowed labels. Its output must be structured, confidence-bearing, and limited to labels/boundaries. It must not rewrite, translate, normalize, or complete legal text. Low-confidence decisions become review warnings.

## Stage 5: validation over typed structure

Reading-order validation should validate:

- `Heading(kind="article")` sequences within the body section;
- `Heading(kind="annex")` sequences at the document hierarchy level;
- table row and column consistency separately;
- list/paragraph numbering within their structural parent;
- footnote call/body completeness;
- source-span coverage and one-to-one provenance;
- text conservation before and after rendering.

References in `TableCell` or body text cannot enter heading sequences.

## Stage 6: downstream consumers

### DOCX generation

Render typed nodes to native Word constructs:

- headings to heading paragraphs with stable bookmarks;
- paragraphs to paragraphs;
- lists to Word numbering;
- tables to `<w:tbl>` with rows and cells;
- footnotes to native footnotes;
- physical page boundaries to controlled breaks only where layout requires them;
- provenance IDs to custom XML, bookmarks, or a sidecar manifest.

DOCX normalization must preserve node boundaries and table structure instead of forcing every paragraph to an indistinguishable Normal-style block.

### Canonical DocumentNodes and TranslationUnits

Persist the typed model before rendering. Derive translation units from semantic nodes, not DOCX newlines. Store derivation version and source node IDs so segmentation can be regenerated without losing auditability.

### Studio segmentation

Export proper table cells, list items, headings, paragraphs, and footnotes. Studio then receives meaningful paragraph boundaries. Sentence-level segmentation can occur inside a logical node according to the selected SRX rules, without conversion artifacts becoming hard boundaries.

## Migration boundary

The existing worker can retain PyMuPDF and its service boundary. The coherent change is to replace `TextBlock -> DOCX` as the central abstraction with `low-level extraction -> typed document -> renderers`. The validator regex should not be patched in isolation.
