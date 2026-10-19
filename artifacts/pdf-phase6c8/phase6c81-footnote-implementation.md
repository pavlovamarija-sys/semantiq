# Phase 6C.8.1 — Source-faithful footnotes

## Result

**PARTIAL.** The structural implementation and automated integrity gates pass. All seven notes in CELEX 32006L0114 are represented as native OOXML footnotes with uniquely proven same-page anchors. Final PASS is withheld pending a Microsoft Word/Trados visual roundtrip because LibreOffice does not faithfully render OOXML custom footnote marks.

## Implementation

- Added explicit `FootnoteBody` and `FootnoteReference` typed nodes. Every reference retains source page, block/line/span provenance, geometry, reading-order evidence, original marker, source offset and body identity.
- Added deterministic page-bottom region classification. The classifier requires numbered note syntax, bottom-margin geometry, a unique exact marker on the same physical PDF page, and vertical precedence. It never binds by adjacency.
- Corrected page-one node `listitem-4000388ab09f133b` from `ListItem` to `FootnoteBody`; the other two source regions remain footnotes but are split into individual logical notes.
- Added fail-closed handling for absent, duplicate, cross-page and ambiguous anchors. Legal subdivisions such as `8(1)` are excluded from citation-anchor matching.
- Added native `word/footnotes.xml`, document relationships/content type, `w:footnoteReference` anchors and custom source markers. Footnote bodies are no longer emitted as ordinary body paragraphs.
- Extended canonical extraction so each body becomes a complete translatable footnote TU and each anchor becomes a protected `footnote_reference` inline code. Existing DOCX files without native footnotes retain the Phase 6C.5 extractor identity and behavior.

## Evidence

- Three source regions produced seven individual notes: page 1 = 4, page 2 = 2, page 3 = 1.
- Seven anchors resolved uniquely; unresolved mappings = 0.
- PDF → typed model → DOCX normalized text integrity: PASS, 3,389 tokens.
- Canonical extraction: 426 nodes, 269 TUs, 10 inline codes; seven footnote TUs and seven footnote-reference codes.
- OOXML package contains seven positive-ID footnote bodies and seven references.
- Focused and endpoint regression tests: 28/28 PASS.

## Visual comparison

The experimental DOCX was rendered through LibreOffice and compared with source PDF pages 1–3. The note content is moved out of body flow and attached to native anchors. The existing generic serializer still produces 15 pages versus the source PDF's 7 pages; pagination/layout correction is explicitly outside this phase.

LibreOffice renders custom-mark footnotes differently from the OOXML/Word contract (it exposes automatic numbers in addition to custom marks). The source-faithful implementation therefore needs one fresh Microsoft Word and Trados projection check before final PASS. No source mapping is unresolved, and no workaround was added that would flatten notes or weaken anchor validation.

## Files changed

- `workers/pdf-to-docx/app/reconstruction/footnote_structure.py`
- `workers/pdf-to-docx/app/reconstruction/core.py`
- `workers/pdf-to-docx/app/canonical.py`
- `workers/pdf-to-docx/tests/test_phase6c81_footnotes.py`

No historical artifact was changed. No translation model was called, MK1 was not regenerated, and recital/header/table/layout work was not started.
