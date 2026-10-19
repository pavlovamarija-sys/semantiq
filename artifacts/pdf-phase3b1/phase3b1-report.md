# Phase 3B.1 resumed frozen validation

## Result: PASS

The diagnostic producer/consumer mismatch is fixed by one validated schema, with regression tests for aligned-list rejection, ambiguity logging, table decisions, cross-page decisions and required-field failures. The repair changed diagnostic representation only.

The resumed frozen 32006L0126 run passes all original Phase 3B targets:

- page 4 aligned list remains ordinary structure, with an explicit rejected-table ambiguity;
- page 40 contains 7×2 and 8×3 tables, including the former omitted final row;
- page 41 is one 33×2 table segment;
- pages 41–43 share logical table `logicaltable-65d01ed47d091724`, totaling 113 rows across page-preserving physical segments;
- repeated headers on pages 42 and 43 are explicitly marked and their source occurrences remain represented once;
- Articles 1–19 and Annexes I–VIII validate in order.

Text integrity passes across 27,433 source spans and 18825 normalized ordered tokens with no omission, addition, duplication, word change or source-order defect. The experimental DOCX contains 5 native tables, 128 rows and 264 cells; every logical cell is one `w:p`, with 4 controlled line breaks.

The 33 Phase 3A paragraph cases were reclassified without changing reconstruction: {'genuinely ambiguous': 30, 'false alarm removed by structural reconstruction': 3}. No genuinely ambiguous case was resolved.

Hashes:

- source PDF: `0E6E7DF9EF641AFEBECF692CE9E1AF7C8CA2F2AD2E4C82950AD6ECF81A3D55EE`
- experimental DOCX: `9F6EE3354DD1F36395F374BBA51E4213C9352356542067FFBD39050830230D3B`

32006L0114 remains PASS. No new material structural defect appeared. No production, DB, CAT, Studio or AI path was changed or invoked.
