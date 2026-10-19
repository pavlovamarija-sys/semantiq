# Route safety verification

The authenticated source-download route is document-level and selects the newest source-bearing `document_version`. It is therefore not intrinsically safe for arbitrary historical-version verification.

For this backfill, every audited source document had exactly one source-bearing version. The verifier also required the route-selected version to equal the explicitly requested manifest `document_version_id` before accepting bytes. All nine correlations passed.

The manifest contains no duplicate route and no `/storage/source/storage/source` value. The duplicated suffix was a manual URL-concatenation error. Document `23794d6e-88c8-445e-b235-ba0c9cde16c5` maps only to CELEX `31990L0427`, version `6cf79e70-cde6-46b3-bd56-4db597f06c06`.

Versions `57353de3-1373-4be2-97f4-91f5d23c2225` and `e803725e-77db-463b-80fa-ef8e9b54e22b` legitimately contain identical bytes, but retain distinct CELEX, document, version, route, and storage identities.
