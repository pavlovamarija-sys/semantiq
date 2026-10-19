# Migration audit

Migration: `20261019000000_immutable_document_artifacts.sql`

SHA-256: `7068D6A0B57FFD2629BFAEED3BD5A09D5E240AA127FD900538B2248D60F4CEAE`

The migration follows the current timestamp naming convention and is later than `20261018000006_translation_report_artifacts.sql`. It is additive: it creates new tables, functions, triggers, indexes, policies, and a private bucket. It contains no `DROP`, destructive `ALTER`, backfill, rename, or mutation of existing document/storage rows.

Conservative deviation from the design sketch: storage identity and verified byte metadata are non-null and immutable from reservation, rather than being filled during finalization. The application computes these from actual bytes before reservation; finalization publishes only `status` and `available_at` after storage read-back. This strengthens the accepted immutability contract and keeps recovery possible.

`processing_generation_inputs` is included as the minimal generic foundation accepted in 6C.0 for frozen input hashes and multi-input generation identity. No canonical, CAT, or translation-specific table was created.

Repository limitation: no Supabase local config/database is present, so the migration was not applied during this slice. SQL contract assertions cover its critical constraints; deployment migration execution remains the release-time validation step.
