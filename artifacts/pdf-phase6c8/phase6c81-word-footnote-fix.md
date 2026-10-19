# Phase 6C.8.1 — Word custom-footnote rendering fix

## Root cause

The first experimental serializer did not match the structure written by Microsoft Word for custom footnote marks. It emitted the literal marker in a separate main-text run and emitted both `w:footnoteRef` and a literal marker in the note body. Word therefore displayed its automatic marker alongside the literal marker (`1(1)`, `2(2)`, and so on).

A temporary Word-authored custom-footnote document was created and inspected. Word's actual contract is:

- Main text: one styled run containing `w:footnoteReference w:customMarkFollows="1"`, immediately followed in that same run by the one visible literal custom mark.
- Footnote body: one styled literal custom mark; no `w:footnoteRef` automatic marker.

The experimental serializer now reproduces that contract exactly.

## Numbering and identity

The typed model now records `sourcePage` and `pageLocalNumber` on every reference and stores the explicit numbering scheme:

- Source page 1: `(1)`, `(2)`, `(3)`, `(4)`
- Source page 2: `(1)`, `(2)`
- Source page 3: `(1)`

Replacement occurs only after the serialized paragraph is proven to contain the expected marker at the exact recorded anchor offset. Missing, moved, duplicate, cross-page, and ambiguous anchors fail closed.

All seven anchor-to-body relationships are unchanged.

## Validation

- Microsoft Word recognizes 7 native footnotes.
- Word's footnote story contains exactly 7 visible custom markers.
- OOXML contains 7 `w:footnoteReference` elements, all with `customMarkFollows="1"`.
- Footnote bodies contain zero automatic `w:footnoteRef` elements and one literal marker each.
- Text integrity: PASS, 3,389 normalized tokens.
- Page breaks remain 6.
- Canonical extraction remains 426 nodes, 269 TUs and 10 inline codes.
- Focused plus endpoint regressions: 29/29 PASS.
- TypeScript typecheck: PASS.

## New Word-inspection artifact

`artifacts/pdf-phase6c8/32006L0114-footnote-experimental-v2.docx`

- SHA-256: `b17e810f6e386821d7ab32869274f08349c268192a645bc0378a3e50a364371d`
- Size: 44,605 bytes

## Remaining layout limitations

Word repaginates the generic experimental reconstruction to 15 pages, whereas the source PDF has 7 physical pages. Native footnotes are attached to their proven anchors and Word places each note at the bottom of the rendered page containing that anchor. Reproducing the source's exact pagination is broader layout work and was not changed in this footnote-only phase.

The new DOCX should now be inspected interactively in Microsoft Word. Trados projection has intentionally not been started.
