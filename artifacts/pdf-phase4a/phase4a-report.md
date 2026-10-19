# Phase 4A report

## Result: PASS

Frozen DOCX hash verified: `AE76DE601F14512BFB1CC467D188397807F237EB159199A935076046F380628A`. Untouched SDLXLIFF hash: `180F01588098B993ECAEF5C2B8D0FABA67C12F01CED9D1B8B4D73C1C60AF3260`. Studio produced **2359 trans-units** and **2297 visible CAT segments**. There are 62 empty structural units, 0 multi-segment units and 556 table-context units.

All 95 MERGE decisions, 11 KEEP_BOUNDARY decisions and 54 ABSTAIN boundaries were checked through the projection. MERGE decisions remain within reconstructed source units; KEEP boundaries remain separate; ABSTAIN boundaries remain conservative.

The DOCX contains 8 native tables, 278 rows and 556 cells, with zero multi-paragraph cells. Studio preserves the table-context projection across the eight physical segments of the logical table. Articles 1–29 and Annexes I–XII remain identifiable; no references were promoted to heading context.

Source integrity against the Phase 4 baseline of 30922 normalized tokens: **PASS**. No translation, target insertion, input modification, reconstruction change or production change occurred.

The experimental PDF → typed model → DOCX → Studio validation program is now sufficiently validated to proceed to production integration design.
