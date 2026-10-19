# Phase 3D report

## Result: PARTIAL

The generalized deterministic rules were integrated into the isolated spike, and 32006L0114 remains regression-clean. The frozen 32006L0126 source, span coverage, ordered-token integrity, legal heading sequences, table reconstruction, page-4 rejection, page-40 final row, page-41 table, pages 41–43 continuity, and repeated-header gates all pass.

The run exposed a new material validation-scope defect and stopped before DOCX generation. The executable candidate detector classified **78** boundaries rather than only the previously frozen 30: **28 MERGE**, **4 KEEP_BOUNDARY**, and **46 ABSTAIN**. The 46 abstentions were safely retained and explicitly recorded, but Phase 3C did not validate these additional candidate boundaries. The two additional merges beyond the Phase 3C reference total are likewise outside that frozen evaluation set.

No rule was tuned after observing this result. No final DOCX or SDLXLIFF was generated. Production conversion, database, and CAT code remain unchanged; no AI was used.

## Frozen hashes

- Source PDF: `0E6E7DF9EF641AFEBECF692CE9E1AF7C8CA2F2AD2E4C82950AD6ECF81A3D55EE`
- Stopped-run typed model: `F1AD1CF23728B40CA0302D528B53AC606EE22D97B4B987087A56F5EEA1C8F040`
- Final DOCX: not generated
