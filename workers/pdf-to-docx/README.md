# PDF-to-DOCX worker

An isolated FastAPI service that converts PDFs to editable DOCX files with a
geometry-aware PyMuPDF reconstruction pipeline. It normalizes the Word document to the
EU Acquis profile, reopens/resaves it, and validates its OOXML package before
returning bytes. Failed conversion or validation always produces structured
JSON and never a fallback document.

Before conversion the worker records per-page text, word, raw-glyph, image
coverage, and vector-drawing diagnostics. Native text and usable raw glyphs are
reconstructed into one-column reading order without OCR; image/vector-only documents use the
Tesseract OCR fallback. OCR produces editable paragraphs and records
`X-OCR-Fallback-Used: true` and `X-Conversion-Path: ocr-fallback` in the
response. The Docker image includes English Tesseract data.

`POST /analyze/pdf` exposes that same canonical PyMuPDF extraction for source
integrity validation, source text, character counts, and legacy-file backfill.
Next.js deliberately does not run PDF.js or a browser PDF worker server-side.

Running OJ headers/footers are removed before reconstruction. Two-column pages
are emitted as top full-width structural material, then the complete left
column, then the complete right column. Legal marker order is validated before
format normalization; an impossible Article, Chapter, Annex, or enacting-formula
sequence fails conversion instead of producing a Ready document.

Detected OJ footnotes are converted to genuine Word footnotes with custom
source markers. The worker validates marker/reference/text completeness and
removes the extracted body copy only after successful matching. Ambiguous
matches return `footnotes_need_review` and preserve the source text.

## Local development (PowerShell)

From the repository root:

```powershell
py -3.12 -m venv workers/pdf-to-docx/.venv
workers/pdf-to-docx/.venv/Scripts/python.exe -m pip install -r workers/pdf-to-docx/requirements.txt
$env:PDF_TO_DOCX_SERVICE_TOKEN = "local-development-token"
$env:PDF_TO_DOCX_CONVERTER_MODE = "typed"
workers/pdf-to-docx/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir workers/pdf-to-docx --host 127.0.0.1 --port 8000 --reload
```

In the terminal that starts Next.js:

```powershell
$env:PDF_TO_DOCX_SERVICE_URL = "http://127.0.0.1:8000/convert/pdf-to-docx"
$env:PDF_TO_DOCX_SERVICE_TOKEN = "local-development-token"
npm.cmd run dev
```

The token must be a server-only secret and must match in both processes. For a
container deployment, build with `docker build -t eu-acquis-pdf-worker
workers/pdf-to-docx` and supply the token at runtime.

`PDF_TO_DOCX_CONVERTER_MODE` defaults to `typed`. The only rollback setting is
the explicit value `legacy`; an invalid value returns HTTP 503, and a typed
reconstruction failure never falls back to the legacy converter.

## Verification

Run the tests and convert a real PDF through the HTTP endpoint:

```powershell
workers/pdf-to-docx/.venv/Scripts/python.exe -m pytest workers/pdf-to-docx/tests
workers/pdf-to-docx/.venv/Scripts/python.exe workers/pdf-to-docx/scripts/verify_conversion.py path/to/eur-lex.pdf --url http://127.0.0.1:8000/convert/pdf-to-docx --token local-development-token
```

The verification script checks the returned headers, saves the DOCX beside the
PDF, and independently validates its ZIP, XML, relationships, namespaces, and
editable Word text.

