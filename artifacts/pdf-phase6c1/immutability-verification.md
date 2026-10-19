# Immutability verification

Artifact identity, scope, generation, path, filename, hash, size, MIME, producer, creator, and creation time cannot change after insertion. The update trigger permits only explicit transitions:

- `reserved -> uploading | failed`
- `uploading -> available | failed`
- `available -> quarantined`

Available rows require `available_at`; failed/quarantined rows require a failure code. Artifact and generation deletion is rejected. Relationships and generation inputs are append-only. Supersession is represented by a new `supersedes` relationship. Storage has no UPDATE policy.

Automated contract test: PASS. Actual-byte collision and distinct-generation tests: PASS.
