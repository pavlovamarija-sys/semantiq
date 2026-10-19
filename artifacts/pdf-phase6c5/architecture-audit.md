# Phase 6C.5 architecture audit

The accepted Phase 6C.0 design establishes `canonical_snapshots` as an immutable root bound to one exact `VALIDATED_DOCX` artifact/hash. Phase 6C.5 adds normalized `canonical_nodes`, `canonical_translation_units`, and `canonical_inline_codes` child tables. Existing `document_segments`, CAT, SDLXLIFF, MK1/MK2, and CELEX paths remain unchanged.

The input contract is the exact available artifact `b0e8fec5-91c8-4755-87a4-ff8f6dd8d307`, scoped to project `ac1e24ca-b699-4863-ba99-f310fa220a8a`, document `6b8a3125-eda7-46a2-9066-9b6d619713dc`, version `74a67935-d57f-428f-aa34-d8d603ddda1e`. Bytes are downloaded and verified against the persisted SHA-256 before the worker is called and read back/reverified before finalization.

Canonical extraction uses the frozen DOCX serializer output as its source of truth. Body XML order is preserved; native tables, rows and cells are structural nodes; non-empty logical paragraphs and headings become one TU each; controlled line breaks become protected inline codes. Empty structural cells do not create fake TUs. Unsupported external/embedded content fails closed.

The worker does not create SDLXLIFF or translation output. The authenticated application stage uses a separate `canonical_extraction` processing generation, stable request identity, exact input binding, snapshot finalization RPC, RLS and immutable child rows.
