# Native Word footnote validation

## Root cause

The prior package used Word-compatible custom marks, but the generated
`styles.xml` did not define the native `FootnoteReference` and `FootnoteText`
styles. Its paragraph indentation was also internally inconsistent:
`left=0` with `hanging=340` placed the first line outside the paragraph margin
instead of placing the marker at the text margin and wrapped text at 0.6 cm.

A Microsoft Word-authored automatic-footnote sample and custom-mark sample were
created and inspected. Word's custom-mark contract is retained because the OJ
markers restart according to the physical source pages while the reconstructed
DOCX is intentionally repaginated. Native automatic numbering would restart on
Word's rendered pages and would therefore change the verified source numbering.

## Corrected OOXML contract

- Main story: `w:footnoteReference w:customMarkFollows="1"` and one visible,
  source-faithful parenthesized anchor mark in the same styled run.
- Footnote story: one unparenthesized literal custom mark; no `w:footnoteRef`
  and no duplicate automatic marker.
- Native `FootnoteReference` character style with superscript formatting.
- Native `FootnoteText` paragraph style with Times New Roman 10 pt.
- Direct paragraph formatting: justified, single-spaced, zero before/after,
  `left=340` twips, `hanging=340` twips, and one tab at 340 twips (0.6 cm).
- Word-standard separator records: separator ID -1 and continuation separator
  ID 0, with corresponding declarations in `word/settings.xml`.
- Seven custom page-local markers and seven anchor-to-body relationships remain
  unchanged.

## Microsoft Word readback

Microsoft Word opened the generated DOCX read-only and reported:

- Footnotes: 7
- Effective style: Footnote Text (`Fußnotentext` in the installed German Word)
- Left indent: 17 pt (0.6 cm)
- First-line indent: -17 pt (0.6 cm hanging)
- Explicit first tab stop: 17 pt (0.6 cm)
- Alignment: justified
- Spacing before/after: 0 pt / 0 pt
- Line spacing: single
- Font: Times New Roman, 10 pt

## Artifact and tests

- DOCX: `32006L0114-word-native-footnotes-experimental-v2.docx`
- SHA-256: `5250d54a2e487a01b0270a5e8a31d8860e3671fbade9d819924154758dd336e5`
- Size: 45,734 bytes
- Focused footnote tests: 13 passed
- Full worker tests: 61 passed (one unrelated dependency deprecation warning)
- TypeScript typecheck: passed

No translation model was called and no immutable artifact was changed.
