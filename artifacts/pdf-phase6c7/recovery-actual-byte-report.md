# Phase 6C.7 actual-byte recovery verification

## Classification

**PARTIAL — Phase 6C.7 is not PASS.** Both downloaded artifacts exactly match their persisted SHA-256 and sizes, and the SDLXLIFF passes every gate. The DOCX has one deterministic serialization defect affecting the three protected line-break TUs.

## SDLXLIFF

The file is valid UTF-8/XML and contains 271 Studio trans-units: 265 populated translation targets and the six original empty page-break units. Every canonical TU maps once and in order. All targets match the persisted Macedonian text and all three protected line breaks match their original Studio representation. Replacing only populated targets with `<target/>` reproduces the untouched source SDLXLIFF byte-for-byte. No U+FFFD exists.

The 43 source-identical targets are exclusively dates, OJ page identifiers, `EN` markers, parenthesized numbering markers and em dashes. They are legitimate invariant/structural units, not untranslated lexical text.

## DOCX

ZIP CRC and required OOXML parts pass. It preserves 273 paragraphs, 3 tables, 48 rows, 100 cells, 6 page breaks and 1 section. Every one of the 265 TUs maps uniquely and in order. Paragraph properties and every package part other than `word/document.xml` are unchanged; the additional `word/` item is only a ZIP directory entry.

Three target paragraphs fail exact text equality:

- ordinal 158, `tu-1d6b6715f26ec06e48647069`
- ordinal 159, `tu-7bf505c2a900f9a86b97de59`
- ordinal 160, `tu-edbd0025cb74eda0d259f0f4`

Each expects one protected line break but contains two. The cause is deterministic: `targetXml()` inserts a new `<w:br/>` for the target newline while reconstruction retains the existing source paragraph `<w:br/>`. This produces an unwanted blank line in each affected DOCX paragraph. No omission, duplication or ordering issue exists outside those three extra breaks.

## Persistence and isolation

Recovery generation `0aef4e29-711a-4cd1-9e9d-1d3f4bc560a2` and run `7ec58b3d-5829-48da-83e5-9146097dc06b` remain completed/available. Immutable lineage, 27 checkpoints, 265 translations and idempotency pass. Historical failed generations remain unchanged. Recovery has no provider path and made zero additional GPT-5.6 calls.

The current artifacts must remain immutable evidence. The next action is a narrowly scoped DOCX line-break serialization correction followed by a new immutable recovery output and actual-byte verification. No MK2 or production cutover is justified yet.
