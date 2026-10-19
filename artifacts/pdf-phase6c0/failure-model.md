# Failure model

- Source hash mismatch: quarantine candidate, fail generation, do not reconstruct.
- Reconstruction/source coverage/ordered-token failure: persist diagnostics, mark `failed_validation`, expose no validated DOCX.
- Structural/table/boundary validation failure: same fail-closed behavior; ABSTAIN may be accepted only under explicit validation policy.
- DOCX package/hash failure: no available DOCX or canonical extraction.
- CAT skeleton/source hash mismatch: reject projection/upload; retain bytes only as quarantined evidence if policy allows.
- Inline-code mismatch: reject MK1 injection, reviewed upload or reconciliation; never repair source/target text silently.
- Stale reviewed SDLXLIFF: retain immutable upload as rejected/quarantined, produce no MK2 versions.
- Partial reconciliation: generation fails/needs review; any provisional versions remain non-approved and excluded from trusted TM.
- Missing artifact bytes or download hash mismatch: quarantine DB artifact, block consumers, alert; never regenerate under same ID.
- Storage upload failure: fail reservation and clean only its incomplete path. DB-finalization failure after upload is recoverable through the same idempotency reservation.
- Export from incomplete/non-current state: reject with exact stale/gate reason; do not fall back to “latest.”
