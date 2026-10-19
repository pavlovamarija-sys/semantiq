# Corrigendum verification

Existing corrigenda remain separate documents linked through `parent_document_id`, with separate document versions and source paths. Inventory found three corrigenda, all currently inaccessible to the CLI under authenticated Storage RLS and therefore not backfilled.

The future CELEX corrigendum branch registers its own bytes/version/path and labels the producer `corrigendum_import`. Tests confirm primary and corrigendum registration identities remain distinct and neither can overwrite the other.
