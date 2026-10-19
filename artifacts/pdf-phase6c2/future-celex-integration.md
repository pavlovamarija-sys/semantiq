# Future CELEX integration

Primary and corrigendum branches now call the same source registration helper after successful storage and `document_versions` persistence. The helper reads the persisted object rather than trusting downloaded request bytes. Corrigenda use `producer_kind=corrigendum_import`; primaries use `celex_import`.

CELEX resolution, PDF analysis, source paths, document identities, existing download routes, and optional shadow semantics are unchanged. Registration invokes neither reconstruction nor shadow. Existing `documents`/`document_versions` remain read authority.
