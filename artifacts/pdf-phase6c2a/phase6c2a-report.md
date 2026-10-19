# Phase 6C.2A report

## Overall Phase 6C.2 classification: PASS

The existing authenticated browser route is the only legitimate mechanism available for the remaining nine private objects. `32008L0050` differed only because its prior user-mediated authenticated download was retained locally; it was not remotely accessible to Codex. No path-policy or legacy-object distinction grants access to the others.

No registration was attempted without actual byte evidence. A strict manual manifest now maps each project/document/version to one authenticated application route and one unique local evidence folder. The verification command requires an explicit `document_version_id`, queries that exact inventory candidate, validates `%PDF-`, computes actual SHA-256/size, and never infers identity from filename. Registration remains a separate explicit command and references the existing Supabase path; it never uploads the local file.

User action is required before Phase 6C.2 can become PASS. No Phase 6C.3 work was started.

## Download-set validation continuation

Eight of nine expected files are present and valid PDFs; all eight hashes are unique. Version `57353de3-1373-4be2-97f4-91f5d23c2225` (`31990L0426R(01)`) is missing. No registration was performed because the user required complete-set validation first.

The manifest has no duplicate route and does not contain `/storage/source/storage/source`. The corrected document `23794d6e...` route belongs only to `31990L0427` / version `6cf79e70...`. The missing corrigendum has a distinct document route. The route is document-level, but each audited source document currently has exactly one source version; the verification command additionally checks this exact resolution before accepting evidence.

## Completion

The final missing `31990L0426R(01)` file was obtained through the authenticated application route. Its exact-byte result is SHA-256 `ffc2f2380cb2fdd4294ce97fe76da7f205b3d49a08ee10ce9b4fa526777df1ce`, size 137,370 bytes, with a valid `%PDF-` signature and exact route/version correlation.

After the full nine-file set passed validation, all nine were registered using their existing Supabase storage identities. No local PDF was uploaded. Final postcheck reports 10 available `SOURCE_PDF` artifacts, 10 completed registration generations, and zero missing, inaccessible, invalid, ambiguous, or failed candidates. A second complete run was idempotent: 10 already registered, zero new artifacts, and no hash, size, path, or object changes.

The identical bytes shared by `31990L0426R(01)` and `31990L0427R(01)` are intentional and independently proven, not a manifest error. Production behavior, reconstruction, schema, storage objects, CAT code, and translation code were unchanged during completion.

Relevant tests and frozen reconstruction fixtures pass. The broad application suite retains only its two known unrelated legacy-TM fixture failures. No Phase 6C.3 work was started.
