# Phase 6C.7 recovery artifact readback

The recovery database state is verified. To complete independent actual-byte validation, download both artifacts while logged in at `http://localhost:3000`.

1. SDLXLIFF:
   `http://localhost:3000/api/projects/ac1e24ca-b699-4863-ba99-f310fa220a8a/artifacts/45d9ddca-a58b-46c7-9cf9-549560aa9037`
2. Macedonian DOCX:
   `http://localhost:3000/api/projects/ac1e24ca-b699-4863-ba99-f310fa220a8a/artifacts/d67fe184-9227-40e1-81ef-082f6249608a`

Save them without modification as:

- `artifacts/pdf-phase6c7/recovery-readback/32006L0114-mk1-recovered.sdlxliff`
- `artifacts/pdf-phase6c7/recovery-readback/32006L0114-mk1-recovered.docx`

Expected identities:

- SDLXLIFF SHA-256: `2c00162dd6545a51f23fcbf1fe2df8c60a11ac0d4c95abd67614703517ad5639`; size: `282648` bytes.
- DOCX SHA-256: `0cfaa6d001f2f11a102298badc596880a5dbc6a27a75b4addf534535b6972ede`; size: `887584` bytes.

Do not edit, open-and-save, rename through Studio, or regenerate either artifact before verification.
