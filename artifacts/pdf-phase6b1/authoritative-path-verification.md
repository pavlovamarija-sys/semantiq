# Authoritative-path verification

The controlled record is explicitly `non_authoritative: true` and has an independent shadow run ID and shadow DOCX hash. At normal CELEX import time, `importCelexDocuments` uploads the authoritative official PDF and writes its document version before invoking `runShadowReconstruction` with the same PDF byte array.

`active_docx_sha256: null` is expected. Normal CELEX import does not create an authoritative DOCX. PDF→DOCX creation is a later, separate user-triggered `transformPdfToWorkingDocument` action. The shadow endpoint returns summary data and a hash only; its temporary DOCX is deleted by the worker and cannot be uploaded as a working document.

The code and Phase 6B.3 tests prove that shadow failure and evidence-write failure do not change active success, flag OFF prevents invocation, and active failure occurs before the post-persistence shadow hook and cannot be rescued by shadow.

The remaining closure limitation is independent persisted-object hashing: RLS denied anonymous access to the correlated stored PDF/version, so this audit could not download the authoritative object itself. The independently re-downloaded frozen official PDF hashes exactly to the shadow source hash, and the implementation passes the same uploaded bytes to shadow, but that is not substituted for the requested persisted-object read-back proof.
