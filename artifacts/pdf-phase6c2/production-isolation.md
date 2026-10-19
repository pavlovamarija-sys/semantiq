# Production isolation

- Existing `documents`, `document_versions`, and `source-documents` remain authoritative.
- SOURCE_PDF is an additive registry; existing download routes are unchanged.
- No source object was uploaded, overwritten, moved, renamed, or deleted by backfill.
- Remote counts: one `SOURCE_PDF`; zero non-source artifacts.
- No `RECONSTRUCTION_MODEL`, `VALIDATED_DOCX`, canonical snapshot, or SDLXLIFF exists in the new registry.
- Reconstruction, converter, canonical, CAT, translation, and legacy-TM code are unchanged.
- Shadow remains exact-opt-in and OFF under the current normal configuration.
# Final completion

Historical registration is complete with no source-object mutation and no adoption of reconstructed, DOCX, CAT, SDLXLIFF, canonical, or translation artifacts. Future CELEX registration remains covered by orchestration tests.

