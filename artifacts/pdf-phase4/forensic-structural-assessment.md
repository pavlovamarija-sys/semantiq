# Phase 4 forensic structural assessment

The unseen CELEX 32006L0042 reconstruction completed once with the frozen algorithm. No repair, tuning, special case, AI classification, or rerun was performed.

## Structural result

- 63 pages, 1,791 blocks, 3,917 lines and 48,170 spans were extracted.
- All 48,170 source spans were represented exactly once.
- 30,922 normalized ordered tokens were preserved.
- Reading-order validation passed with Articles 1–29 and Annexes I–XII in sequence.
- Eight physical whitespace-aligned table segments were retained as one logical table across pages 56–63: 278 rows and 556 cells.
- The generated DOCX contains 8 native tables, 278 rows, 556 cells and zero multi-paragraph cells.
- PDF → typed model → DOCX text integrity passed with zero missing, added, duplicated, changed or reordered tokens.

## Boundary assessment

- 95 MERGE decisions: 0 material false merges.
- 11 KEEP_BOUNDARY decisions: 0 material false keeps.
- 54 ABSTAIN decisions: safe conservative retention; no source-integrity or reading-order defect resulted.

No false table, incorrect cross-page join, heading/reference confusion, list-order defect, or material reading-order defect was identified. Minor conservative fragmentation remains an expected non-failure outcome.
