# Phase 6C.6 forensic encoding report

Input: `validated-docx-corrected.sdlxliff`.

- Raw SHA-256: `588de15278fef72518c567f3c3e9a9ed279efece6b8733776a1375e794abe2a4`.
- Raw bytes: 242,344.
- Raw UTF-8 U+FFFD count: 0.
- Parsed XML U+FFFD count: 0.
- UTF-8 replacement byte sequence `EF BF BD`: absent.
- Embedded DOCX SHA-256: `2dc5da5384974468da3d1711f6194e03187274f225a9ef99dcc3027b3ee5a971`.

The prior apparent replacement characters were terminal/display rendering, not file corruption. Direct code-point comparison found the real discrepancy in the canonical snapshot: canonical text contains mojibake such as code points `U+00E2 U+20AC U+2122` (`â€™`), while SDLXLIFF contains the correct Unicode apostrophe `U+2019`. The same occurs for curly opening quotes. The SDLXLIFF itself is not corrupted.

The immutable canonical snapshot is therefore the root cause of the text mismatches. It cannot be repaired in place and must not be silently normalized during CAT alignment.

Language metadata in the SDLXLIFF contains `source-language="en-GB"`; no `target-language` attribute or trustworthy project configuration file is present in the supplied folder. `mk-MK` must not be fabricated.
