# Validation gates

SOURCE: require immutable bytes, SHA-256, readable PDF, page count within configured limits and complete extraction. Failure blocks import/transform.

TYPED MODEL: require every source span exactly once, valid provenance, deterministic reading order, no orphan nodes, valid parent/child structure and source-token preservation. Failure blocks DOCX and marks `needs_review`.

RECONSTRUCTION: require table row/column consistency, logical-table continuity evidence, heading/reference validation and no unsafe executable ambiguity. MERGE and KEEP require evidence; ABSTAIN is explicit. Unsafe failure blocks; safe ABSTAIN may continue only when all integrity gates pass and is surfaced.

DOCX: require native serialization, reopen/OOXML validation, expected table/cell structure, one logical cell paragraph unless an explicit controlled break model permits otherwise, and no unintended page/paragraph artifacts. Failure blocks downstream.

TEXT INTEGRITY: typed/source → DOCX must have missing, added, duplicated, changed and reordered tokens all equal to zero. Failure blocks canonical/CAT processing.

DOWNSTREAM: only an immutable artifact with all gates PASS may produce canonical nodes or Studio skeletons. Worker/network failures are failed/retryable; structural uncertainty is review-required; no silent fallback to the legacy converter is permitted once the new path is selected.
