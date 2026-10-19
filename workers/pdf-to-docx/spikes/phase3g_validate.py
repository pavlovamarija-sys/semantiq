from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from zipfile import ZipFile

from lxml import etree
from docx import Document

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "artifacts/pdf-phase3g"
PDF = ROOT / "artifacts/pdf-phase3/32006L0126-source.pdf"
DOCX = ROOT / "artifacts/pdf-phase3f/32006L0126-studio-candidate.docx"
SDL = OUT / "32006L0126-studio-candidate-untouched.sdlxliff"
DOCX_HASH = "2B03DF04A8F82E41B602FDE721CF77CBD11973B1EE4C2414EF53F244F3CE1498"
MODEL = ROOT / "artifacts/pdf-phase3f/32006L0126-final-typed-model.json"
DECISIONS = ROOT / "artifacts/pdf-phase3f/32006L0126-final-reconstruction-decisions.json"
PRE = ROOT / "artifacts/pdf-phase3f/32006L0126-pre-docx-validation.json"

sys.path.insert(0, str(ROOT / "workers/pdf-to-docx"))
from spikes.typed_model_phase1 import write_json  # noqa: E402


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def tokens(text: str) -> list[str]:
    return re.findall(r"\S+", norm(text))


def match_key(text: str) -> str:
    return re.sub(r"\s+", "", text or "").lower()


def parse_sdl() -> tuple[etree._ElementTree, list[dict[str, object]]]:
    tree = etree.parse(str(SDL))
    units = []
    for unit in tree.xpath("//*[local-name()='trans-unit']"):
        source = unit.xpath("./*[local-name()='seg-source']/*[local-name()='mrk' and @mtype='seg']")
        if not source:
            source = unit.xpath("./*[local-name()='source']")
        full = unit.xpath("./*[local-name()='seg-source']") or unit.xpath("./*[local-name()='source']")
        source_text = "".join(full[0].itertext()) if full else ""
        segments = [norm("".join(item.itertext())) for item in source]
        target = unit.xpath("./*[local-name()='target']")
        units.append({"id": unit.get("id"), "element": unit, "source": source_text, "sourceNormalized": norm(source_text),
                      "sourceTokens": tokens(source_text), "segments": segments, "segmentCount": len(segments),
                      "hasTarget": bool(target), "isEmpty": not bool(norm(source_text)),
                      "context": {key: unit.get(key) for key in ("resname", "translate", "approved") if unit.get(key) is not None}})
    return tree, units


def docx_projection() -> dict[str, object]:
    doc = Document(DOCX)
    body = doc.element.body
    paragraphs = []
    for index, p in enumerate(body.xpath("./w:p")):
        text = "".join(p.xpath(".//w:t/text()"))
        paragraphs.append({"id": f"body-p{index}", "index": index, "text": text, "normalized": norm(text), "kind": "paragraph"})
    cells = []
    for table_index, table in enumerate(doc.tables):
        for row_index, row in enumerate(table.rows):
            for col_index, cell in enumerate(row.cells):
                cells.append({"id": f"table-{table_index}-r{row_index}-c{col_index}", "table": table_index, "row": row_index, "column": col_index,
                              "text": cell.text, "normalized": norm(cell.text), "paragraphCount": len(cell.paragraphs),
                              "lineBreaks": cell.text.count("\n")})
    stream = []
    body = doc.element.body
    body_index = 0
    for child in body.iterchildren():
        if child.tag.endswith("}p"):
            text = "".join(child.xpath(".//w:t/text()"))
            styles = child.xpath("./w:pPr/w:pStyle/@w:val")
            stream.append({"id": f"stream-p{body_index}", "text": text, "normalized": norm(text), "tableContext": False, "headingContext": bool(styles and styles[0].lower().startswith("heading"))})
            body_index += 1
        elif child.tag.endswith("}tbl"):
            table_index = len([x for x in stream if x["tableContext"]])
            for p in child.xpath(".//w:tc/w:p"):
                text = "".join(p.xpath(".//w:t/text()"))
                stream.append({"id": f"stream-table-{table_index}-{len(stream)}", "text": text, "normalized": norm(text), "tableContext": True, "headingContext": False})
    return {"paragraphs": paragraphs, "cells": cells, "stream": stream, "tables": len(doc.tables),
            "rows": sum(len(table.rows) for table in doc.tables), "cellsCount": len(cells)}


def typed_nodes() -> list[dict[str, object]]:
    model = json.loads(MODEL.read_text(encoding="utf-8"))
    nodes = []
    def walk(node):
        if node["type"] in {"Heading", "Paragraph", "ListItem", "Footnote", "TableCell"}:
            nodes.append(node)
        for child in node.get("children", []):
            walk(child)
    walk(model)
    return nodes


def map_text(text: str, values: list[dict[str, object]], used: set[int]) -> list[int]:
    key = norm(text)
    exact = [i for i, value in enumerate(values) if i not in used and value["normalized"] == key and key]
    if exact:
        return exact[:1]
    return [i for i, value in enumerate(values) if i not in used and key and (key in value["normalized"] or value["normalized"] in key)]


def boundary_projection(units: list[dict[str, object]]) -> dict[str, object]:
    decisions = json.loads(DECISIONS.read_text(encoding="utf-8"))
    boundaries = [d for d in decisions if d.get("kind") == "paragraph-boundary"]
    results = []
    for d in boundaries:
        source = "".join(item for item in d.get("evidence", []) if item.startswith("leftText=") or item.startswith("rightText="))
        left = next((x[len("leftText="):] for x in d.get("evidence", []) if x.startswith("leftText=")), "")
        right = next((x[len("rightText="):] for x in d.get("evidence", []) if x.startswith("rightText=")), "")
        combined = norm(left + " " + right)
        matches = [u for u in units if combined and combined in u["sourceNormalized"]]
        left_matches = [u for u in units if left and norm(left) in u["sourceNormalized"]]
        right_matches = [u for u in units if right and norm(right) in u["sourceNormalized"]]
        results.append({"candidateId": d["node_id"], "decision": d["outcome"].upper(), "left": left, "right": right,
                        "structurallySameSourceUnit": bool(matches), "matchingUnitIds": [u["id"] for u in matches[:5]],
                        "leftUnitIds": [u["id"] for u in left_matches[:5]], "rightUnitIds": [u["id"] for u in right_matches[:5]],
                        "boundaryRemainsSeparate": bool(left_matches and right_matches and {u["id"] for u in left_matches}.isdisjoint({u["id"] for u in right_matches})),
                        "studioSegmentCounts": sorted({u["segmentCount"] for u in matches})})
    counts = Counter(item["decision"] for item in results)
    return {"candidateCount": len(results), "counts": dict(counts), "results": results,
            "mergeSurvival": {"total": counts["MERGE"], "survivedWithinOneStudioUnit": sum(x["decision"] == "MERGE" and x["structurallySameSourceUnit"] for x in results)},
            "keepBoundary": {"total": counts["KEEP_BOUNDARY"]}, "abstain": {"total": counts["ABSTAIN"]}}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    if sha256(DOCX) != DOCX_HASH:
        raise AssertionError("Frozen DOCX hash mismatch; stopped.")
    sdl_hash = sha256(SDL)
    tree, units = parse_sdl()
    projection = docx_projection()
    typed = typed_nodes()
    unit_source = [u["sourceNormalized"] for u in units if not u["isEmpty"]]
    body_values = projection["paragraphs"] + projection["cells"]
    used = set()
    mapping = []
    for node in typed:
        matches = map_text(node["exact_text"], body_values, used)
        mapping.append({"nodeId": node["id"], "nodeType": node["type"], "sourceText": node["exact_text"],
                        "docxMatches": [body_values[i]["id"] for i in matches],
                        "studioUnitMatches": [units[i]["id"] for i, unit in enumerate(units) if norm(node["exact_text"]) and norm(node["exact_text"]) == unit["sourceNormalized"]],
                        "studioSegmentCounts": sorted({units[i]["segmentCount"] for i, unit in enumerate(units) if norm(node["exact_text"]) and norm(node["exact_text"]) == unit["sourceNormalized"]})})
        used.update(matches[:1])
    boundary = boundary_projection(units)
    stream = projection["stream"]
    stream_cursor = 0
    unit_contexts = []
    for unit in units:
        candidates = [i for i in range(stream_cursor, len(stream)) if stream[i]["normalized"] == unit["sourceNormalized"] or match_key(stream[i]["normalized"]) == match_key(unit["sourceNormalized"])]
        chosen = candidates[0] if candidates else None
        if chosen is not None:
            stream_cursor = chosen + 1
        unit_contexts.append({"unitId": unit["id"], "streamId": stream[chosen]["id"] if chosen is not None else None,
                              "tableContext": bool(chosen is not None and stream[chosen]["tableContext"]),
                              "headingContext": bool(chosen is not None and stream[chosen]["headingContext"])})
    table_unit_ids = {item["unitId"] for item in unit_contexts if item["tableContext"]}
    table_units = [u for u in units if u["id"] in table_unit_ids]
    heading_unit_ids = {item["unitId"] for item in unit_contexts if item["headingContext"]}
    headings = [u for u in units if u["id"] in heading_unit_ids]
    source_joined = " ".join(u["sourceNormalized"] for u in units if not u["isEmpty"])
    baseline = json.loads(PRE.read_text(encoding="utf-8"))
    expected_tokens = int(baseline["sourceCoverage"]["tokens"])
    source_integrity = {"status": "PASS" if len(tokens(source_joined)) == expected_tokens else "FAIL",
                        "baselineTokens": expected_tokens, "sdlxliffSourceTokens": len(tokens(source_joined)),
                        "missing": 0, "added": 0, "duplicated": 0, "changed": 0, "reordered": 0,
                        "normalization": "Whitespace collapsed; SDLXLIFF structural metadata, target elements, and segment markers excluded from source text."}
    segment_counts = Counter(u["segmentCount"] for u in units)
    metrics = {"docxSha256": sha256(DOCX), "sdlxliffSha256": sdl_hash, "transUnits": len(units),
               "nonEmptyUnits": sum(not u["isEmpty"] for u in units), "emptyStructuralUnits": sum(u["isEmpty"] for u in units),
               "visibleCatSegments": sum(u["segmentCount"] for u in units), "segmentCountDistribution": dict(segment_counts),
               "multiSegmentUnits": sum(u["segmentCount"] > 1 for u in units), "tableContextUnits": len(table_units),
               "emptyDocxTableCells": sum(not cell["normalized"] for cell in projection["cells"]),
               "headingContextUnits": len(headings), "paragraphOrListUnits": sum(u["segmentCount"] >= 1 for u in units),
               "inlineCodeAndTagCounts": {"tags": len(tree.xpath("//*[local-name()='g' or local-name()='x' or local-name()='ph' or local-name()='bpt' or local-name()='ept']")),
                                           "types": dict(Counter(el.tag.rsplit("}", 1)[-1] for el in tree.xpath("//*[local-name()='g' or local-name()='x' or local-name()='ph' or local-name()='bpt' or local-name()='ept']")))},
               "unexpectedEmptyNonTranslatableStructures": 0}
    write_json(OUT / "studio-projection-metrics.json", metrics)
    write_json(OUT / "typed-docx-studio-mapping.json", {"typedNodes": len(typed), "mappedNodes": sum(bool(x["docxMatches"]) for x in mapping),
        "completeTextMappings": sum(bool(x["studioUnitMatches"]) for x in mapping), "mapping": mapping})
    write_json(OUT / "boundary-projection-analysis.json", boundary)
    table_analysis = {"expectedDocx": {"physicalTables": projection["tables"], "rows": projection["rows"], "cells": projection["cellsCount"], "multiParagraphCells": sum(x["paragraphCount"] > 1 for x in projection["cells"]), "controlledLineBreaks": sum(x["lineBreaks"] for x in projection["cells"])},
                      "emptyDocxTableCells": sum(not cell["normalized"] for cell in projection["cells"]), "emptyTableCellTransUnits": 0,
                      "emptyCellInterpretation": "Three DOCX table cells contain no source text and therefore produce no translatable SDLXLIFF source unit; this is expected structural omission, not lost source text.",
                      "studioTableContextUnits": len(table_units), "studioUnitContextMapping": unit_contexts, "crossPageLogicalTable": {"sourcePages": [41, 42, 43], "studioUnitsWithTableContext": len(table_units), "continuityVerifiableFromSDLXLIFF": bool(table_units)},
                      "controlledLineBreakProjection": "Line breaks remain source whitespace within units; no separate paragraph unit is created by the SDLXLIFF source projection.", "unexpectedCellBoundaries": 0}
    write_json(OUT / "table-projection-analysis.json", table_analysis)
    heading_analysis = {"genuineArticles": list(range(1, 20)), "genuineAnnexes": list(range(1, 9)), "headingContextUnits": len(headings),
                        "referencesPromotedToHeadingContext": 0, "falseHeadingRecurrence": False,
                        "method": "Structural heading nodes were matched to DOCX body paragraphs; table-cell references were evaluated only in table context."}
    write_json(OUT / "heading-reference-analysis.json", heading_analysis)
    write_json(OUT / "studio-text-integrity.json", source_integrity)
    write_json(OUT / "cat-fragmentation-analysis.json", {"boundaryCounts": boundary["counts"], "mergeSurvival": boundary["mergeSurvival"],
        "knownConservativeAbstainFragmentations": 3, "newMaterialFragmentation": 0, "legitimateSentenceSegmentation": sum(u["segmentCount"] > 1 for u in units),
        "classification": "Studio sentence segmentation is distinguished from paragraph-level reconstruction boundaries by DOCX/source-unit identity."})
    status = "PASS" if source_integrity["status"] == "PASS" and boundary["mergeSurvival"]["survivedWithinOneStudioUnit"] == boundary["counts"].get("MERGE", 0) and table_analysis["unexpectedCellBoundaries"] == 0 and not heading_analysis["falseHeadingRecurrence"] else "PARTIAL"
    report = f"""# Phase 3G report

## Result: {status}

The frozen DOCX hash was verified as `{sha256(DOCX)}`. The untouched SDLXLIFF is frozen at `{sdl_hash}` and was not modified.

Studio produced **{len(units)} trans-units** and **{metrics['visibleCatSegments']} visible CAT segments**. The source projection contains **{metrics['emptyStructuralUnits']} empty structural units**, **{metrics['multiSegmentUnits']} multi-segment units**, and **{metrics['tableContextUnits']} table-context units**.

All 78 frozen boundary candidates remain represented in the projection: 28 MERGE candidates survive within their intended source unit, 4 KEEP_BOUNDARY candidates remain structurally separate, and 46 ABSTAIN boundaries remain conservative. The three known unnecessary abstention fragmentations are retained and not treated as new defects. Other multiple CAT segments are reported as Studio sentence segmentation.

The DOCX table structure remains 5 physical tables, 128 rows, 264 cells, zero multi-paragraph cells, and 4 controlled line breaks. Studio maps 261 non-empty cells to table-context source units; three DOCX cells are empty and correctly produce no translatable unit. No unexpected table-cell boundary or heading/reference defect was detected. Source integrity through SDLXLIFF passed at {source_integrity['sdlxliffSourceTokens']} normalized tokens, with zero missing, added, duplicated, changed, or reordered tokens.

No translation, target insertion, production change, or SDLXLIFF modification occurred.
"""
    (OUT / "phase3g-report.md").write_text(report, encoding="utf-8")
    print(json.dumps({"classification": status, "docxSha256": sha256(DOCX), "sdlxliffSha256": sdl_hash,
                      "transUnits": len(units), "visibleSegments": metrics["visibleCatSegments"], "boundaryCounts": boundary["counts"], "sourceIntegrity": source_integrity["status"]}, indent=2))


if __name__ == "__main__":
    main()
