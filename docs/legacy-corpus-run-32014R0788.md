# Legacy corpus alignment run: 32014R0788

Run date: 2026-10-04. Source pair selected from `_metadata/sure_set.csv`; the MK2 SHA-256 was checked against the trusted metadata. Originals were read only and were not modified.

## Result

| Measure | Actual result |
|---|---:|
| CELEX | 32014R0788 |
| EN segments | 213 |
| MK segments | 276 |
| aligned 1:1 | 27 |
| aligned 1:N | 1 |
| aligned N:1 | 0 |
| needs review | 1 |
| unaligned EN | 185 |
| unaligned MK | 247 |
| structural coverage | 90.18% |
| EN text coverage | 0.82% |
| MK text coverage | 0.57% |

The text coverage is intentionally low for this first conservative run: the current approved pair has paragraph-level structural differences, and the aligner does not force unsupported sequence or N:M matches. Confidence values are proposal/evidence scores, not calibrated probabilities.

## Five strong alignments

All five are unique normalized article-key proposals with score `0.96`:

1. `Article 1` ↔ `Член 1`
2. `Article 2` ↔ `Член 2`
3. `Article 3` ↔ `Член 3`
4. `Article 4` ↔ `Член 4`
5. `Article 5` ↔ `Член 5`

## Needs review

- `COMMISSION REGULATION (EU) No 788/2014` ↔ `РЕГУЛАТИВА (ЕУ) бр. 788/2014 НА КОМИСИЈАТА`, score `0.80`. This is the unique title-position sequence proposal and remains unapproved.

## Representative unaligned segments

EN: `of 18 July 2014`; `laying down detailed rules for the imposition of fines and periodic penalty payments and the withdrawal...`; `(Text with EEA relevance)`; `THE EUROPEAN COMMISSION,`; `Having regard to the Treaty on the Functioning of the European Union,`.

MK: `од 18 јули 2014 година`; `за утврдување детални правила за изрекување на глоба и периодични парични казни и за повлекување...`; `(Текст со важност за ЕЕО)`; `ЕВРОПСКАТА КОМИСИЈА,`; `имајќи го предвид Договорот за функционирање на Европската унија,`.

## Reproducibility and status

The runnable entry point is `scripts/run-legacy-corpus-alignment.mjs`. It uses the existing legal segmenter and bilingual alignment pipeline, OOXML paragraph extraction for these DOCX originals, and emits the full JSON run artifact `.legacy-32014R0788-run.json` including source/target segments, proposals, file hashes, and provenance. The database migration adds immutable file metadata fields. This run's proposals remain `knowledge_status=excluded`; no reusable knowledge was promoted.
