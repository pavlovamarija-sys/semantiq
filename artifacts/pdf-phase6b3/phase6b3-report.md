# Phase 6B.3 report

## Classification: PASS

The root cause was conclusive: normal CELEX import never reached the Phase 6B shadow integration. It analyzed and persisted the PDF but did not run PDF→DOCX conversion; the only shadow call was attached to the separate working-document transformation action. Consequently the Next.js flag check, worker endpoint, and evidence writer were all unreachable during the controlled 32014L0035 import.

The minimal repair wires the existing non-authoritative shadow helper after successful authoritative PDF/version persistence in both primary and corrigendum CELEX import branches. It records document/version/CELEX correlation. The active PDF remains authoritative, active failures terminate before shadow, and shadow configuration/transport/worker/evidence-write failures cannot change active success or output.

The flag is owned exclusively by the **Next.js server process** and is evaluated on every shadow invocation. Only exact, case-sensitive `PDF_TO_DOCX_SHADOW_RECONSTRUCTION=true` enables it. Setting it on the Python worker has no effect. The worker requires its existing service token but does not read the shadow feature flag.

With Next.js started from `D:\EU Acquis AI App` and no override, the next real import should write evidence to `D:\EU Acquis AI App\artifacts\shadow-runs\<shadow-run-id>.json`. The worker endpoint is healthy (`GET /health` returned 200); no controlled document was submitted in this phase.

Verification passed: 5/5 CELEX shadow orchestration tests, 38/38 worker tests, all three frozen reconstruction regressions, and TypeScript typecheck. The optional lint command could not start because this repository has no ESLint 9 flat configuration; this is a pre-existing tooling configuration issue, not a code failure. No real import, reconstruction tuning, database/schema operation, CAT/translation change, or Phase 6C work was performed.
