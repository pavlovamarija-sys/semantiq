# RLS verification

Remote inspection confirms RLS enabled on all four foundation tables and project-owner policies matching existing authorization. Composite project foreign keys and scope triggers reject project/document/version mismatches. Storage paths are not publicly readable; both source and artifact buckets remain private.

The existing authenticated source-download route remains unchanged and reads through `document_versions`. Static and service tests cover cross-project/scope rejection. A live authorized metadata read was not executed because this CLI has no user browser session; no RLS bypass or service-role credential was added. This access limitation contributes to PARTIAL classification.
