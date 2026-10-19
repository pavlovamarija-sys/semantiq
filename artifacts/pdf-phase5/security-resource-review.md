# Security and resource review

Enforce authenticated worker calls, private storage, MIME/signature checks, bounded PDF bytes, page/span limits, request timeouts, concurrency limits and temporary-directory cleanup. Reject malformed PDFs, encrypted/unsupported files and pathological geometry with structured review-required errors.

Recommended initial controls: retain the existing 50 MiB application upload and 100 MiB worker ceiling, add maximum pages/spans and estimated output bytes, cap concurrent conversions per project/user, and enforce separate extraction/conversion wall-clock and memory/container limits. Treat decompression bombs, huge images, corrupted fonts and repeated retry failures as non-retryable or review-required according to error code.

Retries must be idempotent by source hash and generation key. Storage writes use immutable paths and no overwrite. Do not log document text, secrets, bearer tokens or raw worker internals. Validate all artifact hashes before downstream publication.
