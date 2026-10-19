# Phase 6A report

## Classification: PARTIAL

The safe first extraction slice is complete: explicit production contracts, diagnostic validation, source-span exact-once validation, token-integrity reporting and focused tests were added under the inactive `app.reconstruction` package. The active converter and all application/database/CAT/translation behavior remain unchanged.

All three fixture regressions pass through the inactive facade, preserving the validated invariants:

- 32006L0114: 3 tables, 48 rows, 100 cells, source coverage and DOCX integrity PASS.
- 32006L0126: 5 physical/3 logical tables, 128 rows, 264 cells, 27,433 spans, 18,825 tokens, 28/4/46 decisions, integrity PASS.
- 32006L0042: 8 physical/1 logical table, 278 rows, 556 cells, 48,170 spans, 30,922 tokens, 95/11/54 decisions, integrity PASS.

The result is PARTIAL because the generalized inference core and serializer have not yet been physically extracted from `spikes/typed_model_phase1.py`; the facade delegates to that spike for comparison. No material discrepancy was introduced, but the Phase 6A PASS criterion requiring production-quality extraction of all reconstruction components is not yet satisfied.

The next safe slice is to move the inference and serializer functions module-by-module with byte/invariant comparison after each move. Do not activate the package until that extraction is complete.
