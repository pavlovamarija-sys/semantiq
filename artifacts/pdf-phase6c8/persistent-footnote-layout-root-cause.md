# Persistent footnote layout root cause

## Minimal reproduction

Microsoft Word created a new document containing one paragraph and one genuine,
editable custom-mark footnote. The footnote was formatted through Word's object
model as Times New Roman 10 pt, black, justified, single-spaced, zero paragraph
spacing, with a 0.6 cm hanging indent and a 0.6 cm tab stop.

Artifact:
`MINIMAL-CORRECT-word-footnote-number-tab-text-v2.docx`

- SHA-256: `22d2f9816841a975a2d337e949fab823b758da2ba622a73dbc462d7f65ea898b`
- Size: 15,748 bytes
- Word footnote count: 1
- Word footnote-story prefix character codes: `49, 9, 84, 104, 105, 115`
  (`1`, TAB, `This`)

## Proven difference from the current serializer

Word's corrected footnote XML uses two runs:

1. A `Footnote Reference` run containing only the visible custom number.
2. A normal footnote-text run beginning with `w:tab`, followed by the text.

The current serializer uses one marker run containing both the visible number
and `w:tab`. Because that run has the `FootnoteReference` character style and
explicit superscript formatting, the tab inherits marker formatting. Paragraph
indent and tab-stop changes therefore pass structural tests while leaving the
effective Word layout visually unchanged or inconsistent.

The Word object model also revealed a hidden default separator space after a
custom mark. A naive `InsertBefore(tab)` produces `number + space + tab + text`.
The visually correct native story replaces that separator space and produces
exactly `number + tab + text`.

## Other findings

- `customMarkFollows` is required on the main-story `w:footnoteReference` for
  explicit page-local custom marks. It is not the cause of the body alignment
  defect.
- Native automatic numbering cannot preserve the verified OJ page-local
  sequence after Word repaginates the reconstructed document. Custom marks are
  therefore still required.
- Word recognizes the current seven-note artifact as seven genuine footnotes;
  the defect is run composition and rendering, not relationship integrity.
- The current English style IDs are recognized by Word through their native
  style names; style localization is not the cause.
- Direct paragraph formatting matches the intended 0.6 cm geometry. The
  remaining direct-format issue is that the tab is inside the superscript run.

## Cache and artifact identity

The minimal reproduction has a unique filename and SHA-256. It cannot be
confused with the prior full-document artifacts. The current full experimental
artifact remains:

- `32006L0114-word-native-footnotes-experimental-v2.docx`
- SHA-256: `5250d54a2e487a01b0270a5e8a31d8860e3671fbade9d819924154758dd336e5`

No serializer change was made during this diagnostic phase. The next serializer
change should reproduce the proven two-run Word structure only after the minimal
artifact's appearance is accepted in Microsoft Word.
