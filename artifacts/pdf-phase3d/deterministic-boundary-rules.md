# Deterministic paragraph-boundary rules

The isolated executable classifier has three outcomes: `MERGE`, `KEEP_BOUNDARY`, and `ABSTAIN`.

A candidate is currently defined as two consecutive same-page source nodes, with a Paragraph on the right, no sentence/list terminator on the left, and lexical-continuation evidence at the start of the right fragment. The validated rules then check, in order: top-margin publication-date headers; intervening same-block source lines; same-baseline horizontal adjacency with matching style; and tightly spaced consecutive source lines with matching style. No match returns `ABSTAIN`, retains the boundary, and records it unresolved.

MERGE joins only `rstrip(left) + " " + lstrip(right)` and preserves every source reference and inline span. No CELEX, page, fixture ID, expected count, known fragment, or legal ordinal is used as decision logic. There is no AI dependency.

The frozen Phase 3D run showed that this generalized candidate scope is broader than the 30-case Phase 3C evaluation set: 78 boundaries were classified and 46 abstained. This is a new validation-scope defect. The run stopped without tuning the candidate scope or generating DOCX.
