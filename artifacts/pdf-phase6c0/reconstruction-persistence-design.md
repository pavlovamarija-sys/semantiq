# Reconstruction persistence design

Each reconstruction attempt is a `processing_generations` row of kind `pdf_reconstruction`, bound to the exact `SOURCE_PDF` artifact and deterministic `algorithm_version`, `config_sha256`, and `config` JSON. It records status/timestamps/error and summary gates.

On success it produces:

- `RECONSTRUCTION_MODEL`: complete typed/provenance model as immutable JSON in Storage.
- `VALIDATED_DOCX`: immutable DOCX bytes.
- optionally `QA_REPORT`: detailed machine-readable validation/diagnostics JSON.

The typed model should be a JSON artifact in Storage plus compact indexed DB metadata—not fully normalized in 6C. A model can be large, deeply nested, and versioned with the algorithm; normalizing every span/box prematurely creates write amplification and schema lock-in. Canonical downstream structures are normalized separately. Store summary columns on the generation: pages/blocks/lines/spans/tokens/tables/rows/cells, MERGE/KEEP/ABSTAIN, coverage status, ordered-token status and validation status. Detailed provenance, decisions and ambiguities remain in the model/QA artifacts.

Success requires source exact-once coverage, provenance integrity, structural/decision validation, DOCX reopen/OOXML validation and normalized ordered-token equality. A failed gate makes the generation `failed_validation`; no DOCX is marked available. Diagnostics persist without promoting output.
