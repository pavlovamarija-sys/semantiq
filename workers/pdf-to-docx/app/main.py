import hmac
import hashlib
import json
import os
import tempfile
import time
import uuid
from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from pydantic import ValidationError
import pymupdf

from .errors import WorkerError
from .diagnostics import analyze_pdf
from .profile import ConversionProfile
from .service import ConversionService
from .validate import validate_docx
from .reconstruction.core import (
    assert_source_model_integrity,
    assert_text_integrity,
    build_typed_document,
    inspect_docx_structure,
    render_docx_phase2b,
    validate_structural_reading_order,
)
from .reconstruction.deserialization import deserialize_reconstruction_model
from .reconstruction.serialization import serialize_reconstruction_model
from .canonical import canonicalize_docx
from .reconstruction.pipeline import reconstruct_pdf

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
MAX_PDF_BYTES = int(os.getenv("PDF_TO_DOCX_MAX_BYTES", str(100 * 1024 * 1024)))
TYPED_CONVERTER_ENGINE = "eu-acquis-typed-reconstruction/1"
TYPED_CONVERSION_PATH = "typed-reconstruction/validated-native-docx"

app = FastAPI(title="EU Acquis PDF-to-DOCX Worker", version="1.0.0", docs_url=None, redoc_url=None)


@app.exception_handler(WorkerError)
async def worker_error(_: Request, error: WorkerError):
    return JSONResponse(status_code=error.status, content={"error": {"code": error.code, "message": error.message, "details": error.details}})


@app.exception_handler(RequestValidationError)
async def request_error(_: Request, error: RequestValidationError):
    fields = [{"location": list(item["loc"]), "message": item["msg"], "type": item["type"]} for item in error.errors()]
    return JSONResponse(status_code=422, content={"error": {"code": "invalid_request", "message": "The multipart request is invalid.", "details": {"fields": fields}}})


@app.exception_handler(Exception)
async def unexpected_error(_: Request, __: Exception):
    # Avoid leaking input content, filesystem paths, or internals to callers.
    return JSONResponse(status_code=500, content={"error": {"code": "internal_error", "message": "The document worker failed unexpectedly.", "details": {}}})


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/shadow/reconstruct")
async def shadow_reconstruct(document: UploadFile = File(...), authorization: str | None = Header(None)):
    """Non-authoritative reconstruction diagnostics; never returns an active DOCX."""
    _authorize(authorization)
    run_id = str(uuid.uuid4())
    started = time.monotonic()
    data = await _read_pdf(document)
    max_pages = int(os.getenv("PDF_TO_DOCX_SHADOW_MAX_PAGES", "100"))
    with tempfile.TemporaryDirectory(prefix=f"pdf-shadow-{run_id}-") as directory:
        source = Path(directory, "source.pdf")
        output = Path(directory, "shadow.docx")
        source.write_bytes(data)
        try:
            model, decisions, diagnostics = build_typed_document(source)
            if diagnostics["extraction"]["pages"] > max_pages:
                raise WorkerError("shadow_resource_limit", "Shadow page limit exceeded.", status=413, details={"maxPages": max_pages})
            coverage = assert_source_model_integrity(model, diagnostics["sourceReadingText"], diagnostics["sourceSpanIds"], diagnostics.get("excludedPageFurnitureSpanIds", []))
            render_docx_phase2b(model, output)
            integrity = assert_text_integrity(model, output)
            digest = hashlib.sha256(output.read_bytes()).hexdigest()
            boundary = [item for item in decisions if item.kind == "paragraph-boundary"]
            outcomes = {key: sum(item.outcome.upper() == key for item in boundary) for key in ("MERGE", "KEEP_BOUNDARY", "ABSTAIN")}
            tables = [node for node in model.children if node.type == "Table"]
            result = {"runId": run_id, "sourceSha256": hashlib.sha256(data).hexdigest(), "status": "completed",
                "workerVersion": app.version, "docxSha256": digest, "typedModelSummary": {"pages": diagnostics["extraction"]["pages"], "blocks": diagnostics["extraction"]["blocks"], "lines": diagnostics["extraction"]["lines"], "spans": diagnostics["extraction"]["spans"], "tokens": len(diagnostics["sourceReadingText"].split())},
                "reconstructionSummary": {"physicalTables": len(tables), "rows": sum(len(t.children) for t in tables), "cells": sum(len(r.children) for t in tables for r in t.children), "boundaries": outcomes},
                "validationSummary": {"sourceCoverage": coverage, "textIntegrity": integrity}, "durationMs": round((time.monotonic() - started) * 1000)}
            return result
        except WorkerError:
            raise
        except Exception as error:
            return {"runId": run_id, "sourceSha256": hashlib.sha256(data).hexdigest(), "status": "failed", "error": {"category": type(error).__name__, "message": str(error)[:500]}, "durationMs": round((time.monotonic() - started) * 1000)}


@app.post("/reconstruct/model")
async def reconstruct_model(
    document: UploadFile = File(...),
    generation_id: str = Form(...), source_artifact_id: str = Form(...),
    source_sha256: str = Form(...), config_sha256: str = Form(...),
    authorization: str | None = Header(None),
):
    """Execute the validated deterministic core and return only its typed JSON model."""
    _authorize(authorization)
    for label, value in (("generation_id", generation_id), ("source_artifact_id", source_artifact_id)):
        try: uuid.UUID(value)
        except ValueError as error: raise WorkerError("invalid_identity", f"{label} must be a UUID.", status=400) from error
    for label, value in (("source_sha256", source_sha256), ("config_sha256", config_sha256)):
        if len(value) != 64 or any(char not in "0123456789abcdef" for char in value):
            raise WorkerError("invalid_identity", f"{label} must be a lowercase SHA-256.", status=400)
    data = await _read_pdf(document)
    actual_sha256 = hashlib.sha256(data).hexdigest()
    if not hmac.compare_digest(actual_sha256, source_sha256):
        raise WorkerError("source_hash_mismatch", "Source bytes do not match the registered SOURCE_PDF.", status=409)
    with tempfile.TemporaryDirectory(prefix=f"reconstruction-{generation_id}-") as directory:
        source = Path(directory, "source.pdf")
        source.write_bytes(data)
        try:
            model, decisions, diagnostics = reconstruct_pdf(source)
            body, metrics = serialize_reconstruction_model(model, decisions, diagnostics,
                generation_id=generation_id, source_artifact_id=source_artifact_id,
                source_sha256=source_sha256, config_sha256=config_sha256)
        except Exception as error:
            raise WorkerError("reconstruction_validation_failed", "Typed reconstruction validation failed.",
                status=422, details={"category": type(error).__name__, "reason": str(error)[:500]}) from error
    response = Response(body, media_type="application/json")
    response.headers["X-Reconstruction-Validation"] = "PASS"
    response.headers["X-Reconstruction-Metrics"] = json.dumps(metrics, separators=(",", ":"))
    response.headers["X-Reconstruction-Algorithm"] = "typed-reconstruction-phase6a-inactive"
    return response


@app.post("/render/validated-docx")
async def render_validated_docx(
    model: UploadFile = File(...), model_generation_id: str = Form(...), model_artifact_id: str = Form(...),
    model_sha256: str = Form(...), source_artifact_id: str = Form(...), source_sha256: str = Form(...),
    authorization: str | None = Header(None),
):
    """Render a validated immutable model with the frozen Studio-compatible serializer."""
    _authorize(authorization)
    for label, value in (("model_generation_id", model_generation_id), ("model_artifact_id", model_artifact_id),
                         ("source_artifact_id", source_artifact_id)):
        try: uuid.UUID(value)
        except ValueError as error: raise WorkerError("invalid_identity", f"{label} must be a UUID.", status=400) from error
    for label, value in (("model_sha256", model_sha256), ("source_sha256", source_sha256)):
        if len(value) != 64 or any(char not in "0123456789abcdef" for char in value):
            raise WorkerError("invalid_identity", f"{label} must be a lowercase SHA-256.", status=400)
    data = await model.read(MAX_PDF_BYTES + 1)
    if len(data) > MAX_PDF_BYTES:
        raise WorkerError("model_too_large", "The reconstruction model exceeds the configured size limit.", status=413)
    with tempfile.TemporaryDirectory(prefix="validated-docx-") as directory:
        output = Path(directory, "validated.docx")
        try:
            document, audit = deserialize_reconstruction_model(data, generation_id=model_generation_id,
                model_artifact_id=model_artifact_id, model_sha256=model_sha256,
                source_artifact_id=source_artifact_id, source_sha256=source_sha256)
            render_docx_phase2b(document, output)
            integrity = assert_text_integrity(document, output)
            structure = inspect_docx_structure(output)
            expected_tables = _expected_rendered_tables(document)
            actual_tables = [
                {"rows": item["rows"], "columns": item["columns"], "cells": item["cells"]}
                for item in structure["tables"]
            ]
            if actual_tables != expected_tables:
                raise ValueError("Rendered DOCX table structure differs from the validated model.")
            body = output.read_bytes()
            if not body.startswith(b"PK"):
                raise ValueError("Rendered DOCX package signature is invalid.")
        except Exception as error:
            raise WorkerError("docx_serialization_validation_failed", "Validated DOCX serialization failed.",
                              status=422, details={"category": type(error).__name__, "reason": str(error)[:500]}) from error
    response = Response(body, media_type=DOCX_MIME)
    response.headers["Content-Disposition"] = 'attachment; filename="validated.docx"'
    response.headers["X-DOCX-Validation"] = "PASS"
    response.headers["X-DOCX-Metrics"] = json.dumps({"normalizedTokens": integrity["tokens"], "structure": structure}, separators=(",", ":"))
    response.headers["X-DOCX-Serializer"] = "typed-reconstruction-phase2b-frozen"
    return response


@app.post("/canonicalize/docx")
async def canonicalize_validated_docx(
    document: UploadFile = File(...), validated_docx_artifact_id: str = Form(...), validated_docx_sha256: str = Form(...),
    authorization: str | None = Header(None),
):
    _authorize(authorization)
    try: uuid.UUID(validated_docx_artifact_id)
    except ValueError as error: raise WorkerError("invalid_identity", "validated_docx_artifact_id must be a UUID.", status=400) from error
    if len(validated_docx_sha256) != 64 or any(c not in "0123456789abcdef" for c in validated_docx_sha256):
        raise WorkerError("invalid_identity", "validated_docx_sha256 must be a lowercase SHA-256.", status=400)
    data = await document.read(MAX_PDF_BYTES + 1)
    with tempfile.TemporaryDirectory(prefix="canonical-docx-") as directory:
        source = Path(directory, "validated.docx"); source.write_bytes(data)
        try: body, metrics = canonicalize_docx(source, validated_docx_artifact_id=validated_docx_artifact_id, validated_docx_sha256=validated_docx_sha256)
        except Exception as error: raise WorkerError("canonical_validation_failed", "Canonical DOCX extraction failed.", status=422, details={"category": type(error).__name__, "reason": str(error)[:500]}) from error
    response = Response(body, media_type="application/json"); response.headers["X-Canonical-Validation"] = "PASS"; response.headers["X-Canonical-Metrics"] = json.dumps(metrics, separators=(",", ":")); response.headers["X-Canonical-Schema"] = "eu-acquis.canonical-document.v1"; return response


def _authorize(authorization: str | None) -> None:
    expected = os.getenv("PDF_TO_DOCX_SERVICE_TOKEN", "").strip()
    supplied = authorization.removeprefix("Bearer ") if authorization and authorization.startswith("Bearer ") else ""
    if not expected:
        raise WorkerError("configuration_error", "Worker authentication is not configured.", status=503)
    if not hmac.compare_digest(supplied, expected):
        raise WorkerError("unauthorized", "A valid bearer token is required.", status=401)


async def _read_pdf(document: UploadFile) -> bytes:
    data = await document.read(MAX_PDF_BYTES + 1)
    if len(data) > MAX_PDF_BYTES:
        raise WorkerError("pdf_too_large", "The PDF exceeds the configured size limit.", status=413, details={"maxBytes": MAX_PDF_BYTES})
    if not data.startswith(b"%PDF-"):
        raise WorkerError("invalid_pdf", "The uploaded document is not a PDF.", status=415)
    return data


def _converter_mode() -> str:
    """Select the authoritative converter explicitly; never fall back between engines."""
    mode = os.getenv("PDF_TO_DOCX_CONVERTER_MODE", "typed").strip().lower()
    if mode not in {"typed", "legacy"}:
        raise WorkerError(
            "configuration_error",
            "PDF_TO_DOCX_CONVERTER_MODE must be either 'typed' or 'legacy'.",
            status=503,
        )
    return mode


def _expected_rendered_tables(document) -> list[dict[str, int]]:
    """Mirror the renderer's adjacent cross-page table chaining for validation."""
    table_chains: dict[str, list] = {}
    for candidate in document.children:
        if candidate.type == "Table":
            logical_id = str(candidate.attributes.get("logicalTableId", candidate.id))
            table_chains.setdefault(logical_id, []).append(candidate)

    rendered: set[str] = set()
    expected: list[dict[str, int]] = []
    for node_index, node in enumerate(document.children):
        if node.type != "Table" or node.id in rendered:
            continue
        logical_id = str(node.attributes.get("logicalTableId", node.id))
        candidates = table_chains[logical_id]
        chain = [node]
        current_index = node_index
        for candidate in candidates[candidates.index(node) + 1:]:
            candidate_index = document.children.index(candidate)
            if any(item.type != "PageBreak" for item in document.children[current_index + 1:candidate_index]):
                break
            chain.append(candidate)
            current_index = candidate_index
        rows = [
            row
            for segment in chain
            for row_index, row in enumerate(segment.children)
            if not (row_index == 0 and row.attributes.get("repeatedHeader"))
        ]
        columns = int(node.attributes["columns"])
        if not rows or any(len(row.children) != columns for row in rows):
            raise ValueError(f"Typed table {logical_id} has an invalid row/column contract.")
        expected.append({"rows": len(rows), "columns": columns, "cells": len(rows) * columns})
        rendered.update(segment.id for segment in chain)
    return expected


def _validate_typed_conversion(source: Path, output: Path) -> dict[str, object]:
    document, decisions, diagnostics = reconstruct_pdf(source)
    coverage = assert_source_model_integrity(
        document,
        diagnostics["sourceReadingText"],
        diagnostics["sourceSpanIds"],
        diagnostics.get("excludedPageFurnitureSpanIds", []),
    )
    reading_order = validate_structural_reading_order(document)
    render_docx_phase2b(document, output)
    integrity = assert_text_integrity(document, output)
    package_validation = validate_docx(output)
    structure = inspect_docx_structure(output)
    expected_tables = _expected_rendered_tables(document)
    actual_tables = structure["tables"]
    actual_shape = [
        {"rows": item["rows"], "columns": item["columns"], "cells": item["cells"]}
        for item in actual_tables
    ]
    if actual_shape != expected_tables:
        raise ValueError(f"Rendered DOCX table structure differs from the typed model: expected {expected_tables}, got {actual_shape}.")
    body = output.read_bytes()
    if not body.startswith(b"PK"):
        raise ValueError("Rendered DOCX package signature is invalid.")
    return {
        "coverage": coverage,
        "integrity": integrity,
        "readingOrder": reading_order,
        "packageValidation": package_validation,
        "structure": structure,
        "editableCharacters": sum(not character.isspace() for character in diagnostics["sourceReadingText"]),
    }


@app.post("/analyze/pdf")
async def analyze_pdf_document(document: UploadFile = File(...), authorization: str | None = Header(None)):
    _authorize(authorization)
    data = await _read_pdf(document)
    with tempfile.TemporaryDirectory(prefix="pdf-analysis-") as directory:
        source = Path(directory, "source.pdf")
        source.write_bytes(data)
        try:
            with pymupdf.open(source) as pdf:
                if not pdf.is_pdf or pdf.page_count < 1:
                    raise ValueError("The source has no readable PDF pages.")
                for page_number in range(pdf.page_count):
                    pdf.load_page(page_number)
        except Exception as error:
            raise WorkerError("pdf_integrity_failed", "The PDF package or page tree could not be validated.", details={"reason": str(error)[:500]}) from error
        try:
            analysis = analyze_pdf(source)
        except Exception as error:
            return {
                "integrityValidated": True,
                "sourceText": None,
                "charactersWithoutSpaces": None,
                "charactersWithSpaces": None,
                "diagnostics": {"pages": [], "classification": "extraction_failed"},
                "countError": f"PyMuPDF text extraction failed: {str(error)[:500]}",
            }
        return {
            "integrityValidated": True,
            "sourceText": analysis.sourceText,
            "charactersWithoutSpaces": analysis.charactersWithoutSpaces,
            "charactersWithSpaces": analysis.charactersWithSpaces,
            "diagnostics": asdict(analysis.diagnostics),
            "countError": None,
        }


@app.post("/convert/pdf-to-docx")
async def convert_pdf_to_docx(document: UploadFile = File(...), profile: str = Form(...), authorization: str | None = Header(None)):
    _authorize(authorization)
    try:
        parsed_profile = ConversionProfile.model_validate(json.loads(profile))
    except (json.JSONDecodeError, ValidationError) as error:
        raise WorkerError("invalid_profile", "The transformation profile is invalid.", status=400, details={"reason": str(error)}) from error
    data = await _read_pdf(document)
    with tempfile.TemporaryDirectory(prefix="pdf-to-docx-") as directory:
        source = Path(directory, "source.pdf")
        output = Path(directory, "converted.docx")
        source.write_bytes(data)
        mode = _converter_mode()
        if mode == "legacy":
            service = ConversionService()
            report = service.convert(source, output, parsed_profile)
            engine = service.engine
        else:
            try:
                validation = _validate_typed_conversion(source, output)
            except WorkerError:
                raise
            except Exception as error:
                raise WorkerError(
                    "typed_reconstruction_validation_failed",
                    "Typed PDF reconstruction or DOCX validation failed; no artifact was published.",
                    status=422,
                    details={"category": type(error).__name__, "reason": str(error)[:1000]},
                ) from error
            report = {
                "editableCharacters": validation["editableCharacters"],
                "conversionPath": TYPED_CONVERSION_PATH,
                "ocrFallbackUsed": False,
                "pdfClassification": "native_text",
            }
            engine = TYPED_CONVERTER_ENGINE
        # Read before TemporaryDirectory cleanup; Starlette otherwise streams a
        # path that has already been deleted when the response is consumed.
        body = output.read_bytes()
        response = Response(body, media_type=DOCX_MIME)
        safe_name = Path(document.filename or "document").stem.replace('"', "")
        response.headers["Content-Disposition"] = f'attachment; filename="{safe_name}.docx"'
        response.headers["X-Converter-Engine"] = engine
        response.headers["X-OOXML-Validated"] = "true"
        response.headers["X-Normalization-Validated"] = "true"
        response.headers["X-Reading-Order-Validated"] = "true"
        response.headers["X-Editable-Characters"] = str(report["editableCharacters"])
        response.headers["X-Conversion-Path"] = str(report["conversionPath"])
        response.headers["X-OCR-Fallback-Used"] = "true" if report["ocrFallbackUsed"] else "false"
        response.headers["X-PDF-Classification"] = str(report["pdfClassification"])
        return response

