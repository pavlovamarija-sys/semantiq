# Artifact taxonomy

| Type | Role and producer | Consumer | Bytes / MIME | Persistence and required identity |
|---|---|---|---|---|
| `SOURCE_PDF` | Authoritative retrieved/uploaded source; CELEX import/user | reconstruction, audit | PDF | immutable bytes; SHA-256, size, MIME, retrieval provenance, document version |
| `RECONSTRUCTION_MODEL` | Auditable typed structural model; reconstruction generation | DOCX renderer, canonical extractor, diagnostics | JSON (`application/json`) | immutable JSON artifact; SHA-256; source artifact and generation |
| `VALIDATED_DOCX` | Authoritative editable reconstruction output | canonical extraction, Studio | DOCX | immutable; SHA-256; model/source parents; validation gate |
| `CANONICAL_SNAPSHOT` | Reproducible `DocumentNode`/TU/InlineCode snapshot manifest | translation, CAT mapping, stale checks | DB rows plus small JSON manifest | snapshot DB identity is authoritative; optional manifest artifact hash aids export/audit |
| `STUDIO_SDLXLIFF_SOURCE` | Untouched CAT skeleton created by Studio | MK1 injection, review, reconciliation | SDLXLIFF/XML | immutable; byte hash plus normalized skeleton/source hash; DOCX/canonical parents |
| `STUDIO_SDLXLIFF_MK1` | Skeleton with selected MK1 versions injected | translator/Studio | SDLXLIFF/XML | immutable; parent untouched SDLXLIFF; exact translation-version mappings |
| `STUDIO_SDLXLIFF_REVIEWED` | Human-reviewed Studio output | reconciliation/MK2 | SDLXLIFF/XML | immutable upload; parent skeleton/MK1 identity; uploader and validation |
| `TARGET_DOCX` | Optional reviewed/final rendered target | delivery/audit | DOCX | immutable when retained; reviewed CAT/canonical/translation parents |
| `QA_REPORT` | Machine-readable QA and optional human report | gate/reviewer/audit | JSON preferred; DOCX/PDF presentation optional | immutable per generation; typed summary columns plus JSON findings artifact |
| `RECONCILIATION_REPORT` | Reviewed CAT→MK2 mapping outcome | reviewer/approval | JSON | immutable; reviewed CAT and canonical snapshot parents |
| `EXPORT_PACKAGE` | Delivery bundle/manifest | coordinator/recipient | ZIP | immutable; relationships to every included artifact and manifest hash |

Not every state needs a new byte object. Processing status belongs in `processing_generations`; canonical nodes/TUs/codes belong in normalized DB tables tied to an immutable snapshot; approval/trust belongs in translation/approval records. Artifacts represent bytes or immutable serialized manifests, not mutable workflow state.
