# Phase 3B.1 diagnostic-schema analysis

## Contract failure

Phase 3B had two untyped dictionary producers for layout ambiguities. The gutter-straddler producer supplied `reason`; the aligned-list rejection supplied only `evidence`. The page-layout consumer indexed `reason` directly while converting either variant into a reconstruction decision, causing the delayed `KeyError`.

Other reconstruction decisions were `Decision` dataclass instances and therefore already required `reason` and `confidence`, but they did not distinguish outcome, observational evidence or ambiguity status. JSON serialization consumed them through `dataclasses.asdict`; layout analysis consumed raw ambiguity dictionaries.

## Unified schema

`DiagnosticRecord` is now the sole reconstruction diagnostic representation (`Decision` remains a compatibility alias). Required fields are: `kind`, `node_id`, `source`, `reason`, `confidence`, `outcome`, `evidence`, and `ambiguity_status`.

- `reason` is one required causal explanation for the recorded outcome.
- `evidence` is a validated list of non-empty observed facts supporting that reason.
- `outcome` records what was classified, rejected, linked or left ambiguous.
- `ambiguity_status` is explicitly `not-ambiguous`, `resolved`, or `unresolved`.
- `source` carries provenance independently of explanatory fields.

Construction validates identifiers, required reason, evidence shape and confidence range. Mapping consumers validate all required fields before logging. Missing fields therefore fail at the diagnostic boundary rather than later inside document reconstruction.

## Behavioral scope

The repair changes diagnostic construction, validation and serialization only. No geometry threshold, table criterion, joining rule, reading-order rule, paragraph rule or renderer behavior changed. The 32006L0114 structural fingerprint remains 3 tables / 48 rows / 100 cells with valid Article and Annex sequences.
