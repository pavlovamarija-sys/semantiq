# Generate DOCX typed-pipeline cutover

## Result

The worker's existing `/convert/pdf-to-docx` contract now delegates to the
validated typed reconstruction model and native DOCX renderer by default. The
Next.js action, processing states, private Supabase upload/readback, derived
document association, `derived_from_version_id` lineage, version numbering,
Files-tab query, and authenticated download route were left unchanged.

The historical converter remains available only through the explicit worker
setting `PDF_TO_DOCX_CONVERTER_MODE=legacy`. There is no silent fallback.

## Publication gates

Before response bytes are returned, the worker requires:

- exact source-span accounting, including explicit page-furniture exclusions;
- source-to-model token inventory integrity;
- structural Article/Annex reading-order validation;
- native rendering of the typed model;
- model-to-DOCX ordered text and native-footnote integrity;
- rendered table shape equality with the logical cross-page table model;
- OOXML ZIP, relationship, namespace, editable-text, and one-to-one footnote validation.

Any failure returns HTTP 422 and no DOCX. Invalid converter configuration
returns HTTP 503.

## Controlled endpoint validation

- `32025D2586`: HTTP 200 through the live endpoint; one native 5-column,
  5-row Annex table, one footnote, and one landscape section. SHA-256
  `d627b4572e272bfaa18d4756a95cd639407050707d52987e1abf4526a6da306f`.
- `32006L0054`: HTTP 200 through the live endpoint; three native tables,
  70 rows, 308 cells, and seven footnotes. SHA-256
  `086368bfa7ce7f7fcbdd52b1ce01435899e42eadc1706a2ee327c0699a90e969`.

The independent OOXML validator had counted Word's reserved continuation
separator (`w:footnote w:id="0" w:type="continuationSeparator"`) as a legal
footnote definition. It now excludes typed separator records and validates only
actual footnote definitions. This fixes the validator contract; it does not
change document content.

## Verification

- Python worker suite: 70 passed.
- CELEX shadow orchestration: 5 passed.
- Immutable artifact tests: 16 passed.
- SOURCE_PDF artifact tests: 16 passed.
- Reconstruction artifact tests: 5 passed.
- Exact artifact readback tests: 15 passed.
- VALIDATED_DOCX artifact tests: 4 passed.
- TypeScript: PASS.
- Next.js health: HTTP 200.
- Worker health: HTTP 200.

## Remaining operational verification

No authenticated browser cookie is available to this process. Consequently,
the two controlled documents were validated through the live worker endpoint,
but the authenticated Workspace Server Action was not invoked and no Supabase
DOCX version was published. Using service-role credentials would bypass the
required user/RLS workflow and was intentionally not done.

The Files tab already reads the latest ready derived document version and links
its existing authenticated `storage/source` route. A final user-authenticated
Generate DOCX invocation is still required to prove upload, automatic refresh,
Files-tab visibility, and download in the running Workspace.
