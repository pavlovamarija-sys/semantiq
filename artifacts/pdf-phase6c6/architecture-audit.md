# Phase 6C.6 audit

The accepted design requires an untouched Studio-generated `STUDIO_SDLXLIFF_SOURCE` bound to the exact immutable `VALIDATED_DOCX`, canonical snapshot, source hashes and Studio skeleton bytes. SDLXLIFF must be parsed, not synthesized; source coverage, ordering, tables, footnotes, split segments and inline codes must fail closed. Existing CELEX, DOCX, canonical, CAT and MK1/MK2 paths remain unchanged.

The corrected canonical snapshot is `9773853e-9f81-4796-b358-38a3f53e1d81`, with 422 nodes, 265 TUs, 3 inline codes and normalized source hash `6aa66d213e3db8004d2436a0010f7866eaf9939a44d5e61593e47d2ac132c9a3`. The exact verified input DOCX is artifact `b0e8fec5-91c8-4755-87a4-ff8f6dd8d307`, SHA-256 `2dc5da5384974468da3d1711f6194e03187274f225a9ef99dcc3027b3ee5a971`, 44,034 bytes.

No production SDLXLIFF projection implementation or persistence was activated because the required exact Studio input is not yet available. This prevents falsely treating the older experimental projection as evidence for the persisted authoritative DOCX.
