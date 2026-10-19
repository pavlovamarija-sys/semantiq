# Phase 6C.8 regression tests

1. Footnotes: three source regions split into seven individual notes; each anchor appears once; each note body appears once in `word/footnotes.xml`; no note body remains in body text; canonical/CAT mapping covers every note.
2. Recitals: markers 1–21 associate with the correct bodies, including recital 11 across a physical page boundary; no marker-only TU; no false association with footnote markers or numbered legal paragraphs.
3. Furniture: all seven OJ headers detected; `EN` is never an ordinary legal-content TU; configured output has correct Macedonian label or intentional omission; dates/page identifiers retain provenance.
4. Tables: 3 tables, 48 rows and 100 cells remain; widths/order/alignment match geometry tolerances; multi-line cells stay one logical unit; Annex references remain cells.
5. Layout: page size, margins, sections/columns, headings, keep rules and page breaks pass OOXML checks and rendered visual comparison; text/order integrity remains exact.
6. Terminology: one approved equivalent per controlled term; detect hyphenation/capitalization variants; reject inconsistent Official Journal citation forms; attach evidence to every constrained TU.
7. CAT: complete ordered mapping across body, tables and footnotes; furniture exclusions are explicit; skeleton and protected codes remain intact.
8. Immutability: old artifacts/hashes remain unchanged; corrected artifacts use new generations and lineage; retries are idempotent; no automatic MK2 or approval transition.
