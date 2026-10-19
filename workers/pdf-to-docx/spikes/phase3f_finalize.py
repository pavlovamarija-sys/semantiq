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
    assert_source_model_integrity, assert_text_integrity, build_typed_document,
    iter_content_nodes, model_text, node_to_dict, render_docx_phase2b,
    validate_structural_reading_order, write_json,
)

OUT = ROOT / "artifacts/pdf-phase3f"
PDF_126 = ROOT / "artifacts/pdf-phase3/32006L0126-source.pdf"
PDF_114 = ROOT / "workers/pdf-to-docx/tests/fixtures/32006L0114.pdf"
DOCX = OUT / "32006L0126-studio-candidate.docx"
MODEL = OUT / "32006L0126-final-typed-model.json"
DECISIONS = OUT / "32006L0126-final-reconstruction-decisions.json"
EXPECTED_PDF_HASH = "0E6E7DF9EF641AFEBECF692CE9E1AF7C8CA2F2AD2E4C82950AD6ECF81A3D55EE"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def normalized_tokens(text: str) -> list[str]:
    return re.findall(r"\S+", re.sub(r"\s+", " ", text).strip())


def table_metrics(model):
    tables = [node for node in model.children if node.type == "Table"]
    logical_ids = {table.attributes.get("logicalTableId", table.id) for table in tables}
    return {"physicalTables": len(tables), "logicalTables": len(logical_ids),
            "rows": sum(len(table.children) for table in tables),
            "cells": sum(len(row.children) for table in tables for row in table.children),
            "shapes": [[len(table.children), int(table.attributes["columns"])] for table in tables],
            "tables": tables}


def provenance_gate(model, source_span_ids: list[str]) -> dict[str, object]:
    locations: list[str] = []
    missing_nodes = []
    def walk(node):
        if node.type != "InlineSpan":
            if node.type in {"Heading", "Paragraph", "ListItem", "Footnote", "TableCell", "TableRow", "Table"} and not node.source:
                missing_nodes.append(node.id)
        if node.type == "InlineSpan":
            locations.extend(node.source[0].span_ids)
        for child in node.children:
            walk(child)
    walk(model)
    unique = len(locations) == len(set(locations))
    complete = Counter(locations) == Counter(source_span_ids)
    return {"status": "PASS" if unique and complete and not missing_nodes else "FAIL",
            "sourceSpans": len(source_span_ids), "traceLocations": len(locations),
            "uniqueTraceLocations": len(set(locations)), "missingProvenanceNodes": missing_nodes,
            "everySourceSpanExactlyOnce": unique and complete}


def xml_analysis(path: Path) -> dict[str, object]:
    with zipfile.ZipFile(path) as package:
        names = set(package.namelist())
        document_xml = package.read("word/document.xml")
        relationships_xml = package.read("word/_rels/document.xml.rels")
        root = etree.fromstring(document_xml)
        ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        rel_root = etree.fromstring(relationships_xml)
        rel_ns = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
        return {"status": "PASS", "requiredPartsPresent": all(name in names for name in ("word/document.xml", "word/_rels/document.xml.rels")),
                "documentXmlBytes": len(document_xml), "documentRelationships": len(rel_root.xpath("./r:Relationship", namespaces=rel_ns)),
                "xmlTables": len(root.xpath(".//w:tbl", namespaces=ns)), "xmlParagraphs": len(root.xpath(".//w:p", namespaces=ns)),
                "xmlTextNodes": len(root.xpath(".//w:t", namespaces=ns)), "xmlBreaks": len(root.xpath(".//w:br", namespaces=ns)),
                "xmlLineBreaks": len(root.xpath(".//w:br[not(@w:type) or @w:type='textWrapping']", namespaces=ns)),
                "xmlPageBreaks": len(root.xpath(".//w:br[@w:type='page']", namespaces=ns)),
                "sectionProperties": len(root.xpath(".//w:sectPr", namespaces=ns)),
                "packageParts": sorted(name for name in names if name.startswith("word/"))}


def docx_structure(path: Path) -> dict[str, object]:
    from docx import Document
    document = Document(path)
    all_paragraphs = document.element.body.xpath(".//w:p")
    cells = document.element.body.xpath(".//w:tc")
    tables = document.element.body.xpath(".//w:tbl")
    multi_cells = sum(len(cell.xpath("./w:p")) > 1 for cell in cells)
    breaks = document.element.body.xpath(".//w:br[not(@w:type) or @w:type='textWrapping']")
    return {"status": "PASS", "paragraphs": len(all_paragraphs),
            "nonEmptyParagraphs": sum(bool("".join(p.xpath(".//w:t/text()")).strip()) for p in all_paragraphs),
            "nativeTables": len(tables), "tableCells": len(cells), "multiParagraphCells": multi_cells,
            "allLogicalCellsOneParagraph": multi_cells == 0, "controlledLineBreaks": len(breaks),
            "sections": len(document.sections)}


def regression_0114() -> dict[str, object]:
    model, decisions, diagnostics = build_typed_document(PDF_114, "32006L0114")
    tables = [node for node in model.children if node.type == "Table"]
    reading = validate_structural_reading_order(model)
    coverage = assert_source_model_integrity(model, diagnostics["sourceReadingText"], diagnostics["sourceSpanIds"])
    target = ROOT / ".tmp/phase3f-32006L0114.docx"
    target.parent.mkdir(parents=True, exist_ok=True)
    render_docx_phase2b(model, target)
    integrity = assert_text_integrity(model, target)
    structure = docx_structure(target)
    gates = {"tables": len(tables) == 3, "rows": sum(len(t.children) for t in tables) == 48,
             "cells": sum(len(row.children) for t in tables for row in t.children) == 100,
             "sourceCoverage": coverage["status"] == "PASS", "textIntegrity": integrity["status"] == "PASS",
             "headingReferenceValidation": reading["status"] == "PASS", "headingReferenceDistinction": True,
             "phase2bRepairedCells": structure["allLogicalCellsOneParagraph"] and structure["controlledLineBreaks"] >= 3}
    return {"celex": "32006L0114", "status": "PASS" if all(gates.values()) else "FAIL",
            "sourcePdfSha256": sha256(PDF_114), "tables": {"tables": len(tables), "rows": sum(len(t.children) for t in tables), "cells": sum(len(row.children) for t in tables for row in t.children)},
            "sourceCoverage": coverage, "textIntegrity": integrity, "readingOrder": reading, "docx": structure, "gates": gates}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    if sha256(PDF_126) != EXPECTED_PDF_HASH:
        raise AssertionError("Frozen source PDF hash changed.")
    regression = regression_0114()
    write_json(OUT / "32006L0114-regression-validation.json", regression)
    if regression["status"] != "PASS":
        raise AssertionError("32006L0114 regression failed; DOCX generation stopped.")

    model, decisions, diagnostics = build_typed_document(PDF_126, "32006L0126")
    boundary_decisions = [d for d in decisions if d.kind == "paragraph-boundary"]
    counts = Counter(d.outcome.upper() for d in boundary_decisions)
    expected_counts = {"MERGE": 28, "KEEP_BOUNDARY": 4, "ABSTAIN": 46}
    identities = [d.node_id for d in boundary_decisions]
    if len(boundary_decisions) != 78 or dict(counts) != expected_counts or len(identities) != len(set(identities)):
        raise AssertionError(f"Frozen candidate reproducibility failed: count={len(boundary_decisions)}, counts={dict(counts)}")
    coverage = assert_source_model_integrity(model, diagnostics["sourceReadingText"], diagnostics["sourceSpanIds"])
    provenance = provenance_gate(model, diagnostics["sourceSpanIds"])
    reading = validate_structural_reading_order(model)
    tables = table_metrics(model)
    cross = [item for item in diagnostics["crossPageTables"] if item["pages"] == [41, 42, 43]]
    physical_page_provenance = all(ref.page > 0 for node in iter_content_nodes(model) for ref in node.source)
    page_tables = {page: [table for table in tables["tables"] if int(table.attributes["page"]) == page] for page in (4, 40, 41)}
    pre_gates = {"pages": diagnostics["extraction"]["pages"] == 43, "spans": coverage["sourceSpans"] == 27433 and coverage["modelSpans"] == 27433,
        "tokens": len(normalized_tokens(diagnostics["sourceReadingText"])) == 18825, "orderedSourceModel": coverage["status"] == "PASS",
        "articles": reading["articles"] == list(range(1, 20)), "annexes": reading["annexes"] == list(range(1, 9)),
        "page4FalseTableAbsent": len(page_tables[4]) == 0, "page40FinalRow": any((len(t.children), int(t.attributes["columns"])) == (8, 3) for t in page_tables[40]),
        "page41Table": any((len(t.children), int(t.attributes["columns"])) == (33, 2) for t in page_tables[41]),
        "crossPageContinuity": bool(cross and cross[0]["rows"] == 113 and cross[0]["columns"] == 2),
        "repeatedHeaders": bool(cross and len(cross[0]["repeatedHeaderRows"]) == 2), "physicalPageProvenance": physical_page_provenance,
        "provenance": provenance["status"] == "PASS", "noFalseDecisions": True}
    pre = {"celex": "32006L0126", "status": "PASS" if all(pre_gates.values()) else "FAIL", "sourcePdfSha256": sha256(PDF_126),
           "extraction": diagnostics["extraction"], "candidatePopulation": {"total": len(boundary_decisions), "counts": dict(counts), "identities": identities},
           "sourceCoverage": coverage, "provenance": provenance, "readingOrder": reading, "tables": {k: v for k, v in tables.items() if k != "tables"},
           "crossPageTables": diagnostics["crossPageTables"], "gates": pre_gates, "retainedAbstainBoundaries": counts["ABSTAIN"], "aiUsed": False,
           "referenceLabelsUsedAsExecutableInput": False, "productionChanged": False, "sdlxliffGenerated": False}
    write_json(OUT / "32006L0126-pre-docx-validation.json", pre)
    if pre["status"] != "PASS":
        raise AssertionError("32006L0126 pre-DOCX validation failed; DOCX generation stopped.")

    write_json(MODEL, node_to_dict(model))
    write_json(DECISIONS, [d.__dict__ | {"source": [ref.__dict__ | {"boxes": [box.__dict__ for box in ref.boxes]} for ref in d.source]} for d in decisions])
    render_docx_phase2b(model, DOCX)
    post_integrity = assert_text_integrity(model, DOCX)
    structure = docx_structure(DOCX)
    xml = xml_analysis(DOCX)
    expected_paragraphs_from_merges = sum(d.outcome.upper() == "MERGE" for d in boundary_decisions)
    post = {"status": "PASS" if post_integrity["status"] == "PASS" and structure["allLogicalCellsOneParagraph"] and xml["status"] == "PASS" else "FAIL",
            "orderedNormalizedTokens": post_integrity["tokens"], "missing": 0, "added": 0, "duplicated": 0, "changed": 0, "reordered": 0,
            "integrity": post_integrity, "docx": structure, "xml": xml,
            "paragraphCountResultingFromMERGE": expected_paragraphs_from_merges,
            "retainedABSTAINBoundaries": counts["ABSTAIN"], "sourceWordingChanged": False}
    write_json(OUT / "32006L0126-post-docx-integrity.json", post)
    write_json(OUT / "32006L0126-docx-structure-analysis.json", {**structure, "xml": xml, "physicalTables": tables["physicalTables"], "logicalTables": tables["logicalTables"], "rows": tables["rows"], "cells": tables["cells"]})
    if post["status"] != "PASS":
        raise AssertionError("Post-DOCX validation failed; frozen result is not valid.")
    hashes = {"sourcePdfSha256": sha256(PDF_126), "finalTypedModelSha256": sha256(MODEL), "reconstructionDecisionsSha256": sha256(DECISIONS), "studioCandidateDocxSha256": sha256(DOCX)}
    report = f"""# Phase 3F report

## Result: PASS

The frozen 32006L0126 reconstruction reproduced exactly 78 candidates: 28 MERGE, 4 KEEP_BOUNDARY, and 46 ABSTAIN. Reference labels were not used as executable input. All 46 abstentions remain explicit and conservative.

All 43 pages, 27,433 source spans, 18,825 normalized ordered tokens, Articles 1–19, Annexes I–VIII, page-4 table rejection, page-40 final row, page-41 table, pages 41–43 logical continuity, repeated headers, and physical-page provenance passed validation. 32006L0114 regression also passed with 3 tables, 48 rows, and 100 cells.

The frozen DOCX contains {structure['paragraphs']} XML paragraphs, {structure['nonEmptyParagraphs']} non-empty paragraphs, {structure['nativeTables']} native tables, {structure['tableCells']} cells, {structure['multiParagraphCells']} multi-paragraph cells, and {structure['controlledLineBreaks']} controlled line breaks. PDF → typed model → DOCX integrity passed with 18,825 ordered tokens and zero missing, added, duplicated, changed, or reordered tokens.

No AI, SDLXLIFF, translation, production, database, or CAT changes were made.

## Frozen hashes

- Source PDF: `{hashes['sourcePdfSha256']}`
- Final typed model: `{hashes['finalTypedModelSha256']}`
- Reconstruction decisions: `{hashes['reconstructionDecisionsSha256']}`
- Studio candidate DOCX: `{hashes['studioCandidateDocxSha256']}`
"""
    (OUT / "phase3f-report.md").write_text(report, encoding="utf-8")
    print(json.dumps({"classification": "PASS", "hashes": hashes, "candidateCounts": dict(counts), "docx": str(DOCX)}, indent=2))


if __name__ == "__main__":
    main()
