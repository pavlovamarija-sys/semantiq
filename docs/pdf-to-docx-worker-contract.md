# PDF-to-DOCX conversion worker contract

The web application must not convert PDFs in-process. `pdf2docx 0.5.13` and the
custom ElementTree OOXML rewriter were removed because the rewriter did not
preserve Word markup-compatibility namespace prefixes. It could leave
`mc:Ignorable` referring to prefixes no longer declared under those names. The
old structural validator parsed the XML but did not validate that semantic
OOXML rule, so Microsoft Word could report and repair the package.

Run conversion in the isolated worker under `workers/pdf-to-docx`. V1 uses the
geometry-aware PyMuPDF conversion pipeline behind a replaceable backend.
LibreOffice is not used as a PDF-to-editable-DOCX engine, and Microsoft Word
desktop automation is unsupported for unattended server use.

## HTTP request

`POST /analyze/pdf` with bearer authentication and the original PDF in the
`document` multipart field performs server-side source integrity validation and
canonical PyMuPDF text extraction. It returns the extracted source text,
character counts, and extraction diagnostics as JSON. The web application must
use this endpoint for PDF upload, backfill, and pre-conversion validation; it
must not load browser PDF.js or a PDF.js worker in the Next.js server runtime.

`POST /convert/pdf-to-docx` with bearer authentication and multipart fields.
`PDF_TO_DOCX_SERVICE_URL` may contain either the worker base URL or this full
endpoint URL; the Next.js client normalizes both forms.

- `document`: original PDF bytes
- `profile`: JSON formatting and preservation requirements supplied by the app

The worker must preserve the original PDF outside this call; the application
already retains it as the immutable source version and records the derived
DOCX's source-version provenance.

## Required worker pipeline

`/convert/pdf-to-docx` uses the typed reconstruction and validated native DOCX
renderer by default. The historical converter remains available only as an
explicit operational rollback with `PDF_TO_DOCX_CONVERTER_MODE=legacy`. There
is no automatic fallback: a typed reconstruction, source-coverage,
reading-order, table-shape, footnote, text-integrity, or OOXML gate failure
returns a non-success response and no DOCX bytes.

1. Verify the input is a PDF.
2. Remove running margin material, detect columns geometrically, and reconstruct
   top full-width content followed by complete left and right column streams.
3. Validate Article, Chapter, Annex, and enacting-formula reading order. An
   impossible sequence fails here and cannot be marked Ready.
4. Match detected PDF footnote markers page-locally, create genuine
   `w:footnoteReference` nodes and `word/footnotes.xml`, and validate that every
   detected note has one complete, non-duplicated representation. Ambiguous
   matches return `footnotes_need_review` for a Needs review state.
5. Convert with editable text/OCR enabled as appropriate, preserving document
   structure, tables, and real Word footnotes to the engine's capability.
6. Apply the supplied profile through the Word document object model. The one
   optional exception is a targeted update of an existing `footnotes.xml` part,
   because python-docx does not expose footnotes; all other parts remain byte
   preserving and the entire package is then reopened and resaved.
7. Save as genuine DOCX/WordprocessingML.
8. Reopen the saved result through the document engine and save it once more.
9. Validate the OOXML package and return the final bytes only after success.

## HTTP response

The analysis response reports `integrityValidated`, `sourceText`,
`charactersWithoutSpaces`, `charactersWithSpaces`, `diagnostics`, and a
separate nullable `countError`. A validated PDF with a text-extraction/counting
failure can still proceed to conversion or OCR, while a package/page-tree
integrity failure remains fail-closed.

The conversion response provides:

- Status `200`
- Content-Type `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- `X-Converter-Engine`: exact product and version
- `X-OOXML-Validated: true`: set only after the reopen/parse round-trip
- `X-Reading-Order-Validated: true`: set only after legal-order validation
- Body: final DOCX bytes

Any conversion, formatting, reopen, or validation failure must return a
non-success status and no document. The app has no plain-text or HTML fallback:
it marks the transformation Failed and never uploads or marks Ready.

## Page geometry contract

The validated renderer and the application-side DOCX validator share an exact
twip-based geometry contract:

- portrait: 12240 x 15840 twips; top/bottom margins 1440; left/right margins
  1797;
- landscape: 15840 x 12240 twips with `w:orient="landscape"`; all margins 680.

Orientation is selected from source layout evidence. Landscape margins provide
the printable width needed by wide legal tables and are not replaced with the
portrait margin profile. Every section remains one-column, and each native
table's `w:tblGrid` width must be positive and no greater than the printable
width of the Word section that contains it.

Typed output marks structural headings with a non-visual `w:outlineLvl` while
retaining the Normal paragraph style and explicit source-derived formatting.
This allows the application validator to distinguish headings from running
text without relying on English wording. Main body text remains justified;
table-cell alignment must be explicit; native footnotes remain 10 pt with
zero paragraph spacing and single line spacing.
