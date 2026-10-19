from __future__ import annotations

import json
from collections import Counter
from dataclasses import asdict

from .core import assert_source_model_integrity, model_text, validate_structural_reading_order
from .contracts import DiagnosticRecord, Node
from .pipeline import ALGORITHM_VERSION

SCHEMA_VERSION = "eu-acquis.reconstruction-model.v1"


def _span_ids(node: Node) -> list[str]:
    values: list[str] = []
    if node.type == "InlineSpan" and node.source:
        values.extend(node.source[0].span_ids)
    for child in node.children:
        values.extend(_span_ids(child))
    return values


def serialize_reconstruction_model(
    document: Node,
    decisions: list[DiagnosticRecord],
    diagnostics: dict[str, object],
    *,
    generation_id: str,
    source_artifact_id: str,
    source_sha256: str,
    config_sha256: str,
) -> tuple[bytes, dict[str, object]]:
    coverage = assert_source_model_integrity(
        document, str(diagnostics["sourceReadingText"]), list(diagnostics["sourceSpanIds"]), list(diagnostics.get("excludedPageFurnitureSpanIds", []))
    )
    if coverage["status"] != "PASS":
        raise ValueError("Source provenance exact-once validation failed.")
    structural = validate_structural_reading_order(document)
    represented = _span_ids(document)
    accounted = represented + list(diagnostics.get("excludedPageFurnitureSpanIds", []))
    if Counter(accounted) != Counter(diagnostics["sourceSpanIds"]):
        raise ValueError("Serialized model provenance differs from extracted source spans.")
    boundary = [item for item in decisions if item.kind == "paragraph-boundary"]
    outcomes = {name: sum(item.outcome.upper() == name for item in boundary)
                for name in ("MERGE", "KEEP_BOUNDARY", "ABSTAIN")}
    tables = [node for node in document.children if node.type == "Table"]
    extraction = diagnostics["extraction"]
    metrics = {
        "pages": extraction["pages"], "blocks": extraction["blocks"],
        "lines": extraction["lines"], "spans": extraction["spans"],
        "normalizedTokens": coverage["tokens"], "nodes": _node_count(document),
        "physicalTables": len(tables),
        "logicalTables": len(tables) - len(diagnostics.get("crossPageTables", [])),
        "rows": sum(len(table.children) for table in tables),
        "cells": sum(len(row.children) for table in tables for row in table.children),
        "merge": outcomes["MERGE"], "keepBoundary": outcomes["KEEP_BOUNDARY"],
        "abstain": outcomes["ABSTAIN"], "diagnostics": len(decisions),
    }
    serialized_document = asdict(document)
    serialized_document.get("attributes", {}).pop("source", None)
    envelope = {
        "schemaVersion": SCHEMA_VERSION,
        "algorithmVersion": ALGORITHM_VERSION,
        "configurationSha256": config_sha256,
        "generationId": generation_id,
        "sourceArtifact": {"artifactId": source_artifact_id, "sha256": source_sha256},
        "validation": {"status": "PASS", "sourceCoverage": coverage,
                       "orderedTokenIntegrity": {"status": "PASS", "tokens": coverage["tokens"]},
                       "structuralReadingOrder": structural},
        "metrics": metrics,
        "document": serialized_document,
        "decisions": [asdict(item) for item in decisions],
        "diagnostics": {
            "unresolved": diagnostics.get("unresolved", []),
            "layoutAnalysis": diagnostics.get("layoutAnalysis", []),
            "excludedPageFurnitureSpanIds": diagnostics.get("excludedPageFurnitureSpanIds", []),
            "excludedPageFurniture": diagnostics.get("excludedPageFurniture", []),
            "crossPageTables": diagnostics.get("crossPageTables", []),
            "paragraphBoundaryDecisions": diagnostics.get("paragraphBoundaryDecisions", {}),
        },
    }
    # UTF-8, sorted object keys and compact separators define byte identity.
    return json.dumps(envelope, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":")).encode("utf-8"), metrics


def _node_count(node: Node) -> int:
    return 1 + sum(_node_count(child) for child in node.children)
