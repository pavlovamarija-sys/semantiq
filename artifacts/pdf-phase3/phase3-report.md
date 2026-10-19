# Phase 3 blind generalization validation

## Result: FAIL

The frozen candidate was CELEX `32006L0126`, *Directive 2006/126/EC ... on driving licences (Recast)*. The official English PDF has 43 pages and SHA-256 `0E6E7DF9EF641AFEBECF692CE9E1AF7C8CA2F2AD2E4C82950AD6ECF81A3D55EE`. It is structurally useful because it contains recitals, 19 Articles, multiple Annexes, numbered provisions, lists, citations, cross-references, multi-page annex layouts and table-like regions.

## Exact failure

The unchanged Phase 2B builder aborted with `StopIteration` at `workers/pdf-to-docx/spikes/typed_model_phase1.py:322`. For every document it assumes physical page 6 contains an exact fragment `PART A`, immediately followed by a required `PART B` lookup. Those anchors belong to the 32006L0114 Annex I layout; neither exists on page 6 of `32006L0126`.

This is a pre-existing document-specific assumption in the spike, not a failure inferred from the new act's subject matter. No rule was added, changed or tuned, and the failure was not repaired.

## Extraction-level evidence

- Pages: 43
- Text blocks: 1200
- Lines: 2555
- Spans: 27433
- Non-empty extracted fragments: 1651
- All extraction fragments assigned once by the existing ordering primitive: yes
- Raw exact Article heading candidates: 37
- Raw exact Annex heading candidates: 17
- Raw recital-like fragments: 9
- Raw list-item-like fragments: 197
- Raw OJ-citation fragments: 20
- Raw body cross-reference fragments: 198
- PyMuPDF table candidates: 4

These counts describe extraction evidence only. They are not typed classifications because model construction did not finish.

The extraction-level ordering evidence already shows a second material generalization defect. The unchanged builder applies two-column ordering only before page 6 and globally sorts later pages by `(y, x)`. This places genuine Article headings on page 9 in the order `11, 13, 14, 15, 12, 16`, and page 10 in the order `18, 19, 17`. Paragraph reconstruction, table reconstruction, reference-aware legal validation and end-to-end text-integrity comparison remain not evaluable because the earlier anchor failure prevents a model from being returned.

## Required artifacts and gate

`32006L0126-typed-model.json` is an explicit failure envelope, not a fabricated typed model. `32006L0126-reconstruction-decisions.json` records that no decisions were returned. No experimental DOCX was generated: doing so would require bypassing or changing the failed algorithm, contrary to the blind-test rules. Consequently no DOCX hash exists and no SDLXLIFF should be created.

The existing 32006L0114 Phase 2B tests remain green: 3 passed. Production code, DB/CAT code and production behavior were unchanged.

Phase 3 cannot satisfy the PASS gates because typed-model coverage, text integrity and structural reconstruction never execute. The correct classification is **FAIL**.
