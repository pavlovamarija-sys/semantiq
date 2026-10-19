from __future__ import annotations

import hashlib
import json
from collections import Counter

from .contracts import Box, Classification, DiagnosticRecord, Node, SourceRef, StyleEvidence
from .core import iter_content_nodes, model_text, validate_structural_reading_order
from .serialization import SCHEMA_VERSION


def _exact(value: object, required: set[str], label: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object.")
    missing, extra = required - value.keys(), value.keys() - required
    if missing or extra:
        raise ValueError(f"{label} fields mismatch; missing={sorted(missing)}, extra={sorted(extra)}")
    return value


def _source(value: object) -> SourceRef:
    item = _exact(value, {"page", "block_index", "line_ids", "span_ids", "boxes", "reading_order_start", "reading_order_end"}, "source provenance")
    boxes = [Box(**_exact(box, {"page", "x0", "y0", "x1", "y1"}, "bounding box")) for box in item["boxes"]]
    ref = SourceRef(int(item["page"]), int(item["block_index"]), list(item["line_ids"]), list(item["span_ids"]), boxes,
                    int(item["reading_order_start"]), int(item["reading_order_end"]))
    if ref.page < 1 or ref.reading_order_start < 0 or ref.reading_order_end < ref.reading_order_start:
        raise ValueError("Source provenance contains an invalid page or reading-order range.")
    if any(not isinstance(value, str) or not value for value in ref.line_ids + ref.span_ids):
        raise ValueError("Source provenance identifiers must be non-empty strings.")
    return ref


def _node(value: object) -> Node:
    item = _exact(value, {"id", "type", "exact_text", "source", "style", "classification", "children", "attributes"}, "typed node")
    style = _exact(item["style"], {"font_families", "font_sizes", "bold", "italic", "alignment", "indentation"}, "style evidence")
    classification = _exact(item["classification"], {"method", "confidence", "evidence"}, "classification")
    if classification["method"] != "deterministic" or not 0 <= float(classification["confidence"]) <= 1:
        raise ValueError("Node classification is invalid.")
    return Node(str(item["id"]), str(item["type"]), str(item["exact_text"]), [_source(v) for v in item["source"]],
                StyleEvidence(list(style["font_families"]), [float(v) for v in style["font_sizes"]], bool(style["bold"]),
                              bool(style["italic"]), style["alignment"], float(style["indentation"])),
                Classification("deterministic", float(classification["confidence"]), list(classification["evidence"])),
                [_node(child) for child in item["children"]], dict(item["attributes"]))


def deserialize_reconstruction_model(data: bytes, *, generation_id: str, model_artifact_id: str,
                                     model_sha256: str, source_artifact_id: str, source_sha256: str) -> tuple[Node, dict[str, object]]:
    if hashlib.sha256(data).hexdigest() != model_sha256:
        raise ValueError("RECONSTRUCTION_MODEL bytes do not match the registered SHA-256.")
    try:
        envelope = json.loads(data)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("RECONSTRUCTION_MODEL is not valid UTF-8 JSON.") from error
    required = {"schemaVersion", "algorithmVersion", "configurationSha256", "generationId", "sourceArtifact",
                "validation", "metrics", "document", "decisions", "diagnostics"}
    envelope = _exact(envelope, required, "reconstruction model envelope")
    if envelope["schemaVersion"] != SCHEMA_VERSION:
        raise ValueError("RECONSTRUCTION_MODEL schema version is unsupported.")
    if envelope["generationId"] != generation_id:
        raise ValueError("RECONSTRUCTION_MODEL generation identity is incorrect.")
    source = _exact(envelope["sourceArtifact"], {"artifactId", "sha256"}, "source artifact identity")
    if source != {"artifactId": source_artifact_id, "sha256": source_sha256}:
        raise ValueError("RECONSTRUCTION_MODEL source lineage identity is incorrect.")
    validation = envelope["validation"]
    if not isinstance(validation, dict) or validation.get("status") != "PASS":
        raise ValueError("RECONSTRUCTION_MODEL is not completely validated.")
    document = _node(envelope["document"])
    decisions = [DiagnosticRecord.from_mapping(value) for value in envelope["decisions"]]
    span_ids: list[str] = []
    for node in _walk(document):
        if node.type == "InlineSpan":
            if len(node.source) != 1 or len(node.source[0].span_ids) != 1:
                raise ValueError("InlineSpan provenance must identify exactly one source span.")
            span_ids.extend(node.source[0].span_ids)
    coverage = validation.get("sourceCoverage", {})
    metrics = envelope["metrics"]
    expected_spans = int(metrics.get("spans", -1))
    excluded_span_ids = envelope.get("diagnostics", {}).get("excludedPageFurnitureSpanIds", [])
    if not isinstance(excluded_span_ids, list) or any(not isinstance(value, str) for value in excluded_span_ids):
        raise ValueError("RECONSTRUCTION_MODEL excluded page-furniture provenance is invalid.")
    accounted_span_ids = span_ids + excluded_span_ids
    if len(accounted_span_ids) != expected_spans or len(accounted_span_ids) != len(set(accounted_span_ids)) or Counter(accounted_span_ids).most_common(1)[0][1] != 1:
        raise ValueError("RECONSTRUCTION_MODEL source spans are incomplete or duplicated.")
    if coverage.get("sourceSpans") != expected_spans or coverage.get("modelSpans") != len(span_ids) or coverage.get("excludedSpans") != len(excluded_span_ids):
        raise ValueError("RECONSTRUCTION_MODEL source coverage declaration is inconsistent.")
    for node in iter_content_nodes(document):
        if node.children and "".join(node.exact_text.split()) != "".join("".join(child.exact_text for child in node.children).split()):
            raise ValueError(f"Inline provenance text differs from parent node {node.id}.")
    tokens = len(model_text(document).split())
    if tokens != int(metrics.get("normalizedTokens", -1)) or validation.get("orderedTokenIntegrity", {}).get("tokens") != tokens:
        raise ValueError("RECONSTRUCTION_MODEL normalized token declaration is inconsistent.")
    validate_structural_reading_order(document)
    return document, {"metrics": metrics, "decisions": len(decisions), "modelArtifactId": model_artifact_id,
                      "sourceArtifactId": source_artifact_id, "normalizedTokens": tokens}


def _walk(node: Node):
    yield node
    for child in node.children:
        yield from _walk(child)
