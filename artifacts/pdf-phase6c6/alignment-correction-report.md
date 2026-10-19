# Alignment correction report

No alignment correction was applied. The deterministic audit did not find a safe Studio-side fix. Source text must not be rewritten or normalized to hide the canonical encoding defect.

The correct architecture is:

1. retain snapshot `9773853e-9f81-4796-b358-38a3f53e1d81` as immutable historical evidence;
2. fix the canonical extraction/persistence encoding boundary;
3. create a new canonical snapshot from the unchanged authoritative DOCX;
4. rerun context-aware alignment using canonical node identity, Studio context/skeleton identity, order and exact source text;
5. persist CAT projection only after all source, structure, inline-code and language gates pass.

No CAT rows or projection artifact were created. This is fail-closed behavior.

The upstream correction is implemented as extractor `docx-canonical-phase6c5-v2-unicode`, with explicit UTF-8 hashing and U+FFFD rejection. A new canonical snapshot must be authenticated and independently verified before rerunning Studio alignment.
