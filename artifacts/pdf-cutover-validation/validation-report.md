# Typed reconstruction blocker-fix validation

## Scope

The active `POST /convert/pdf-to-docx` endpoint and Workspace Generate DOCX action were not changed. No database row, Storage object, immutable artifact, or translation was created or modified.

## Implemented generalized corrections

- Recital counts are derived from the consecutive source anchor sequence inside an explicit `Whereas` / enacting-formula boundary.
- Inline and standalone recital anchors are supported; duplicate, missing, incomplete, or ambiguous anchors fail closed.
- PDF column interleaving is corrected by explicit legal-number order while retaining every source reference.
- OJ page furniture exclusions retain page, block, line, span, bounding-box, original-text, classification, and reason provenance.
- Legal-model spans plus explicitly excluded furniture spans must equal all extracted spans exactly once and remain disjoint.
- Dense four-to-six-column legal tables use column-count-relative anchor separation.
- Adjacent same-page table regions can join without requiring an intervening fragment.
- Cross-page table grids compare normalized column geometry so margin shifts do not break logical continuity.
- Footnote references are resolved by their proven character offset, allowing a recital number and footnote marker to share the same literal marker safely.

## Frozen regressions

`32006L0114`, `32006L0126`, and `32006L0042` pass their table, source-span coverage, DOCX text-integrity, footnote, and boundary-count gates. Page-furniture-aware legal token totals are now frozen explicitly in the Phase 6A runner.

## 32006L0054

- Official source SHA-256: `5ed2f4d6a8629cceafd16603f421d00c3e14646a9252776f8e2a1f637d9358ae`
- Source: 14 PDF pages, 12,729 spans
- Explicitly excluded OJ furniture: 224 spans in 56 provenance records
- Legal-model spans: 12,505
- Legal tokens: 8,449
- Recitals: 41, ordered 1–41
- Articles: 36, ordered 1–36
- Annexes: I–II
- Footnotes: 7 native Word footnotes
- Tables: two 2-column Annex I segments and one logical 5-column Annex II correlation table represented by page-preserving native segments across source pages 13–14
- Source/model coverage: PASS
- Typed model/DOCX text integrity: PASS
- Structural heading order: PASS

LibreOffice renders the reflowable DOCX as 26 pages versus 14 source OJ pages. This pagination difference is expected from editable 12-point Word formatting. The Annex II table remains a native five-column grid with correct visible row/column associations. Exact OJ typography, column widths, row heights, and pagination are not reproduced pixel-for-pixel.

## 32025D2586 blocker

The exact registered source is known:

- Project: `0673856a-5aed-4d37-b6c5-923f4462bf00`
- Document: `eab5796c-1266-4905-9f8b-791e8d594080`
- Version: `ed1c8e38-b5b1-4e90-ade9-e6284018de2b`
- SOURCE_PDF artifact: `9633ffa6-a214-4858-94af-319758ce5a5a`
- SHA-256: `a189c5b49a8fef33e3bc873d3d03491213ee05187a3eb1813110a677e5d4f69d`
- Size: 890,782 bytes

The existing authenticated application route is:

`GET /api/projects/0673856a-5aed-4d37-b6c5-923f4462bf00/documents/eab5796c-1266-4905-9f8b-791e8d594080/storage/source`

The shell has no authenticated browser cookie and receives HTTP 401. Direct EUR-Lex retrieval is blocked by an AWS WAF challenge. No substitute bytes were used. Therefore 32025D2586 reconstruction, native Annex-table verification, and page-by-page visual validation remain blocked pending authenticated readback of those exact bytes.

## Automated validation

- Worker suite: 66 passed
- Phase 6A frozen regression runner: PASS for all three existing fixtures
- TypeScript: PASS

## Cutover status

Not authorized by validation yet. The active endpoint remains unchanged until exact 32025D2586 source bytes pass reconstruction, integrity, native-table, and visual gates.
