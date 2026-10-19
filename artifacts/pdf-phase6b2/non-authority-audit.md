# Non-authority audit

The evidence directory is written only by `runShadowReconstruction`. No active conversion, DOCX persistence, extraction, canonical segment, CAT or translation code reads `artifacts/shadow-runs`. The helper returns no shadow DOCX bytes and catches evidence-write failures. The active converter result and readiness state are computed before and independently of evidence writing.
