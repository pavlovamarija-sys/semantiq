# RLS verification

All four new tables have RLS enabled. Access resolves through `projects.owner_id = auth.uid()`, matching the existing application ownership model. Artifact and generation inserts require `created_by = auth.uid()`. Composite project foreign keys prevent cross-project generation inputs and lineage edges.

The private `document-artifacts` bucket has authenticated SELECT and reserved-object INSERT policies. Paths must correlate to an owned project and a reserved/uploading artifact row. There is no UPDATE policy. DELETE is limited to owned, uncommitted `reserved`, `uploading`, or `failed` rows; available bytes cannot be deleted through ordinary authenticated access.

Verification in this slice is migration-level/static because this repository has no local Supabase configuration. No existing RLS policy was modified or weakened.
