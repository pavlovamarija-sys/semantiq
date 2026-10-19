# Manifest route investigation

The manifest itself contains nine unique routes. No entry contains `/storage/source/storage/source`; that form is a URL concatenation/navigation error outside the persisted manifest.

The corrected route with document ID `23794d6e-88c8-445e-b235-ba0c9cde16c5` correctly identifies:

- CELEX `31990L0427`
- document version `6cf79e70-cde6-46b3-bd56-4db597f06c06`
- persisted size 420,716 bytes
- downloaded SHA-256 `223b48effbf7a7acf016833a1a2b5fc912b199b5248ba4c73ec2f4921fad6f0a`

No other manifest entry uses that document route.

The missing entry is instead:

- CELEX `31990L0426R(01)`
- document `c3ec6014-1050-4584-810d-0878850ee82a`
- version `57353de3-1373-4be2-97f4-91f5d23c2225`
- persisted path ending `c3ec6014-.../57353de3-....pdf`
- metadata size 137,370 bytes

`31990L0427R(01)` is a separate corrigendum document/version (`71bd1356...` / `e803725e...`) whose downloaded file is also 137,370 bytes. Equal size does not establish equal bytes. Its SHA-256 is known, but the missing file must be downloaded independently before an identity comparison can be made.

The route is document-level: it selects the highest-version source-bearing `document_versions` row. Remote audit shows each of these ten source documents currently has exactly one source version, so it resolves the intended version today. Architecturally it is unsafe for selecting a non-current historical version once a document has multiple versions; the explicit verification command now refuses a candidate unless the route's selected version equals the supplied version ID.
