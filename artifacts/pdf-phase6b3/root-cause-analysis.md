# Root-cause analysis

## Proven root cause

Classification: **1. shadow invocation not wired into real CELEX path**, producing **4. endpoint not called** and **7. evidence writer not reached**.

`importCelexDocuments` imported only `analyzePdf`. Its successful path downloaded and analyzed the official PDF, uploaded that PDF, wrote the document version, and returned success. It never imported or called `runShadowReconstruction`, so it never evaluated `PDF_TO_DOCX_SHADOW_RECONSTRUCTION`, never called `/shadow/reconstruct`, and never reached the Next.js evidence writer.

The sole integration point was in `transformPdfToWorkingDocument`, after active PDF→DOCX conversion and DOCX validation. That function is activated by the separate Create/Regenerate Working Document UI, not by normal CELEX import. Restarting both processes with the flag enabled therefore could not affect the controlled import.

This was not a worker flag, authentication, endpoint, permission, or alternate-path problem. The worker is healthy and the endpoint is registered. The missing directory is the expected consequence of zero helper invocations because directory creation occurs inside the evidence writer.

An additional isolation weakness was found while repairing the wiring: service URL/token configuration was evaluated before the helper's catch block. It could therefore throw into an active caller. The same narrow repair moves configuration/request setup inside the isolated block so configuration, transport, worker, and evidence-write failures remain observational.
