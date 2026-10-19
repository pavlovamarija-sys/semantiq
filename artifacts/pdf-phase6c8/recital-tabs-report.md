# Phase 6C.8 — Recital tab reconstruction

Status: PASS (experimental spike)

The 21 standalone recital numbers are now deterministically paired with their
source recital paragraphs using source geometry and legal numbering. Each is
represented by one typed `Recital` node and one DOCX paragraph containing the
original number, one literal tab, and the original recital text.

The renderer applies a 1.0 cm tab stop, 1.0 cm left/hanging indentation,
Times New Roman 12 pt, justified alignment, single spacing, and 6 pt before
and after. No automatic list numbering is used. The seven native footnotes
remain intact.

Validation evidence:

- DOCX: [32006L0114-recital-tabs-experimental.docx](32006L0114-recital-tabs-experimental.docx)
- DOCX SHA-256: `8c79cedab4032df080b424259561bd7a281e23577a8b29347210249b8d64c5c4`
- Source PDF SHA-256: `1b0fb08ec46c93b9df62675f2b898030511dfcf5df4832b15cde56681932008b`
- Recitals: 21, ordered 1–21, all tabbed and single-paragraph
- Source coverage: 3,362 spans accounted for; 28 page-furniture spans explicitly excluded
- Text integrity: PASS, 3,319 normalized tokens
- Footnotes: 7 preserved
- Tables: 3 native tables; 100 cells preserved
- Canonical typed model: recital semantics retained with `recital_number`
- Canonical projection: recital paragraphs are classified as `recital`; literal tab codes are preserved

The prior immutable artifacts were not modified. No translation or model calls
were made.

## Formatting-rules update

New experimental output: [32006L0114-formatting-rules-experimental.docx](32006L0114-formatting-rules-experimental.docx)

- SHA-256: `7781ee3fcaa7fa8930ca72f251cf2be435d162ae83d1d4e6bb3213b6adfa0ee7`
- Article headings: centered, while retaining source bold/italic evidence.
- Body page breaks: zero forced `w:br` page breaks and no blank break paragraphs.
- Annexes: exactly two `pageBreakBefore` headings, one per Annex.
- Footnotes: Times New Roman 11 pt, black, single spacing, zero before/after spacing.
- Main content: Times New Roman 12 pt, justified, single spacing, 6 pt before/after.
- Recital tabs, legal structure, tables and all seven footnote relationships preserved.

Formatting validation: PASS. The original immutable artifacts remain unchanged.

## Native footnote formatting update

New experimental output: [32006L0114-footnote-formatting-experimental.docx](32006L0114-footnote-formatting-experimental.docx)

- SHA-256: `780c267df56342c6d43c7468324c93cb65c8931f40c40ed22cb6a66fafaf3b5d`
- Footnote text: Times New Roman 11 pt, black, single line spacing.
- Paragraph indentation: 0.3 cm left with 0.5 cm hanging indent.
- Tab stop: 0.8 cm; each custom marker is followed by exactly one native tab.
- Automatic numbering and repeated-space alignment are not used.
- All seven custom markers and anchor relationships remain intact.
- Canonical readback preserves footnote tabs and the 3,319-token integrity count.

Footnote-formatting validation: PASS. No translation calls or immutable artifact
changes were made.

## PDF line-break hyphenation update

New experimental output: [32006L0114-dehyphenation-experimental-v2.docx](32006L0114-dehyphenation-experimental-v2.docx)

- SHA-256: `3549634311b7ac8435bb48fc40fec1133bf37cb58fb9bd13f415ab624a764dcc`
- Dehyphenation runs before typed-node and canonical TU construction.
- Automatic joining requires consecutive lines in the same PDF text block,
  compatible line geometry, a word-shaped alphabetic left fragment, and a
  lowercase alphabetic continuation.
- Legal identifiers, numeric/uppercase continuations, same-line hyphens, and
  recognized compound prefixes are preserved or flagged as ambiguous.
- The corrected source PDF pass produced 62 automatic joins and 1 unresolved
  ambiguity. The remaining `sub- paragraph` is retained because it is a
  legitimate legal compound candidate rather than silently rewritten.
- The four reported defects are corrected: `con- cerning` → `concerning`,
  `inter- ests` → `interests`, `Commu- nity` → `Community`, and
  `Jour- nal` → `Journal`. The same corrected text is present in footnote
  content where applicable.
- A complete DOCX scan reports no suspicious split words other than the
  explicitly retained `sub- paragraph` ambiguity.
- Synthetic regression coverage verifies split-word joining and genuine /
  ambiguous hyphen preservation.

Text, footnotes, tables, and formatting validation: PASS. No immutable artifact
was modified and no model call was made.

## Footnote 10 pt revision

New experimental output: [32006L0114-footnote-10pt-experimental.docx](32006L0114-footnote-10pt-experimental.docx)

- SHA-256: `9f3747953d489801509aac03dc0cddc84530dd134954d12fc5da626263847c8b`
- Only native footnote body formatting in `word/footnotes.xml` changed.
- Footnote body runs are Times New Roman 10 pt, black, justified, single-spaced,
  with 0 pt before/after spacing.
- Existing 0.3 cm left indent, 0.5 cm hanging indent, 0.8 cm tab stop, one
  literal marker tab, numbering and all seven anchors are preserved.
- Main document content and footnote relationships are unchanged.

## Footnote superscript-marker revision

New experimental output: [32006L0114-footnote-superscript-experimental.docx](32006L0114-footnote-superscript-experimental.docx)

- SHA-256: `e43e0aab38f83703344499962d9c9605cc9def0cd5235f7c0360bf3738bf5ca8`
- Footnote-body markers are now unparenthesized, superscript-only, and followed
  by exactly one native tab.
- Footnote text remains Times New Roman 10 pt and is not superscripted.
- No borders or outline elements are emitted.
- Existing hanging indentation, tab stops, page-local numbering, seven anchors,
  and main-document formatting are preserved.

## Footnote reference-style alignment revision

- The marker run uses the native `FootnoteReference` character style and an
  explicit `w:vertAlign="superscript"` in `word/footnotes.xml`.
- Footnote body paragraphs use `left=0`, `hanging=340` twips and one left tab
  at `340` twips (0.6 cm), so wrapped lines align with the text after the tab.
- Markers are bare numbers with exactly one real tab; no automatic numbering,
  parentheses, borders, or duplicate markers are emitted.
- Footnote text remains Times New Roman 10 pt, black, justified, single-spaced,
  with zero before/after spacing. All seven relationships and page-local
  numbering are preserved.
- Focused footnote tests: 13 passed. Full worker suite: 61 passed.
