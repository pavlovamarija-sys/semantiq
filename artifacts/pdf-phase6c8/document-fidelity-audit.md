# Phase 6C.8 — document fidelity audit

## Outcome

The audit is complete. The MK1 DOCX is text-complete and technically consistent with its validated DOCX template, but that template is not a faithful professional Word representation of the Official Journal PDF. Most structural defects originate before translation: the typed reconstruction or frozen DOCX serializer flattened legally meaningful PDF layout into ordinary body paragraphs. Canonical extraction, Studio projection and MK1 reconstruction then preserved that flattened representation correctly.

No immutable artifact was changed. No translation or paid model call was executed.

## 1. Footnotes — highest priority

The PDF evidence contains three bottom-of-page note regions. The typed model recognizes two as `Footnote` (`footnote-3d51a1b5ae58b38d`, page 2; `footnote-b579fbf534a42cda`, page 3), while the four-note page-1 region is incorrectly classified as `ListItem` (`listitem-4000388ab09f133b`). None has an explicit typed relationship to the corresponding call marks in body text.

The frozen serializer only handles Heading, Paragraph, Table and PageBreak. It writes every other content node as an ordinary paragraph. Consequently the validated DOCX has no `word/footnotes.xml`, no footnote relationship and zero `w:footnoteReference` anchors. Canonical extraction therefore reports zero footnote nodes and creates ordinary TUs 24, 54 and 87 for the flattened note blocks. Studio and MK1 preserve those body units; they do not cause the loss.

Required architecture: represent `Footnote`, `FootnoteBody`, and `FootnoteReference` explicitly, with stable anchor/body identity and provenance. Resolve references deterministically before DOCX serialization. Serialize real OOXML footnotes and validate one-to-one anchors, body removal, ordering and formatting. Canonical extraction must read `word/footnotes.xml` and emit linked footnote TUs instead of scanning only `word/document.xml`.

## 2. Recital association

All 21 recital numbers are independent body paragraphs/TUs at ordinals 15, 17, 19, 21, 23, 27, 29, 31, 33, 35, 37, 41, 43, 45, 47, 49, 51, 53, 57, 59 and 61. Their following recital text is a separate sibling with no parent/association field. This starts in PDF reconstruction: the marker and text occupy separate aligned blocks, and the classifier never creates a `Recital` container. The serializer and canonical extractor preserve the two-paragraph shape.

The defect is especially visible across the page-1/page-2 boundary: marker `(11)` precedes a page break and OJ furniture, while its body appears after that furniture. Pure adjacency is therefore insufficient. Required architecture: a `Recital` node containing a marker and one logical content paragraph, associated using geometry, numbering sequence, column region and continuation evidence. DOCX output should use one paragraph with numbering/hanging-indent semantics, while canonical and CAT identity remain one recital TU or an explicitly linked marker/content pair.

## 3. Headers, language labels and page furniture

The PDF has recurring OJ furniture around y=50–60 points on every physical page. The typed model classifies it as ordinary paragraphs. The validated DOCX has no header/footer parts; dates, OJ titles, `EN`, and `L 376/n` page identifiers are ordinary body TUs around explicit page breaks.

Language-label TUs are ordinals 2, 39, 73, 105, 134, 154 and 180. MK1 ordinals 134 (`tu-e226442dfc1c0648ee38db47`) and 180 (`tu-519106e558babf740e944c3c`) remain `EN`; the others became `MK`. That inconsistency is a translation defect, but the systemic cause is earlier: page furniture should never have been ordinary legal-content TUs.

Required architecture: classify repeated margin content as `PageFurniture` with roles such as language label, publication date, journal title and page identifier. Decide by policy whether the editable output uses real Word headers/footers or omits source-publication furniture while retaining provenance. Do not send page identifiers to ordinary legal translation.

## 4. Tables, annexes, layout and pagination

The three logical tables survive as native DOCX tables (48 rows, 100 cells; column counts 2/3/2), and Studio/MK1 retain cell identity and order. This is the strongest part of the pipeline. However, the serializer starts from a blank Word document, applies `Table Grid`, and does not consume retained PDF coordinates for widths, borders, alignment or spacing. The DOCX has one section, one column, no headers/footers and six explicit page breaks. It therefore preserves physical boundary markers, not source pagination or the two-column OJ composition.

Required architecture: add a layout profile and serializer contract covering page size/margins, sections/columns, table widths, cell alignment, border evidence, heading spacing, keep-with-next, widow/orphan behavior and annex continuation. Pagination must be validated by rendering/visual comparison, not inferred from six `w:br type="page"` elements.

## 5. Terminology

The translation is complete but lacks document-level approved-term enforcement. Proven variations include:

- `Member States`: `земјите-членки`, `земјите членки`, `Државите членки` (e.g. TUs 16, 42, 93).
- `comparative advertising`: `компаративно рекламирање` and `споредбено рекламирање` (e.g. TUs 18 and 44).
- `misleading advertising`: `измамничко рекламирање`, `заведувачко рекламирање`, and a descriptive `рекламирање што доведува во заблуда`.
- Official Journal citations: `Службен весник`, `Сл. весник`, and `Сл. весник на ЕУ`.
- `Directive` capitalization varies without a structural rule.

Required architecture: resolve approved terminology before generation, attach selected term evidence to every affected TU, provide batch-level term constraints, and run a deterministic document-level concordance gate before artifact finalization. AI output must not become approved terminology; unresolved conflicts must block or require review.

## Stage attribution

| Defect | Earliest defective stage | Later behavior |
|---|---|---|
| Real footnotes absent | PDF classification/linking plus typed-model DOCX serialization | Canonical/CAT/MK1 preserve flattening |
| Detached recitals | PDF structural reconstruction | Serializer and CAT preserve separate units |
| EN/page furniture in body | PDF layout classification | Translation inconsistently translates it |
| Table geometry/layout loss | DOCX serialization | CAT preserves logical cells only |
| Terminology inconsistency | Retrieval/prompt/translation QA | DOCX and SDLXLIFF faithfully carry output |

## Recommendation

Do not correct only the final MK1 DOCX. Introduce a versioned fidelity-capable reconstruction and canonical schema, regenerate new immutable artifacts from the same SOURCE_PDF, and then create a new CAT projection and translation generation. Preserve every current artifact as historical evidence. Implementation should proceed in the priority order: footnote links and OOXML footnotes; recital containers; page furniture policy; layout/table serializer; approved terminology and concordance QA.
