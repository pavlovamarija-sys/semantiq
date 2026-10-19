# Extraction completion map

The validated 879-line core was copied without heuristic edits to `app/reconstruction/core.py`. The inactive facade now imports `.core`, not `spikes/typed_model_phase1.py`. It contains extraction, layout/reading order, aligned-list rejection, table inference and joining, cross-page continuity, paragraph decisions, provenance, diagnostics and DOCX serialization.

Typed contracts and reusable validation remain in `contracts.py`, `diagnostics.py` and `validation.py`. The spike remains intact as the frozen reference. Fixture runners and expected counts remain outside production modules.
