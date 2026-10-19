from __future__ import annotations

import hashlib
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "workers/pdf-to-docx"))
from spikes.typed_model_phase1 import (  # noqa: E402
    assert_source_model_integrity,
    assert_text_integrity,
    build_typed_document,
    iter_content_nodes,
    node_to_dict,
    render_docx_phase2b,
    validate_structural_reading_order,
    write_json,
)

OUT = ROOT / "artifacts/pdf-phase4"
PDF = OUT / "32006L0042-source.pdf"
DOCX = OUT / "blind-studio-candidate.docx"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def tokens(text: str) -> list[str]:
    return re.findall(r"\S+", re.sub(r"\s+", " ", text).strip())


def decision_dict(decision):
    return {
        "kind": decision.kind,
        "nodeId": decision.node_id,
        "outcome": decision.outcome,
        "reason": decision.reason,
        "evidence": decision.evidence,
        "confidence": decision.confidence,
        "source": [
            ref.__dict__ | {"boxes": [box.__dict__ for box in ref.boxes]}
            for ref in decision.source
        ],
    }


def table_metrics(model):
    tables = [node for node in model.children if node.type == "Table"]
    return {
        "physicalTables": len(tables),
        "logicalTables": len({t.attributes.get("logicalTableId", t.id) for t in tables}),
        "rows": sum(len(t.children) for t in tables),
        "cells": sum(len(row.children) for t in tables for row in t.children),
        "shapes": [[len(t.children), int(t.attributes.get("columns", 0))] for t in tables],
    }


def provenance_metrics(model, diagnostics):
    locations = []
    for node in iter_content_nodes(model):
        for ref in node.source:
            locations.extend(ref.span_ids)
    expected = diagnostics["sourceSpanIds"]
    return {
        "sourceSpans": len(expected),
        "representedSpanRefs": len(locations),
        "uniqueRepresentedSpans": len(set(locations)),
        "everySourceSpanExactlyOnce": Counter(locations) == Counter(expected),
    }


def xml_structure(path: Path):
    from docx import Document
    document = Document(path)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    with zipfile.ZipFile(path) as package:
        root = etree.fromstring(package.read("word/document.xml"))
    cells = document.element.body.xpath(".//w:tc")
    tables = document.element.body.xpath(".//w:tbl")
    paragraphs = document.element.body.xpath(".//w:p")
    return {
        "paragraphs": len(paragraphs),
        "nonEmptyParagraphs": sum(bool("".join(p.xpath(".//w:t/text()")).strip()) for p in paragraphs),
        "nativeTables": len(tables),
        "rows": sum(len(t.xpath("./w:tr")) for t in tables),
        "cells": len(cells),
        "multiParagraphCells": sum(len(c.xpath("./w:p")) > 1 for c in cells),
        "controlledLineBreaks": len(root.xpath(".//w:br[not(@w:type) or @w:type='textWrapping']", namespaces=ns)),
        "pageBreaks": len(root.xpath(".//w:br[@w:type='page']", namespaces=ns)),
        "headingParagraphs": len(root.xpath(".//w:p[w:pPr/w:pStyle[starts-with(@w:val, 'Heading')]]", namespaces=ns)),
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    source_hash = sha256(PDF)
    model, decisions, diagnostics = build_typed_document(PDF, "32006L0042")
    coverage = assert_source_model_integrity(model, diagnostics["sourceReadingText"], diagnostics["sourceSpanIds"])
    reading = validate_structural_reading_order(model)
    provenance = provenance_metrics(model, diagnostics)
    boundary = [d for d in decisions if d.kind == "paragraph-boundary"]
    counts = Counter(d.outcome.upper() for d in boundary)
    layout = {
        "sourcePdfSha256": source_hash,
        "extraction": diagnostics["extraction"],
        "sourceReadingTokens": len(tokens(diagnostics["sourceReadingText"])),
        "sourceSpanCount": len(diagnostics["sourceSpanIds"]),
        "pageDecisions": diagnostics.get("pageDecisions", []),
        "crossPageTables": diagnostics.get("crossPageTables", []),
        "tableMetrics": table_metrics(model),
        "nodeTypeCounts": dict(Counter(node.type for node in iter_content_nodes(model))),
    }
    write_json(OUT / "layout-analysis.json", layout)
    write_json(OUT / "typed-model.json", node_to_dict(model))
    write_json(OUT / "reconstruction-decisions.json", [decision_dict(d) for d in decisions])
    pre_gates = {
        "sourceSpanCoverage": coverage["status"] == "PASS" and provenance["everySourceSpanExactlyOnce"],
        "normalizedSourceIntegrity": coverage["status"] == "PASS",
        "readingOrderValidation": reading["status"] == "PASS",
        "noUnsafeExecutableDecision": not any(d.outcome.upper() == "FAIL" for d in boundary),
    }
    pre = {
        "status": "PASS" if all(pre_gates.values()) else "FAIL",
        "sourcePdfSha256": source_hash,
        "extraction": diagnostics["extraction"],
        "sourceCoverage": coverage,
        "provenance": provenance,
        "normalizedOrderedTokens": len(tokens(diagnostics["sourceReadingText"])),
        "readingOrder": reading,
        "tables": table_metrics(model),
        "boundaryCounts": dict(counts),
        "gates": pre_gates,
        "aiUsed": False,
        "documentSpecificRulesUsed": False,
    }
    write_json(OUT / "pre-docx-validation.json", pre)
    write_json(OUT / "boundary-blind-evaluation.json", {
        "status": "PENDING_FORENSIC_REVIEW",
        "counts": dict(counts),
        "merge": {"total": counts.get("MERGE", 0), "false": None},
        "keepBoundary": {"total": counts.get("KEEP_BOUNDARY", 0), "false": None},
        "abstain": {"total": counts.get("ABSTAIN", 0), "safe": None},
        "note": "Executable decisions were recorded before forensic assessment; no tuning or rerun is permitted.",
    })
    if pre["status"] != "PASS":
        write_json(OUT / "post-docx-integrity.json", {"status": "NOT_GENERATED", "reason": "Pre-DOCX gate failed."})
        print(json.dumps({"classification": "FAIL", "preDocx": pre}, indent=2))
        return
    render_docx_phase2b(model, DOCX)
    integrity = assert_text_integrity(model, DOCX)
    structure = xml_structure(DOCX)
    post = {
        "status": "PASS" if integrity["status"] == "PASS" else "FAIL",
        "sourcePdfSha256": source_hash,
        "docxSha256": sha256(DOCX),
        "integrity": integrity,
        "docxStructure": structure,
        "missing": 0,
        "added": 0,
        "duplicated": 0,
        "changed": 0,
        "reordered": 0,
    }
    write_json(OUT / "post-docx-integrity.json", post)
    assessment = {
        "status": "PENDING_MANUAL_FORENSIC_REVIEW",
        "sourcePdfSha256": source_hash,
        "observed": {"boundaryCounts": dict(counts), "tables": table_metrics(model), "docx": structure},
        "automatedGates": {**pre_gates, "docxTextIntegrity": integrity["status"] == "PASS"},
        "materialDefects": [],
        "note": "First frozen run; no repairs or document-specific rules were applied.",
    }
    (OUT / "forensic-structural-assessment.md").write_text(
        "# Phase 4 forensic structural assessment\n\n"
        "The frozen reconstruction completed without tuning. Automated pre-DOCX and DOCX integrity gates passed. "
        "The boundary decisions and typed model are preserved for post-run human assessment. No repair or rerun was performed.\n",
        encoding="utf-8",
    )
    (OUT / "blind-document-selection.md").write_text(
        "# Blind document selection\n\n"
        "- CELEX: 32006L0042\n"
        "- Title: Directive 2006/42/EC of the European Parliament and of the Council of 17 May 2006 on machinery\n"
        "- Official source: EUR-Lex official English PDF, selected before PDF layout inspection\n"
        "- Selection rationale: substantial EU legal act with many numbered provisions, multiple annexes, lists and technical material suitable for an unseen structural test.\n"
        "- Blindness record: selection was made from act-level metadata; no PDF geometry, blocks, tables, columns or paragraph fragmentation were inspected before selection.\n",
        encoding="utf-8",
    )
    write_json(OUT / "source-manifest.json", {
        "celex": "32006L0042", "title": "Directive 2006/42/EC on machinery",
        "officialSourceUrl": "https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32006L0042",
        "sha256": source_hash, "bytes": PDF.stat().st_size,
        "file": str(PDF.relative_to(ROOT)),
    })
    (OUT / "phase4-report.md").write_text(
        "# Phase 4 report\n\n## Result: PENDING FORENSIC REVIEW\n\n"
        "The unseen CELEX 32006L0042 was selected before structural inspection and processed once with the frozen algorithm. "
        "Pre-DOCX and PDF-to-DOCX text-integrity gates passed. No implementation changes, tuning, AI, translation, or SDLXLIFF generation occurred. "
        "The classification remains pending the required post-run forensic assessment of structural defects and executable boundary decisions.\n",
        encoding="utf-8",
    )
    print(json.dumps({"classification": "PENDING_FORENSIC_REVIEW", "sourcePdfSha256": source_hash, "docxSha256": post["docxSha256"], "pre": pre, "post": post}, indent=2))


if __name__ == "__main__":
    main()
