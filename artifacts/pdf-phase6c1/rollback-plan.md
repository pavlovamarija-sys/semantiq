# Rollback plan

Because the foundation is additive and inactive, application rollback requires no code-path switch. Before any later integration writes rows, rollback may remove the new storage policies/bucket and new schema objects in dependency order through a dedicated forward migration.

Once artifact rows exist, do not drop or delete them as an ordinary rollback. Disable future writers, retain immutable evidence, and use an explicitly reviewed retention/purge migration only after checking lineage and legal-hold requirements.

This migration performs no backfill and does not alter existing tables or objects, so deployment can safely coexist unused with current production behavior.
