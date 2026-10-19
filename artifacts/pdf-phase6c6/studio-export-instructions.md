# Required manual Studio export

Phase 6C.6 is PARTIAL until this controlled input exists.

1. Use the exact file represented by artifact `b0e8fec5-91c8-4755-87a4-ff8f6dd8d307`:
   `artifacts/pdf-phase6c4/controlled-run-readback/validated-docx.docx`.
2. Verify its SHA-256 is `2dc5da5384974468da3d1711f6194e03187274f225a9ef99dcc3027b3ee5a971` and size is 44,034 bytes.
3. In the same Trados Studio project/settings used for the prior controlled experiments, add/import this DOCX as a new source file with English source language (`en-GB`) and the same target-language/project configuration.
4. Create the SDLXLIFF and export/save it untouched. Do not translate, edit, clean, merge, split, or change segmentation settings.
5. Preserve the generated SDLXLIFF and any Studio skeleton/internal-file companion bytes. Do not reuse `artifacts/pdf-phase2b/32006L0114-experimental-v2.docx.sdlxliff`.
6. Return the fresh SDLXLIFF path and SHA-256. The file must identify the authoritative DOCX, not `32006L0114-experimental-v2.docx`.

After receipt, Phase 6C.6 will parse the untouched file, validate source coverage against snapshot `9773853e-9f81-4796-b358-38a3f53e1d81`, and only then persist an immutable CAT projection.
