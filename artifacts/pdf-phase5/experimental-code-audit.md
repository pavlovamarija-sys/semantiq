# Experimental code audit

Production-worthy generalized logic is the typed provenance model, deterministic layout/reading-order reconstruction, whitespace-aligned table inference, physical-to-logical table continuity, deterministic MERGE/KEEP_BOUNDARY/ABSTAIN classifier, native DOCX renderer and integrity validators exercised by Phases 1–4A.

Diagnostic-only code includes phase reports, forensic mapping, hash manifests, boundary projection analysis and verbose decision payloads. Fixture infrastructure includes hard-coded fixture paths, expected counts, regression reports and Studio comparison scripts. These must remain test fixtures, not runtime behavior.

Phase-specific finalizers and validation scripts under `workers/pdf-to-docx/spikes/` should not be imported by production. They contain fixture paths, expected hashes/counts and report-generation concerns. The production extraction API in `workers/pdf-to-docx/app` must remain separate until generalized logic is extracted into tested library modules.

Audit result: validated reconstruction decisions contain no CELEX branch, page-number rule, known text, fixture ID, reference-label input, Phase 3E human label or AI call. The only fixture-specific code is orchestration/assertion around the algorithm. The production candidate must be parameterized by extracted evidence and must emit typed diagnostics without fixture expectations.
