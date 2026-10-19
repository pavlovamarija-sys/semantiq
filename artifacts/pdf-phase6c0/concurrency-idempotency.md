# Concurrency and idempotency

- The client supplies/derives an idempotency key per operation from project, input artifact IDs, operation kind, algorithm/config version and requested target language. `processing_generations` uniquely reserves it.
- Double-clicks and timeout retries return the existing generation/result. A terminal failed generation is not silently reused unless retry policy explicitly creates a new attempt key/number.
- A partial unique index permits at most one active generation per `(document_version_id, generation_kind, input fingerprint)`.
- Identical bytes from different completed generations retain distinct artifact IDs; optional storage dedupe is internal and must not merge lineage.
- Upload protocol: reserve generation/artifact and immutable path; upload `upsert:false`; read back/stream-hash; atomically mark artifact available and generation completed. Consumers ignore non-available artifacts.
- Upload failure marks generation failed and deletes only the uncommitted reserved-path object if present.
- Storage success/DB finalization failure leaves an orphan candidate under a known artifact ID. Retry verifies the exact bytes/path and completes the same reservation; a sweeper may delete stale unreferenced reserved objects after retention.
- DB success before storage is impossible for `available`: constraints/state transition require verified size/hash. Missing bytes later quarantine the artifact; never regenerate under the same ID/path.
- Generation numbers are allocated under advisory/row lock or unique-conflict retry. Status updates use expected-current-state predicates to prevent lost updates.
