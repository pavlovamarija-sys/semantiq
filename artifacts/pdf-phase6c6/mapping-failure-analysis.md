# Phase 6C.6 mapping result

The fresh file is `studio-input/validated-docx.sdlxliff`, SHA-256 `a8ec9e5642496413402259e8913ccfe975ea354b08c4ff8221cb20c7f80f3995`. Its embedded DOCX is a single archive entry and hashes exactly to the authoritative VALIDATED_DOCX (`2dc5da...a971`, 44,034 bytes). This proves byte identity; the filename/path alone was not used.

The new file `validated-docx-corrected.sdlxliff` declares `source-language="en-GB"`, but has no `target-language` attribute. It is therefore directionally improved but still does not fully represent the required `en-GB → mk-MK` metadata contract. Its embedded DOCX matches the authoritative bytes exactly.

The canonical snapshot contains 265 TUs. The new SDLXLIFF contains 271 trans-units and 271 segments. A fresh ordered text audit found 248 direct matches, 17 canonical TUs without a unique direct match, 23 unmatched Studio units and 35 repeated-text candidate sets. The new file still contains replacement-character corruption: curly apostrophes appear as `�` in at least the long recital/paragraph units (for example canonical ordinal 26 versus Studio unit 26 and canonical ordinal 46 versus Studio unit 47). The remaining failures also include structural/footnote/dash/empty units, order shifts and repeated text; actual source omission is not proven. A production mapper must preserve original text and fail closed rather than normalize or repair these differences.

No artifact, projection generation, CAT mapping rows or SDLXLIFF bytes were persisted. The untouched SDLXLIFF and DOCX were not modified. MK1, SDLXLIFF translation, CAT cutover and Phase 6C.7 were not started.
