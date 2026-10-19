# Rollback plan

1. Code integration: revert the two `registerPersistedSourcePdf` calls and helper. Existing CELEX persistence/download continues unchanged.
2. Backfilled evidence: retain the registered row and hash as audit evidence; disable future writes rather than deleting it. Never delete the existing source PDF.
3. Schema: because production evidence now exists, do not destructively drop tables in ordinary rollback. Stop writers and retain the additive unused schema. A separately reviewed forward migration would be required only if full schema removal later becomes legally and operationally justified.

The nine inaccessible candidates require no rollback because they were never registered or modified.
