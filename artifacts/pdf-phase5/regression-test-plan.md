# Regression test plan

Promote 32006L0114, 32006L0126 and blind 32006L0042 to immutable regression fixtures where licensing permits. Assert source hashes, exact source-span coverage, normalized text integrity, provenance, reading order, native tables, cell paragraph rules and Studio projection invariants without making every internal count an algorithm rule.

Unit coverage must include single/two-column reading order, mixed layouts, false aligned-list tables, multi-fragment cells, same-page joins, cross-page continuity, repeated headers, MERGE, KEEP_BOUNDARY, ABSTAIN, malformed provenance and exact DOCX text integrity. Keep small synthetic PDFs for isolated geometry and resource cases.

Integration coverage must exercise worker auth, retries/idempotency, storage cleanup, artifact manifests, canonical projection and immutable Studio source identity. Run the existing 31-test worker suite plus fixture validation in CI.
