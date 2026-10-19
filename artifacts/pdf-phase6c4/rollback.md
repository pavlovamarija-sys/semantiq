# Phase 6C.4 rollback

The feature is inactive and has no call site in CELEX, the active converter, canonical extraction, CAT, SDLXLIFF, or MK1/MK2 flows. Operational rollback is therefore to stop invoking the authenticated `validated-docx-generations` route. Existing immutable artifacts and lineage must not be deleted. The additive schema objects may remain dormant; removing them would require a forward migration, not manual schema edits.
