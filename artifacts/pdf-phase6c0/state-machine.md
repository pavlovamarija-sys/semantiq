# State machine

Artifact state and processing state are separate from translation trust.

## Processing generations

`pending → running → validating → completed`

Terminal alternatives: `failed`, `failed_validation`, `abandoned`. Retry creates/reuses according to idempotency policy; terminal history is retained.

## Artifacts

`reserved → uploading → available`; failures go to `failed`. An available artifact may become `quarantined` after missing-byte/hash detection, or be related as `superseded`; bytes are not rewritten. Supersession is not deletion.

## Workflow

Source acquisition: persist source/version → register verified `SOURCE_PDF`.

Reconstruction: generation → model validation → model artifact → DOCX render/validation → available `VALIDATED_DOCX`.

Canonical extraction: pending snapshot → transactional rows/validation → available snapshot.

CAT projection: generation → immutable untouched SDLXLIFF → MK1 injection generation/artifact → reviewed upload artifact.

Reconciliation: generation → validated MK2 translation versions + report → review-ready. Partial reconciliation is failed/needs-review, not approved.

Approval/export: explicit human approval changes trust state; export generation consumes exact approved/selected versions. Artifact existence never implies approval.
