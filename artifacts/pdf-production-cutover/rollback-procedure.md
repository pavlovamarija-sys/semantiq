# Generate DOCX rollback procedure

The authoritative `/convert/pdf-to-docx` endpoint defaults to the typed
reconstruction pipeline. Rollback is explicit and does not modify stored source
PDFs, existing DOCX versions, or immutable artifacts.

1. Stop the PDF worker accepting new conversions.
2. Set `PDF_TO_DOCX_CONVERTER_MODE=legacy` in the worker process environment.
3. Restart only the PDF worker with its existing command and service token.
4. Verify `GET /health` returns HTTP 200.
5. Convert a non-production validation PDF and confirm
   `X-Conversion-Path: native-pdf2docx` before allowing new requests.

To restore the typed pipeline, set the variable to `typed` or remove it and
restart the worker. An invalid value returns HTTP 503. A typed failure never
invokes the legacy converter automatically.

Rollback affects only future conversion requests. It must not delete or
overwrite any existing document version or storage object.
