# Production architecture

Keep five immutable identities distinct:

1. SOURCE ARTIFACT: official PDF bytes, source URL, CELEX, retrieval metadata and SHA-256.
2. TYPED RECONSTRUCTION: pages, regions, spans, structural nodes, decisions and provenance.
3. VALIDATED DOCX: native tables/paragraphs/breaks, serialized from the typed model and independently validated.
4. CANONICAL DOCUMENT MODEL: application `DocumentNode`/`TranslationUnit` projection derived from the validated structure.
5. CAT PROJECTION: untouched Studio skeleton/source identity, later MK1 and reviewed MK2 artifacts.

The target flow is source persistence → extraction → typed model → layout/reading order → tables → paragraph decisions → structural validation → DOCX serialization → DOCX/text integrity → immutable artifact manifest → canonical projection → CAT projection. Translation versions remain downstream and never become part of source reconstruction.

The existing worker endpoint can host the production orchestration initially, but typed reconstruction should be a versioned Python library/service with a declared algorithm version. The Next.js layer should orchestrate and persist manifests, not infer PDF structure.
