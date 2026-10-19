# Phase 4 report

## Result: PASS

CELEX 32006L0042 was selected before PDF structural inspection and processed once with the frozen reconstruction algorithm. No implementation changes, tuning, document-specific rules, AI, translation, or SDLXLIFF generation occurred.

The run processed 63 pages, 1,791 blocks, 3,917 lines and 48,170 spans. Every source span was represented exactly once and all 30,922 normalized ordered tokens were preserved through the generated DOCX. Reading-order validation passed for Articles 1–29 and Annexes I–XII.

The reconstruction produced eight physical segments of one logical cross-page table spanning pages 56–63, with 278 rows and 556 cells. The DOCX contains native tables, zero multi-paragraph cells and zero missing, added, duplicated, changed or reordered tokens.

Boundary evaluation found 95 MERGE decisions, 11 KEEP_BOUNDARY decisions and 54 ABSTAIN decisions. Post-run forensic review found zero material false executable decisions and no material table, cross-page, reading-order, heading/reference or list defect. Conservative abstentions are retained and are not treated as failure.

## Frozen hashes

- Source PDF: `3100C4CF8A7BF243A62D7000D9B07A8FA4F004268A312DEC3D285E76E46B966`
- Experimental DOCX: `AE76DE601F14512BFB1CC467D188397807F237EB159199A935076046F380628A`

Phase 4 stops before Studio validation, as required.
