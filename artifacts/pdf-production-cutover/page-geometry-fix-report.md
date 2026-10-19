# DOCX page-geometry compatibility fix

## Root cause

The application validator encoded the legacy converter's single portrait
profile as a universal rule: every section had to use 1440-twip top/bottom and
1797-twip left/right margins. The typed renderer instead inherited 1800-twip
portrait side margins from python-docx and deliberately used 680-twip margins
for source-driven landscape table sections. Therefore both orientations could
fail: portrait by a three-twip implementation rounding/default mismatch, and
landscape because the validator had no landscape contract at all.

The validator also exposed two adjacent legacy assumptions after geometry was
fixed: headings were inferred from English text rather than OOXML structure,
and footnotes were required to be 9 pt even though the validated native
footnote contract is 10 pt.

## Fix

- The renderer now emits exact, deterministic twip values for portrait and
  landscape sections.
- The validator validates page dimensions, orientation-specific margins, and
  one-column layout.
- Every native table grid is checked against the printable width of the Word
  section that contains it.
- Typed headings carry non-visual `w:outlineLvl` semantics while retaining the
  Normal style and explicit source-derived appearance.
- Running body text, table-cell alignment, paragraph spacing, native footnote
  spacing, 10 pt footnote text, relationships, ZIP integrity, and content
  integrity remain validated.
- Reserved Word separator footnotes are not counted as legal notes.

## Controlled verification

`32025D2586` passed the live typed worker endpoint, the worker OOXML validator,
and `scripts/docx_validator.py`. Its output contains portrait and landscape
sections, one 5-by-5 native Annex table within the landscape printable area,
and one native footnote.

`32006L0054` independently passed both validators with portrait geometry, three
native tables, and seven native footnotes.

All worker, validator, CELEX orchestration, artifact, and TypeScript checks
passed. Exact results and hashes are in `page-geometry-validation.json`.

## Workspace publication status

No authenticated browser session is available to this process. The controlled
output was therefore not uploaded through the Workspace Server Action, and no
existing immutable artifact or database record was modified. A user-authenticated
Generate DOCX retry for `32025D2586` is still required to prove the final
Supabase save, Files-tab refresh, and authenticated download path.
