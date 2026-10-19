# Page-furniture exclusion

The reconstruction now removes the complete recurring Official Journal running-header paragraphs from the legal document stream. The rule requires both exact known OJ header text and top-margin geometry; it does not match legal citations or body text containing “Official Journal”.

For 32006L0114, four paragraphs were excluded on each of seven pages: publication date, `EN`, `Official Journal of the European Union`, and the page identifier. This is 28 spans total.

The excluded spans remain in `page-furniture` diagnostic records and in `layoutAnalysis.excludedPageFurniture`, including page, block, line, span and bounding-box provenance. The reconstruction source-coverage gate accounts for them explicitly as excluded spans:

- extracted spans: 3,362
- legal-model spans: 3,334
- explicitly excluded furniture spans: 28
- unaccounted spans: 0

The new experimental DOCX contains no page-furniture paragraphs or text. Its canonical projection therefore excludes the furniture as well. Blank paragraphs retained in the DOCX are six explicit page-break paragraphs only; no furniture-generated blank paragraphs remain.

The Directive title, legal text, recital numbers, citations, all seven native footnotes, three tables, 48 rows, 100 cells and six page breaks remain preserved.

The exact source PDF → DOCX visual pagination remains a separate layout task and was not changed here.
