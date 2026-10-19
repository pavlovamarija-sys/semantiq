# Phase 6A.1 report

## Classification: PARTIAL

The validated generalized inference core and DOCX serializer are now physically present in `workers/pdf-to-docx/app/reconstruction/core.py`. The inactive facade has zero runtime dependency on `workers/pdf-to-docx/spikes/`; the architectural test passes. The spike remains intact as the frozen comparison reference.

Independent spike-vs-production comparisons for 32006L0114, 32006L0126 and 32006L0042 pass: typed structure, provenance, decisions, normalized text and DOCX structure are equivalent. Regression invariants and source integrity pass for all fixtures. The focused contract tests, architectural test, full worker suite (35 passed) and TypeScript typecheck pass.

No active endpoint, CELEX import path, user-visible output, database, Supabase, CAT or translation behavior changed. No shadow execution or production activation occurred.

The result remains PARTIAL because `core.py` still carries the frozen spike's internal `Node`/`SourceRef` dataclasses rather than fully converting every core function to the Phase 6A production contract classes. The runtime spike dependency is eliminated and behavior is equivalent, but contract integration is the remaining extraction task before PASS.
