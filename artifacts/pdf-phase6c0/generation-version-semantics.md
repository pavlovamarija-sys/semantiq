# Generation and version semantics

- **Document version**: a specific persisted textual/file state of one logical document. Current `document_versions` remains this concept. Example: working DOCX version 2 is a new source state for translation.
- **Artifact generation**: one immutable occurrence of an artifact type for a document version. Two validated DOCX attempts from the same source are generations 1 and 2, even if byte-identical.
- **Processing generation**: execution/audit envelope that reserves idempotency, records inputs/config/producer/status, and may produce zero or many artifacts.
- **Translation version**: immutable target text for one TU/segment (`translation_versions`). MK1, translator draft, reconciled MK2, and reviewer versions are separate rows.
- **CAT review version**: immutable CAT artifact generation. Untouched, MK1-injected, and each reviewed upload are different artifact IDs; they are not translation versions.
- **Approval version/event**: explicit decision binding eligible human translation versions to an approver/time/QA basis. Existing approval fields/RPC are the current form; future document-level approval should reference an immutable reconciliation generation.

Example for CELEX 32008L0050: source document version `S1`; reconstruction processing generation `R2`; model artifact `M2`; validated DOCX `D2`; canonical snapshot `C2`; untouched Studio artifact `X1`; MK1 CAT artifact `X2` using translation versions `T1…Tn`; reviewed artifact `X3`; reconciliation generation `Q1` producing MK2 versions `U1…Un`; approval event `A1`. None of these identifiers are interchangeable.
