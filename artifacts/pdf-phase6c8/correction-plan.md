# Phase 6C.8 correction plan

## Gate 1 — model contracts

Version the reconstruction/canonical contracts. Add `Recital`, `Footnote`, `FootnoteReference`, `PageFurniture`, richer `Section/PageLayout`, and table-layout evidence. Every relationship must retain page/block/line/span provenance. Reject unmatched or multiply matched footnote anchors and uncertain recital associations.

## Gate 2 — deterministic reconstruction

Classify repeated margin clusters across pages; pair recital markers with bodies using numbering, geometry and column flow; split grouped footnote blocks into individual notes and bind each call mark. Preserve ambiguity rather than guessing. Re-run source-span and ordered-token integrity unchanged.

## Gate 3 — fidelity DOCX serializer

Generate real OOXML footnote parts/references, recital paragraph numbering/hanging indents, explicit page-furniture policy, and evidence-based table/page formatting. Keep legal text byte-faithful apart from controlled whitespace. Add rendered-page comparison against the PDF with tolerances for reflow and exact checks for anchors, tables, headings and furniture.

## Gate 4 — canonical and CAT

Extract body, tables, headers/footers and footnotes from their native OOXML parts. Preserve stable linked identities. Footnotes must be complete logical TUs; recital numbering must remain structurally attached. Studio mapping must prove every translatable unit and distinguish excluded page furniture.

## Gate 5 — MK1 terminology

Build a per-document terminology plan from approved TM/terminology and authoritative evidence before any model call. Pass fixed equivalents to every batch; persist evidence and chosen forms. Run exact source-term/target-term concordance, capitalization and citation-style validation over the completed document. Fail closed on conflicting approved terms.

## Gate 6 — controlled regeneration

Create new immutable generations only. Do not mutate the Phase 6C.3–6C.7 lineage. Validate PDF → model → DOCX → canonical → Studio → MK1 with actual-byte readback. Manual professional Word/PDF and Trados review remains required before MK2.
