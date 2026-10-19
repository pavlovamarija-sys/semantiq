# Phase 6C.8 — Explicit document typography

The isolated renderer now emits explicit source-derived formatting instead of Word's automatic semantic styles.

## Changes

- Heading nodes remain headings in the typed model, but serialize as ordinary paragraphs with direct formatting.
- List items remain legal list nodes, but do not receive Word list styles, numbering, bullets, or artificial indentation.
- Title, subtitle, `Whereas`, Article headings, Annex headings, table content, citations, and recitals use direct font, size, bold, italic, alignment, and black-color properties derived from PDF style evidence.
- Every generated body paragraph uses the Normal paragraph style as a neutral base; semantic meaning remains in the typed model and canonical node metadata.
- Footnote references and footnote markers are explicitly black; native footnote relationships and page-local markers remain unchanged.
- No automatic bullets, blue theme text, Heading/Title/List paragraph styles, or `w:numPr` elements are emitted.

## Controlled output

`artifacts/pdf-phase6c8/32006L0114-typography-experimental.docx`

- SHA-256: `3471557af848d5891dabd2bdbd73c3b4e359b30d9c2fab68f0fc8a04c46bbf8a`
- Size: 44,923 bytes

## Validation

- Text integrity: PASS, 3,319 legal tokens.
- Native footnotes: 7 preserved.
- Tables: 3 tables, 48 rows, 100 cells.
- Page breaks: 6 preserved.
- Canonical projection: 400 nodes, 243 TUs, 10 inline codes.
- `w:numPr`: 0.
- Heading/Title/List paragraph styles in document XML: 0.
- Non-black explicit colors in document XML: 0.
- Worker tests: 56/56 PASS.
- TypeScript typecheck: PASS.

The source-derived formatting does not alter immutable artifacts, translation content, or canonical database data. Exact source pagination remains a separate layout concern.
