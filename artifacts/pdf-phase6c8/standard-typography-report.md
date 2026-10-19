# Phase 6C.8 — Standard DOCX formatting

Applied to the isolated renderer for CELEX 32006L0114:

- Times New Roman, 12 pt for body, headings, tables, and footnote text.
- Black explicit font color.
- Justified body and table paragraphs.
- Single line spacing.
- 6 pt before and after every generated content paragraph.
- Zero left, right, and first-line indentation.
- Headings centered only when their source geometry is centered; otherwise left-aligned.
- Bold and italic retained only from source style evidence.
- No automatic bullets, numbering, Heading/Title/List themes, or blue text.
- Native footnote references remain protected and all seven validated footnotes remain intact.

## Experimental output

`artifacts/pdf-phase6c8/32006L0114-standard-typography-experimental.docx`

- SHA-256: `8dafc0573deaf038d419fa7e99ef1f96ff87bea611a29eae5e999be00fe0f64c`
- Size: 45,628 bytes

## Validation

- Text integrity: PASS, 3,319 legal tokens.
- Canonical projection: 400 nodes, 243 TUs, 10 inline codes.
- Native footnotes: 7.
- Tables: 3 tables, 48 rows, 100 cells.
- Page breaks: 6.
- Explicit Times New Roman runs: 255.
- Explicit 12 pt runs: 255.
- Non-black explicit colors: 0.
- Worker tests: 57/57 PASS.
- TypeScript typecheck: PASS.

Immutable artifacts, translations, canonical database data, and SDLXLIFF files were not modified.
