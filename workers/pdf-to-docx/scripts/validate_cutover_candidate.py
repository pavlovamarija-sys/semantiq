from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter
from dataclasses import asdict
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "workers/pdf-to-docx"))

from app.reconstruction.core import (  # noqa: E402
    assert_source_model_integrity,
    assert_text_integrity,
    inspect_docx_structure,
    iter_content_nodes,
    node_to_dict,
    render_docx_phase2b,
)
from app.reconstruction.pipeline import reconstruct_pdf  # noqa: E402


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    pdf = ROOT / "artifacts/pdf-cutover-validation/32025D2586-source.pdf"
    output = ROOT / "artifacts/pdf-cutover-validation/32025D2586-validation"
    output.mkdir(parents=True, exist_ok=True)
    docx = output / "32025D2586-typed-reconstruction.docx"

    model, decisions, diagnostics = reconstruct_pdf(pdf, document_key="32025D2586")
    render_docx_phase2b(model, docx)
    coverage = assert_source_model_integrity(
        model,
        diagnostics["sourceReadingText"],
        diagnostics["sourceSpanIds"],
        diagnostics.get("excludedPageFurnitureSpanIds", []),
    )
    integrity = assert_text_integrity(model, docx)
    def walk(node):
        yield node
        for child in node.children:
            yield from walk(child)

    nodes = list(walk(model))
    tables = [node for node in nodes if node.type == "Table"]
    headings = [node for node in nodes if node.type == "Heading"]
    footnotes = [node for node in nodes if node.type in {"Footnote", "FootnoteBody"}]
    page_breaks = [node for node in nodes if node.type == "PageBreak"]
    report = {
        "celex": "32025D2586",
        "sourcePdfSha256": sha256(pdf),
        "sourcePdfBytes": pdf.stat().st_size,
        "sourcePages": pymupdf.open(pdf).page_count,
        "sourceSpans": len(diagnostics["sourceSpanIds"]),
        "excludedPageFurnitureSpans": len(diagnostics.get("excludedPageFurnitureSpanIds", [])),
        "normalizedSourceTokens": len(re.findall(r"\S+", re.sub(r"\s+", " ", diagnostics["sourceReadingText"]).strip())),
        "coverage": coverage,
        "docxTextIntegrity": integrity,
        "docxSha256": sha256(docx),
        "docxBytes": docx.stat().st_size,
        "docxStructure": inspect_docx_structure(docx),
        "model": {
            "nodes": len(nodes),
            "headings": len(headings),
            "headingTexts": [node.exact_text for node in headings],
            "footnotes": len(footnotes),
            "pageBreaks": len(page_breaks),
            "physicalTables": len(tables),
            "logicalTables": len({node.attributes.get("logicalTableId", node.id) for node in tables}),
            "rows": sum(len(table.children) for table in tables),
            "cells": sum(len(row.children) for table in tables for row in table.children),
            "tables": [
                {
                    "id": table.id,
                    "logicalTableId": table.attributes.get("logicalTableId"),
                    "pages": sorted({p.page for p in table.source}),
                    "rows": len(table.children),
                    "columnsPerRow": [len(row.children) for row in table.children],
                    "continuedFrom": table.attributes.get("continuedFrom"),
                    "continuedTo": table.attributes.get("continuedTo"),
                }
                for table in tables
            ],
        },
        "decisionCounts": dict(Counter(f"{d.kind}:{d.outcome}" for d in decisions)),
    }
    (output / "32025D2586-typed-model.json").write_text(
        json.dumps(node_to_dict(model), ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (output / "32025D2586-reconstruction-decisions.json").write_text(
        json.dumps([asdict(d) for d in decisions], ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (output / "32025D2586-validation.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
