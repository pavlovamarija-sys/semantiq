# Backfill summary

Ten authoritative PDF versions were inventoried. One had a prior legitimate authenticated download retained as byte evidence and was registered. Nine could not be read from this CLI under Storage RLS and were left untouched.

- Candidates: 10
- Registered: 1
- Unauthorized/inaccessible: 9
- Invalid/missing/ambiguous/failed: 0
- Second-run new artifacts: 0
- Existing objects uploaded, moved, renamed, overwritten, or deleted: 0

The registered legacy artifact references its existing `source-documents` object. The backfill uses an advisory transaction lock and immutable uniqueness constraints.

## Phase 6C.2A continuation

The remaining nine were confirmed to require the user's existing browser-authenticated source route. No automated server-side mechanism with equivalent user authorization is available to this process. A strict per-version manual manifest was produced in `artifacts/pdf-phase6c2a/manual-backfill-manifest.json`; no additional artifacts were registered yet.
# Final completion

Phase 6C.2 historical backfill is complete: 10/10 authoritative source versions have available `SOURCE_PDF` artifacts and completed registration generations. Missing, inaccessible, invalid, ambiguous, and failed counts are all zero. Final rerun: 10 already registered, zero newly created, zero mutations.

