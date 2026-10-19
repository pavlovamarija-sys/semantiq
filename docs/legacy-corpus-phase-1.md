# Legacy corpus Phase 1: EN↔MK alignment

This phase builds approved bilingual translation units from immutable, matched
legacy documents. It does not create embeddings, RAG context, MK1 output, or a
fine-tuned model.

## Pipeline stages

1. Register the original EN and approved MK `documents` and exact
   `document_versions` as `legacy_corpus_documents`. Registration retains CELEX,
   language, corpus role, and source provenance without modifying either file.
2. Use the existing document extraction boundary to obtain exact source text and
   extraction diagnostics. The aligner consumes that immutable extraction; file
   decoding is not duplicated inside alignment logic.
3. Segment each extraction using legal structure: title, preamble, recitals,
   chapters, articles, numbered paragraphs, lettered points, annexes, and OJ or
   Official Journal footnotes. Every segment stores exact sliced text and source
   offsets.
4. Align exact legal-structure keys first. Exact 1:1 matches score `0.98`; 1:N
   and N:1 split/merge matches sharing the same legal key score `0.94`.
5. Apply conservative sequence evidence only where it is unambiguous. The V1
   title candidate scores `0.80` and is always `needs_review`.
6. Leave conflicting, unsupported, and N:M candidates unaligned. No nearest
   segment is forced into a unit.
7. Persist alignment membership through the source/target segment join table,
   preserving provenance to both exact original document versions.
8. A reviewer may validate or reject proposals. Database gates allow reusable
   knowledge only for validated units at confidence `>= 0.90`; final approval
   also requires reviewer and timestamp audit fields.

## First real run prerequisites

- Both trusted EN and approved MK files must be present in the curated corpus.
- Their immutable document/version records and corpus provenance must be known.
- CELEX or another authoritative pair match must be validated.
- Extraction quality and structure coverage must be reviewed on both sides.
- A persistence use case should insert one draft atomically and expose unaligned
  segments and `needs_review` units to a reviewer.
- The review UI and explicit approval operation must be implemented before any
  unit is promoted to reusable knowledge.

Only the English 31990L0426 fixture exists in this repository. It is therefore
not used as a bilingual alignment fixture; no Macedonian text is inferred or
downloaded as a substitute for the curated approved translation.
