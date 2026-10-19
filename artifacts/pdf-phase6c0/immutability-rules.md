# Immutability rules

1. Available artifact metadata and bytes are never updated. A changed output receives a new artifact ID/path/generation.
2. Storage uses `upsert:false`; artifact ID is a path component. DB uniqueness prevents path reuse.
3. SHA-256, byte size and MIME are computed/verified from uploaded bytes before `available`. Consumer download rechecks hash at trust boundaries.
4. A DB trigger rejects updates to immutable identity/storage/hash/producer fields. Only tightly constrained state transitions (`reserved→uploading→available|failed`, `available→quarantined`) are allowed.
5. Supersession is an appended `supersedes` relationship; prior artifacts remain addressable. “Current” is selected by a validated pointer/view, not by rewriting old rows.
6. Failed/abandoned processing generations remain with bounded error metadata and no available output. `abandoned` is terminal and distinct from validation failure.
7. Hard deletion is exceptional: project purge/retention job, authorized explicitly, checks descendant/trust/legal-hold references, deletes storage only after DB plan, and records an audit tombstone. Normal user regeneration never deletes old artifacts.
8. Existing delete flows remain unchanged until migration slices deliberately adopt artifact retention. Legacy objects may retain current deletion semantics.
9. DB constraints enforce identity, state vocabulary, referential consistency and path uniqueness. Storage design prevents collisions. Application transactions/orchestration enforce upload verification, lineage completeness, stale checks and cleanup/recovery.
