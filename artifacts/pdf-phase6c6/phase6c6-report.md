# Phase 6C.6 report

Classification: **PASS**.

The exact unchanged Studio input `studio-input/validated-docx-corrected.sdlxliff` was aligned afresh against guarded canonical snapshot `d57fdd35-3b79-4f3a-b20a-3cfaf9941225`. Its SHA-256 remains `588de15278fef72518c567f3c3e9a9ed279efece6b8733776a1375e794abe2a4`, its embedded DOCX matches authoritative SHA-256 `2dc5da5384974468da3d1711f6194e03187274f225a9ef99dcc3027b3ee5a971`, and its declared source language is `en-GB`.

All 265 canonical TUs map to 265 distinct Studio trans-units in strict document order. Missing canonical TUs: 0. Duplicate Studio assignments: 0. Reordered mappings: 0. No canonical source content is omitted or duplicated.

Studio contains six additional trans-units at indexes 38, 72, 105, 135, 156 and 182. Each has empty source text, empty segmented source text, empty target text and no segment marker. Each contains exactly one `<x>` structural placeholder. Studio tag definitions identify placeholder IDs 0–5 as `name="page"`, `seg-hint="Exclude"`, `<br type="page"/>`, backed by `<w:br w:type="page"/>`. They are therefore proven non-translatable page-break units, not missing canonical translation content. Exact IDs and XML evidence are recorded in `guarded-snapshot-alignment.json`.

The subsequently supplied untouched `Project 5.sdlproj` resolves the language gate. Project GUID `c17d60db-00c4-4ecd-bdf1-bf5f996ea39a` explicitly defines `SourceLanguageCode="en-GB"` and `TargetLanguageCode="mk-MK"`. Its project-file lineage records `validated-docx.docx` at 44,034 bytes and source/target language versions of `validated-docx.docx.sdlxliff` at 242,344 bytes and the matching creation timestamp. The project SHA-256 is `8fa12ab031874b440ef3512794b95111e51dc67cfc0d7edd4417ff98f6ba3e6c`.

The additive immutable CAT persistence slice is implemented and migration `20261025000000_cat_projection.sql` is deployed. It adds project-scoped RLS, immutable projection/mapping/structural rows, exact byte upload/readback, canonical and DOCX stale-input checks, complete ordered mapping checks, excluded-page-break checks, idempotency, lineage and atomic fail-closed finalization. TypeScript and focused CAT tests pass.

The authenticated controlled invocation and identical retry did execute. PostgreSQL contains exactly one completed/PASS CAT generation (`46ddb621-c7c0-4176-86a7-41b9689b2db5`), one available projection (`768370ee-4c55-4fe4-9f6c-4b44921904b8`) and one available immutable SDLXLIFF artifact (`9b2bc2fa-99ad-464d-b905-1dacf790de7a`). No failed, active, rolled-back or duplicate CAT generation exists for this document version.

Independent readback verifies 265 mappings with ordinals 0–264, 265 distinct canonical identities, 265 distinct Studio identities, zero canonical hash mismatches, zero ordinal mismatches and zero order defects. All six remaining units are persisted as excluded page breaks with zero structural mismatches. Recomputed source-units SHA-256 equals persisted `8e655df2087a169baef3377a041ea2762f04241a5db7e692657565d4a34515f0`.

The immutable storage row exists at the artifact path with content length 242,344 and MIME `application/x-sdlxliff`; artifact SHA-256 is the exact original `588de15278fef72518c567f3c3e9a9ed279efece6b8733776a1375e794abe2a4`. The API performed storage byte readback and hash/size verification before atomic completion. Lineage is `VALIDATED_DOCX b0e8fec5-91c8-4755-87a4-ff8f6dd8d307 projected_from → STUDIO_SDLXLIFF_SOURCE 9b2bc2fa-99ad-464d-b905-1dacf790de7a`, with the projection directly bound to canonical snapshot `d57fdd35-3b79-4f3a-b20a-3cfaf9941225`.

The API cannot return HTTP 201 before readback and successful completion RPC, and cannot return the HTTP 200 retry unless the generation is already completed and its projection exists. Durable Next.js request logs were unavailable, but database and storage timestamps prove the requests reached the server and committed successfully.

**Phase 6C.6 is formally closed: PASS.** No MK1, Phase 6C.7, automatic execution or production cutover was started.

No DOCX or SDLXLIFF was modified. No MK1, Phase 6C.7, automatic execution or production cutover was started.
