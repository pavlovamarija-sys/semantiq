# Phase 6A extraction map

Implemented inactive production-shaped modules:

- `workers/pdf-to-docx/app/reconstruction/contracts.py`: typed provenance, decisions and diagnostic contracts.
- `workers/pdf-to-docx/app/reconstruction/diagnostics.py`: validated diagnostic construction boundary.
- `workers/pdf-to-docx/app/reconstruction/validation.py`: decision, exact-once provenance and token-integrity gates.
- `workers/pdf-to-docx/app/reconstruction/pipeline.py`: inactive compatibility facade.
- `workers/pdf-to-docx/tests/test_reconstruction_contracts.py`: focused contract/gate tests.

Not yet physically extracted: PDF extraction, layout inference, table inference/continuity, paragraph classifier and DOCX serializer. The facade delegates these to `spikes/typed_model_phase1.py` solely for regression comparison and is not imported by `app.main`.

This differs from the Phase 5 plan by being a smaller safe first slice: moving the 879-line inference core requires a subsequent controlled refactor to avoid changing behavior. No active endpoint, Next.js action, DB schema, CAT or translation path was changed.
