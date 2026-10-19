# Rollback plan

The new route has no callers, so operational rollback is immediate: do not invoke it. The additive migration may remain dormant; removing a deployed immutable audit foundation is not required. If code rollback is required, remove the explicit route/orchestrator and worker endpoint while retaining already persisted audit rows. Never delete available artifacts or lineage. Existing SOURCE_PDF registration and active PDF-to-DOCX behavior continue unchanged.
