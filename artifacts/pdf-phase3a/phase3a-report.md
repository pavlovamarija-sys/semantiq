# Phase 3A generalized layout reconstruction

## Result: PARTIAL

The spike no longer contains fixed physical-page controls, exact PART-label triggers, fixed table coordinates/counts or CELEX-specific reconstruction branches. Both frozen PDFs complete without crashing. The previous 32006L0126 two-column defects are eliminated structurally: page 9 yields Articles 12–16 and page 10 yields Articles 17–19; the complete genuine sequence is 1–19. Annexes I–VIII are also ordered correctly.

## Integrity and regression

| Gate | 32006L0114 | 32006L0126 |
|---|---:|---:|
| Pages | 7 | 43 |
| Source spans represented once | 3362 | 27433 |
| Ordered normalized tokens | 3389 | 18825 |
| PDF → model integrity | PASS | PASS |
| Model → DOCX integrity | PASS | PASS |
| Genuine Article sequence | 1–12 PASS | 1–19 PASS |
| Genuine Annex sequence | I–II PASS | I–VIII PASS |

32006L0114 retains 3 tables, 48 rows and 100 cells. Its three multi-line Annex I cells remain logical cells, and table-contained Article/Annex references remain excluded from structural heading validation. The unchanged Phase 2B test file passes 3/3 tests.

## 32006L0126 generalized result

- Extraction: 1200 blocks, 2555 lines, 27433 spans across 43 pages.
- Page layouts: {'two-column': 11, 'single-column': 32}.
- Explicit layout ambiguities: 1.
- Top-level node counts: {'Paragraph': 926, 'Heading': 85, 'Footnote': 6, 'PageBreak': 42, 'ListItem': 153, 'Table': 7}.
- Geometry table regions: 7.
- Suspicious retained continuation boundaries: 33.
- Experimental DOCX SHA-256: `29BE7B931470891C9C3DD0F7D2CF8734FCB8118FB7C302696ACA822EFB2DC2B6`.
- Source PDF SHA-256: `0E6E7DF9EF641AFEBECF692CE9E1AF7C8CA2F2AD2E4C82950AD6ECF81A3D55EE`.

## New defects retained without repair

The first generalized run found defects independent of the frozen Phase 3 failures:

1. Page 4 has a false-positive 4×2 table: aligned list material in independent body columns resembles a grid.
2. Page 40's second table is inferred as 7×3; its final multi-fragment row remains outside the table.
3. Page 41's continuing correlation table is split into 9×2 and 22×2 regions, with sparse intervening rows outside the table.
4. Table continuity across physical pages 41–43 is not represented as one logical table.
5. 33 suspicious paragraph continuations remain explicit for later review; cross-page paragraph merging is not implemented.

These defects mean table identity/boundaries and all paragraph-boundary quality gates do not pass, despite complete text coverage and correct legal-heading order. Per the Phase 3A instruction, they were documented and not repaired. The result is therefore **PARTIAL**, not PASS.

No Studio file was generated. No production, DB or CAT code was changed, and no document-specific workaround was introduced.
