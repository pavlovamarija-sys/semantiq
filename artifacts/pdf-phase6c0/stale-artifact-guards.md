# Stale-artifact guards

| Transition | Required exact matches |
|---|---|
| source→reconstruction | requested source artifact is available; downloaded bytes match artifact SHA-256 |
| model→DOCX | generation/source IDs and hashes match; model validation gate PASS |
| DOCX→canonical | available DOCX artifact ID and actual SHA-256 equal snapshot binding |
| canonical→untouched SDLXLIFF | snapshot available; DOCX artifact/hash unchanged; source language and TU source hash match |
| untouched→MK1 CAT | untouched skeleton/source hashes, canonical snapshot ID, target language, complete TU→translation-version mapping and inline-code contract match |
| MK1→reviewed CAT | reviewed upload skeleton hash equals exact untouched parent; source units/order/codes unchanged |
| reviewed→MK2 reconciliation | reviewed artifact, untouched skeleton, canonical snapshot and source-unit hashes all match; no newer selected source generation |
| translations→export | selected exact translation versions remain eligible; canonical/skeleton/target hashes match; QA complete |

“Current” must be an explicit selected artifact/snapshot ID under optimistic concurrency, not an implicit maximum timestamp. A newer artifact may supersede an older one without invalidating historical derivations, but new work must fail closed when submitted against a different selected generation.
