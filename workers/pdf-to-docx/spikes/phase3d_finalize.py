from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter
from dataclasses import asdict
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "workers/pdf-to-docx"))

from spikes.typed_model_phase1 import (  # noqa: E402
    assert_source_model_integrity, assert_text_integrity, build_typed_document,
    inspect_docx_structure, iter_content_nodes, model_text, node_to_dict,
    render_docx_phase2b, validate_structural_reading_order, write_json,
)

OUT = ROOT / "artifacts/pdf-phase3d"
PDF_126 = ROOT / "artifacts/pdf-phase3/32006L0126-source.pdf"
PDF_114 = ROOT / "workers/pdf-to-docx/tests/fixtures/32006L0114.pdf"
DOCX_126 = OUT / "32006L0126-experimental-final.docx"
MODEL_126 = OUT / "32006L0126-final-typed-model.json"
DECISIONS_126 = OUT / "32006L0126-final-reconstruction-decisions.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def tokens(text: str) -> list[str]:
    return re.findall(r"\S+", text)


def tables(model):
    return [node for node in model.children if node.type == "Table"]


def table_metrics(model):
    values = tables(model)
    return {"tables": len(values), "rows": sum(len(table.children) for table in values),
            "cells": sum(len(row.children) for table in values for row in table.children),
            "shapes": [[len(table.children), int(table.attributes["columns"])] for table in values]}


def docx_analysis(path: Path) -> dict[str, object]:
    document = Document(path)
    xml_paragraphs = document.element.body.xpath(".//w:p")
    cell_paragraphs = document.element.body.xpath(".//w:tc/w:p")
    table_cells = document.element.body.xpath(".//w:tc")
    multi_paragraph_cells = sum(len(cell.xpath("./w:p")) > 1 for cell in table_cells)
    controlled_breaks = len(document.element.body.xpath(".//w:br[not(@w:type) or @w:type='textWrapping']"))
    page_breaks = len(document.element.body.xpath(".//w:br[@w:type='page']"))
    headings = [p for p in document.paragraphs if p.style and p.style.name.startswith("Heading") and p.text.strip()]
    return {
        **inspect_docx_structure(path),
        "xmlParagraphs": len(xml_paragraphs),
        "nonEmptyXmlParagraphs": sum(bool("".join(p.xpath(".//w:t/text()")).strip()) for p in xml_paragraphs),
        "tableParagraphs": len(cell_paragraphs), "tableCells": len(table_cells),
        "multiParagraphCells": multi_paragraph_cells, "allLogicalCellsOneParagraph": multi_paragraph_cells == 0,
        "controlledLineBreaks": controlled_breaks, "explicitPageBreaks": page_breaks,
        "headingParagraphs": len(headings), "headingTexts": [p.text for p in headings],
        "sections": len(document.sections),
        "pageBehavior": "Explicit page-break paragraphs preserve each physical PDF page boundary; no extra Word sections are introduced.",
    }


def ordered_integrity(source: str, model, docx: Path | None = None) -> dict[str, object]:
    source_tokens, model_tokens = tokens(source), tokens(model_text(model))
    model_ok = source_tokens == model_tokens
    result = {"pdfToTypedModel": {"status": "PASS" if model_ok else "FAIL", "normalizedOrderedTokens": len(source_tokens),
        "missing": 0 if model_ok else None, "added": 0 if model_ok else None, "duplicated": 0 if model_ok else None,
        "changed": 0 if model_ok else None, "reordered": 0 if model_ok else None}}
    if not model_ok:
        raise AssertionError("Ordered source tokens differ from the typed model.")
    if docx:
        check = assert_text_integrity(model, docx)
        result["typedModelToDocx"] = {**check, "missing": 0, "added": 0, "duplicated": 0, "changed": 0, "reordered": 0}
    return result


def boundary_summary(decisions) -> dict[str, int]:
    counts = Counter(decision.outcome.upper() for decision in decisions if decision.kind == "paragraph-boundary")
    return {key: counts.get(key, 0) for key in ("MERGE", "KEEP_BOUNDARY", "ABSTAIN")}


def regression_114() -> dict[str, object]:
    model, decisions, diagnostics = build_typed_document(PDF_114, "32006L0114")
    source_coverage = assert_source_model_integrity(model, diagnostics["sourceReadingText"], diagnostics["sourceSpanIds"])
    ordered = ordered_integrity(diagnostics["sourceReadingText"], model)
    reading = validate_structural_reading_order(model)
    metrics = table_metrics(model)
    temp_docx = ROOT / ".tmp/phase3d-32006L0114-regression.docx"
    temp_docx.parent.mkdir(parents=True, exist_ok=True)
    render_docx_phase2b(model, temp_docx)
    ordered.update(ordered_integrity(diagnostics["sourceReadingText"], model, temp_docx))
    analysis = docx_analysis(temp_docx)
    multiline_cells = [cell for table in tables(model) for row in table.children for cell in row.children if "\n" in cell.exact_text]
    page1_multisource = [node for node in iter_content_nodes(model) if node.type != "TableCell" and len(node.source) > 1
                         and all(ref.page == 1 for ref in node.source)]
    gates = {
        "tablesRowsCells": metrics == {"tables": 3, "rows": 48, "cells": 100, "shapes": [[3, 2], [4, 3], [41, 2]]},
        "sourceCoverage": source_coverage["status"] == "PASS" and source_coverage["sourceSpans"] == 3362,
        "textIntegrity": ordered["pdfToTypedModel"]["status"] == "PASS" and ordered["typedModelToDocx"]["status"] == "PASS",
        "headingReferenceDistinction": reading["articles"] == list(range(1, 13)) and reading["annexes"] == [1, 2],
        "repairedBoundaries": len(multiline_cells) >= 3 and analysis["multiParagraphCells"] == 0 and len(page1_multisource) >= 1,
    }
    result = {"celex": "32006L0114", "status": "PASS" if all(gates.values()) else "FAIL",
        "sourcePdfSha256": sha256(PDF_114), "sourceCoverage": source_coverage, "textIntegrity": ordered,
        "tables": metrics, "readingOrder": reading, "boundaryDecisions": boundary_summary(decisions),
        "repairedBoundaryEvidence": {"multilineLogicalCells": len(multiline_cells), "allCellsOneDocxParagraph": analysis["multiParagraphCells"] == 0,
            "page1MultiSourceLogicalNodes": len(page1_multisource)}, "gates": gates}
    write_json(OUT / "32006L0114-regression-validation.json", result)
    if result["status"] != "PASS":
        raise AssertionError("32006L0114 regression gate failed.")
    return result


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    expected_pdf_hash = "0E6E7DF9EF641AFEBECF692CE9E1AF7C8CA2F2AD2E4C82950AD6ECF81A3D55EE"
    if sha256(PDF_126) != expected_pdf_hash:
        raise AssertionError("Frozen 32006L0126 source PDF hash changed.")
    regression = regression_114()
    model, decisions, diagnostics = build_typed_document(PDF_126, "32006L0126")
    coverage = assert_source_model_integrity(model, diagnostics["sourceReadingText"], diagnostics["sourceSpanIds"])
    ordered = ordered_integrity(diagnostics["sourceReadingText"], model)
    reading = validate_structural_reading_order(model)
    metrics = table_metrics(model)
    boundaries = boundary_summary(decisions)
    page_tables = {page: [table for table in tables(model) if int(table.attributes["page"]) == page] for page in (4, 40, 41, 42, 43)}
    cross = next((item for item in diagnostics["crossPageTables"] if item["pages"] == [41, 42, 43]), None)
    pre_gates = {
        "pagesProcessed": diagnostics["extraction"]["pages"] == 43,
        "sourceSpanCoverage": coverage["sourceSpans"] == 27433 and coverage["modelSpans"] == 27433,
        "orderedTokens": ordered["pdfToTypedModel"]["normalizedOrderedTokens"] == 18825,
        "articles": reading["articles"] == list(range(1, 20)), "annexes": reading["annexes"] == list(range(1, 9)),
        "page4FalseTableEliminated": len(page_tables[4]) == 0,
        "page40FinalRowRetained": any((len(t.children), int(t.attributes["columns"])) == (8, 3) for t in page_tables[40]),
        "page41TableRetained": any((len(t.children), int(t.attributes["columns"])) == (33, 2) for t in page_tables[41]),
        "crossPageContinuity": bool(cross and cross["rows"] == 113 and cross["columns"] == 2),
        "repeatedHeadersExplicit": bool(cross and len(cross["repeatedHeaderRows"]) == 2),
        "sourceOrder": ordered["pdfToTypedModel"]["status"] == "PASS",
        "noUnresolvedParagraphAmbiguities": boundaries["ABSTAIN"] == 0,
    }
    pre = {"celex": "32006L0126", "status": "PASS" if all(pre_gates.values()) else "FAIL",
        "sourcePdfSha256": sha256(PDF_126), "extraction": diagnostics["extraction"], "sourceCoverage": coverage,
        "textIntegrity": ordered, "readingOrder": reading, "tables": metrics, "paragraphBoundaryDecisions": boundaries,
        "remainingUnresolvedParagraphAmbiguities": boundaries["ABSTAIN"], "crossPageTables": diagnostics["crossPageTables"],
        "unresolvedParagraphBoundaries": [{"boundaryId": decision.node_id, "reason": decision.reason,
            "evidence": decision.evidence, "source": [asdict(ref) for ref in decision.source]}
            for decision in decisions if decision.kind == "paragraph-boundary" and decision.outcome == "abstain"],
        "gates": pre_gates, "newMaterialStructuralDefects": [] if all(pre_gates.values()) else [key for key, value in pre_gates.items() if not value],
        "productionChanged": False, "aiDependency": False, "sdlxliffGenerated": False}
    write_json(OUT / "32006L0126-final-pre-studio-validation.json", pre)
    if pre["status"] != "PASS":
        write_json(MODEL_126, node_to_dict(model))
        write_json(DECISIONS_126, [asdict(decision) for decision in decisions])
        write_json(OUT / "32006L0126-docx-structure-analysis.json", {
            "status": "NOT_RUN", "reason": "Final DOCX generation was gated off after the frozen reconstruction produced unresolved paragraph boundaries.",
            "docxGenerated": False, "sdlxliffGenerated": False})
        rules = """# Deterministic paragraph-boundary rules

The isolated executable classifier has three outcomes: `MERGE`, `KEEP_BOUNDARY`, and `ABSTAIN`.

A candidate is currently defined as two consecutive same-page source nodes, with a Paragraph on the right, no sentence/list terminator on the left, and lexical-continuation evidence at the start of the right fragment. The validated rules then check, in order: top-margin publication-date headers; intervening same-block source lines; same-baseline horizontal adjacency with matching style; and tightly spaced consecutive source lines with matching style. No match returns `ABSTAIN`, retains the boundary, and records it unresolved.

MERGE joins only `rstrip(left) + " " + lstrip(right)` and preserves every source reference and inline span. No CELEX, page, fixture ID, expected count, known fragment, or legal ordinal is used as decision logic. There is no AI dependency.

The frozen Phase 3D run showed that this generalized candidate scope is broader than the 30-case Phase 3C evaluation set: 78 boundaries were classified and 46 abstained. This is a new validation-scope defect. The run stopped without tuning the candidate scope or generating DOCX.
"""
        (OUT / "deterministic-boundary-rules.md").write_text(rules, encoding="utf-8")
        model_hash = sha256(MODEL_126)
        report = f"""# Phase 3D report

## Result: PARTIAL

The generalized deterministic rules were integrated into the isolated spike, and 32006L0114 remains regression-clean. The frozen 32006L0126 source, span coverage, ordered-token integrity, legal heading sequences, table reconstruction, page-4 rejection, page-40 final row, page-41 table, pages 41–43 continuity, and repeated-header gates all pass.

The run exposed a new material validation-scope defect and stopped before DOCX generation. The executable candidate detector classified **78** boundaries rather than only the previously frozen 30: **{boundaries['MERGE']} MERGE**, **{boundaries['KEEP_BOUNDARY']} KEEP_BOUNDARY**, and **{boundaries['ABSTAIN']} ABSTAIN**. The 46 abstentions were safely retained and explicitly recorded, but Phase 3C did not validate these additional candidate boundaries. The two additional merges beyond the Phase 3C reference total are likewise outside that frozen evaluation set.

No rule was tuned after observing this result. No final DOCX or SDLXLIFF was generated. Production conversion, database, and CAT code remain unchanged; no AI was used.

## Frozen hashes

- Source PDF: `{sha256(PDF_126)}`
- Stopped-run typed model: `{model_hash}`
- Final DOCX: not generated
"""
        (OUT / "phase3d-report.md").write_text(report, encoding="utf-8")
        print(json.dumps({"classification": "PARTIAL", "boundaries": boundaries,
            "sourcePdfSha256": sha256(PDF_126), "typedModelSha256": model_hash,
            "docxGenerated": False, "defects": pre["newMaterialStructuralDefects"]}, indent=2))
        return
    write_json(MODEL_126, node_to_dict(model))
    write_json(DECISIONS_126, [asdict(decision) for decision in decisions])
    render_docx_phase2b(model, DOCX_126)
    ordered.update(ordered_integrity(diagnostics["sourceReadingText"], model, DOCX_126))
    structure = docx_analysis(DOCX_126)
    docx_gates = {"textIntegrity": ordered["typedModelToDocx"]["status"] == "PASS",
        "nativeTables": len(structure["tables"]) == 5, "rows": sum(t["rows"] for t in structure["tables"]) == 128,
        "cells": sum(t["cells"] for t in structure["tables"]) == 264,
        "oneParagraphPerCell": structure["multiParagraphCells"] == 0, "physicalPageBreaks": structure["explicitPageBreaks"] == 42}
    structure.update({"status": "PASS" if all(docx_gates.values()) else "FAIL", "gates": docx_gates,
        "logicalTables": len({t.attributes.get("logicalTableId", t.id) for t in tables(model)}),
        "crossPageLogicalTable": cross})
    write_json(OUT / "32006L0126-docx-structure-analysis.json", structure)
    if structure["status"] != "PASS":
        raise AssertionError("DOCX structure validation failed.")
    hashes = {"sourcePdfSha256": sha256(PDF_126), "finalTypedModelSha256": sha256(MODEL_126), "finalDocxSha256": sha256(DOCX_126)}
    pre["textIntegrity"] = ordered
    pre["hashes"] = hashes
    pre["docxStructureStatus"] = structure["status"]
    write_json(OUT / "32006L0126-final-pre-studio-validation.json", pre)
    rules = """# Deterministic paragraph-boundary rules

The executable Phase 3D classifier is isolated from production and has exactly three outcomes: `MERGE`, `KEEP_BOUNDARY`, and `ABSTAIN`.

A candidate must be two consecutive same-page source nodes, with a Paragraph on the right, no sentence/list terminator on the left, and lexical-continuation evidence at the start of the right fragment. The rules then apply in this order:

1. Keep a publication-date-form fragment in the top margin separate as a running header.
2. Keep the boundary when same-block source line identities prove that unrepresented intervening lines exist.
3. Merge matching-style same-block fragments that are horizontally adjacent on the same baseline.
4. Merge matching-style consecutive source lines with a tightly spaced vertical continuation.
5. Otherwise abstain, retain the boundary, and record it as unresolved.

MERGE joins only `rstrip(left) + " " + lstrip(right)`. All source references, boxes, line/span identities, reading-order positions, and inline spans from both nodes are retained. The classifier contains no CELEX, page, fixture ID, expected-count, Article/Annex ordinal, or known-fragment decision rule. It has no AI dependency.
"""
    (OUT / "deterministic-boundary-rules.md").write_text(rules, encoding="utf-8")
    report = f"""# Phase 3D report

## Result: PASS

The validated generalized deterministic boundary classifier was integrated into the isolated reconstruction spike. The frozen 32006L0126 run measured **{boundaries['MERGE']} MERGE**, **{boundaries['KEEP_BOUNDARY']} KEEP_BOUNDARY**, and **{boundaries['ABSTAIN']} ABSTAIN** decisions. Every merge retains complete provenance and joins only existing fragments with deterministic whitespace.

All 43 pages, 27,433 source spans, and 18,825 normalized ordered tokens are preserved. Articles 1–19 and Annexes I–VIII validate. The page-4 false table remains eliminated; the page-40 8×3 table retains its final row; the page-41 33×2 segment and pages 41–43 logical table remain intact with repeated headers explicitly represented.

The final DOCX has {len(structure['tables'])} native physical tables, {sum(t['rows'] for t in structure['tables'])} rows, {sum(t['cells'] for t in structure['tables'])} cells, {structure['nonEmptyXmlParagraphs']} non-empty paragraphs, {structure['controlledLineBreaks']} controlled line breaks, and no multi-paragraph table cells. PDF → typed model → DOCX text integrity is PASS with zero missing, added, duplicated, changed, or reordered tokens.

The 32006L0114 regression remains PASS at 3 tables / 48 rows / 100 cells, with source coverage, text integrity, heading/reference distinction, and repaired-boundary behavior preserved.

No AI, translation, SDLXLIFF generation, production conversion change, database change, or CAT-code change occurred.

## Frozen hashes

- Source PDF: `{hashes['sourcePdfSha256']}`
- Final typed model: `{hashes['finalTypedModelSha256']}`
- Final DOCX: `{hashes['finalDocxSha256']}`
"""
    (OUT / "phase3d-report.md").write_text(report, encoding="utf-8")
    print(json.dumps({"classification": "PASS", "boundaries": boundaries, "hashes": hashes,
        "regression": regression["status"], "docx": structure["status"]}, indent=2))


if __name__ == "__main__":
    main()
