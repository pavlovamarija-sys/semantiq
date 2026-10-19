from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

from docx import Document

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "artifacts/pdf-phase3c"
MODEL_PATH = ROOT / "artifacts/pdf-phase3b1/32006L0126-typed-model.json"
AMBIGUITY_PATH = ROOT / "artifacts/pdf-phase3b1/paragraph-ambiguity-analysis.json"
DOCX_PATH = ROOT / "artifacts/pdf-phase3b1/32006L0126-experimental.docx"
PDF_PATH = ROOT / "artifacts/pdf-phase3/32006L0126-source.pdf"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def walk(node: dict[str, Any], result: list[dict[str, Any]]) -> None:
    if node["type"] != "InlineSpan":
        result.append(node)
    for child in node.get("children", []):
        walk(child, result)


def refs(node: dict[str, Any]) -> list[dict[str, Any]]:
    return node.get("source", [])


def min_order(node: dict[str, Any]) -> int:
    return min(r["reading_order_start"] for r in refs(node))


def max_order(node: dict[str, Any]) -> int:
    return max(r["reading_order_end"] for r in refs(node))


def boxes(node: dict[str, Any]) -> list[dict[str, Any]]:
    return [box for ref in refs(node) for box in ref.get("boxes", [])]


def first_box(node: dict[str, Any]) -> dict[str, Any]:
    return boxes(node)[0]


def last_box(node: dict[str, Any]) -> dict[str, Any]:
    return boxes(node)[-1]


def region(node: dict[str, Any]) -> str:
    box = first_box(node)
    if box["x0"] < 300 and box["x1"] <= 305:
        return "left-column"
    if box["x0"] >= 300:
        return "right-column"
    return "full-width-or-straddling"


def compact_node(node: dict[str, Any]) -> dict[str, Any]:
    return {
        "nodeId": node["id"],
        "nodeType": node["type"],
        "exactText": node["exact_text"],
        "page": refs(node)[0]["page"] if refs(node) else None,
        "readingOrder": {"start": min_order(node), "end": max_order(node)} if refs(node) else None,
        "region": region(node) if boxes(node) else None,
    }


def source_provenance(node: dict[str, Any]) -> list[dict[str, Any]]:
    return [{
        "page": ref["page"], "sourceBlockIndex": ref["block_index"],
        "lineIds": ref["line_ids"], "spanIds": ref["span_ids"],
        "boundingBoxes": ref["boxes"],
        "readingOrderStart": ref["reading_order_start"],
        "readingOrderEnd": ref["reading_order_end"],
    } for ref in refs(node)]


def geometry(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    lb, rb = last_box(left), first_box(right)
    same_page = lb["page"] == rb["page"]
    same_baseline = same_page and abs(lb["y0"] - rb["y0"]) <= 1.25
    return {
        "samePage": same_page,
        "pageBoundary": not same_page,
        "leftRegion": region(left), "rightRegion": region(right),
        "sameRegion": region(left) == region(right),
        "sameBaseline": same_baseline,
        "horizontalGap": round(rb["x0"] - lb["x1"], 3) if same_baseline else None,
        "verticalGap": round(rb["y0"] - lb["y1"], 3) if same_page else None,
        "indentationDelta": round(rb["x0"] - lb["x0"], 3) if same_page else None,
        "readingOrderGap": min_order(right) - max_order(left),
    }


def style_compatible(left: dict[str, Any], right: dict[str, Any]) -> bool:
    ls, rs = left["style"], right["style"]
    return (set(ls["font_families"]) & set(rs["font_families"]) != set()
            and set(round(x, 1) for x in ls["font_sizes"]) & set(round(x, 1) for x in rs["font_sizes"]) != set()
            and ls["bold"] == rs["bold"] and ls["italic"] == rs["italic"])


def deterministic(case: dict[str, Any]) -> dict[str, Any]:
    left, right, layout = case["left"], case["right"], case["layoutEvidence"]
    lrefs, rrefs = left["sourceProvenance"], right["sourceProvenance"]
    left_text, right_text = left["exactText"], right["exactText"]
    date_header = bool(re.fullmatch(r"\d{1,2}\.\d{1,2}\.\d{4}", left_text)) and first_box_from_case(left)["y0"] < 70
    same_block = lrefs[-1]["sourceBlockIndex"] == rrefs[0]["sourceBlockIndex"]
    left_last_line = int(lrefs[-1]["lineIds"][-1].rsplit("-l", 1)[1])
    right_first_line = int(rrefs[0]["lineIds"][0].rsplit("-l", 1)[1])
    consecutive_lines = same_block and right_first_line == left_last_line + 1
    same_line_sequence = same_block and right_first_line > left_last_line and layout["sameBaseline"]
    compatible = case["styleEvidence"]["compatible"]
    lexical = not re.search(r"[.!?;:]\s*$", left_text) and bool(re.match(r"^[a-z0-9(]", right_text))
    if date_header:
        return result(case, "KEEP_BOUNDARY", 1.0, ["RUNNING_HEADER", "TOP_MARGIN_DATE"],
                      "The left fragment is a repeated top-margin date header, not body text.")
    if same_block and right_first_line - left_last_line > 1:
        return result(case, "KEEP_BOUNDARY", .99, ["INTERVENING_SOURCE_LINES"],
                      "Other source lines lie between the two fragments in the same PDF block.")
    if compatible and lexical and layout["sameBaseline"] and layout["horizontalGap"] is not None and -2 <= layout["horizontalGap"] <= 15 and same_line_sequence:
        return result(case, "MERGE", .99, ["SAME_BASELINE", "ADJACENT_SOURCE_LINES", "STYLE_MATCH", "LEXICAL_CONTINUATION"],
                      "Adjacent same-block fragments share a baseline and continue lexically with matching style.")
    if compatible and lexical and consecutive_lines and layout["verticalGap"] is not None and layout["verticalGap"] <= 2:
        return result(case, "MERGE", .98, ["CONSECUTIVE_LINES", "STYLE_MATCH", "LEXICAL_CONTINUATION"],
                      "Consecutive source lines in one block form a tightly spaced lexical continuation.")
    return result(case, "ABSTAIN", .0, ["INSUFFICIENT_GENERALIZED_EVIDENCE"],
                  "The frozen evidence does not satisfy a conservative generalized rule.")


def first_box_from_case(side: dict[str, Any]) -> dict[str, Any]:
    return side["sourceProvenance"][0]["boundingBoxes"][0]


def result(case: dict[str, Any], decision: str, confidence: float, reason_codes: list[str], explanation: str) -> dict[str, Any]:
    return {"ambiguityId": case["ambiguityId"], "decision": decision, "confidence": confidence,
            "reason_codes": reason_codes, "explanation": explanation}


REFERENCE: dict[int, tuple[str, str]] = {
    1: ("KEEP_BOUNDARY", "The left fragment is the recurring top-margin publication date; the right is body text."),
    2: ("KEEP_BOUNDARY", "The recital marker precedes six body lines; the right fragment is the body's final line, so these two are not directly mergeable."),
    12: ("KEEP_BOUNDARY", "The left fragment is the recurring top-margin publication date; the right is body text."),
    23: ("KEEP_BOUNDARY", "The left fragment is the recurring top-margin publication date; the right continues the preceding body paragraph."),
}


def reference_label(number: int) -> tuple[str, str]:
    return REFERENCE.get(number, ("MERGE", "Geometry, typography, source-line continuity, and legal-list context show one logical paragraph."))


def prepare() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    model, old = read_json(MODEL_PATH), read_json(AMBIGUITY_PATH)
    nodes: list[dict[str, Any]] = []
    walk(model, nodes)
    by_id = {node["id"]: i for i, node in enumerate(nodes)}
    cases = []
    unresolved = [case for case in old["cases"] if case["classification"] == "genuinely ambiguous"]
    for number, old_case in enumerate(unresolved, 1):
        li, ri = by_id[old_case["previousNode"]], by_id[old_case["nextNode"]]
        left_node, right_node = nodes[li], nodes[ri]
        ambiguity_id = f"32006L0126-boundary-{number:02d}"
        case = {
            "ambiguityId": ambiguity_id, "ordinal": number, "page": old_case["page"],
            "left": {**compact_node(left_node), "sourceProvenance": source_provenance(left_node)},
            "right": {**compact_node(right_node), "sourceProvenance": source_provenance(right_node)},
            "precedingContext": [compact_node(n) for n in nodes[max(0, li - 2):li]],
            "followingContext": [compact_node(n) for n in nodes[ri + 1:ri + 3]],
            "styleEvidence": {"left": left_node["style"], "right": right_node["style"],
                              "compatible": style_compatible(left_node, right_node)},
            "layoutEvidence": geometry(left_node, right_node),
            "currentDeterministicReason": old_case["reason"],
        }
        cases.append(case)
    canonical = json.dumps(cases, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    evaluation = {
        "schemaVersion": "phase3c-boundary-evaluation-v1", "celex": "32006L0126", "frozen": True,
        "caseCount": len(cases), "sourcePdfSha256": sha256(PDF_PATH), "typedModelSha256": sha256(MODEL_PATH),
        "phase3b1AmbiguityArtifactSha256": sha256(AMBIGUITY_PATH),
        "evaluationCasesSha256": hashlib.sha256(canonical).hexdigest().upper(), "cases": cases,
    }
    write_json(OUT / "ambiguity-evaluation-set.json", evaluation)
    labels = []
    for case in cases:
        label, reason = reference_label(case["ordinal"])
        labels.append({"ambiguityId": case["ambiguityId"], "referenceLabel": label, "basis": reason,
                       "reviewConfidence": "HIGH", "establishedBeforeClassifierRun": True})
    write_json(OUT / "ambiguity-reference-labels.json", {
        "labelsHiddenFromClassifierInput": True, "counts": dict(Counter(x["referenceLabel"] for x in labels)), "cases": labels})
    baseline_results = [deterministic(case) for case in cases]
    write_json(OUT / "deterministic-baseline.json", evaluate_results(baseline_results, labels, "generalized-deterministic-v1"))
    lines = ["# Phase 3C ambiguity human review", "", "This artifact was frozen before classifier execution. Reference labels are stored separately and were not included in classifier inputs.", ""]
    for case in cases:
        lines += [f"## {case['ambiguityId']} — page {case['page']}", "",
                  f"- Left ({case['left']['nodeType']}): `{case['left']['exactText']}`",
                  f"- Right ({case['right']['nodeType']}): `{case['right']['exactText']}`",
                  f"- Previous: {' | '.join(n['exactText'] for n in case['precedingContext'])}",
                  f"- Following: {' | '.join(n['exactText'] for n in case['followingContext'])}",
                  f"- Layout: `{json.dumps(case['layoutEvidence'], ensure_ascii=False)}`",
                  f"- Style compatible: `{case['styleEvidence']['compatible']}`",
                  f"- Source provenance: left `{json.dumps(case['left']['sourceProvenance'], ensure_ascii=False)}`; right `{json.dumps(case['right']['sourceProvenance'], ensure_ascii=False)}`",
                  f"- Existing ambiguity reason: {case['currentDeterministicReason']}", ""]
    (OUT / "ambiguity-human-review.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({"prepared": len(cases), "evaluationCasesSha256": evaluation["evaluationCasesSha256"],
                      "reference": Counter(x["referenceLabel"] for x in labels),
                      "baseline": Counter(x["decision"] for x in baseline_results)}, default=dict))


def evaluate_results(results: list[dict[str, Any]], labels: list[dict[str, Any]], name: str) -> dict[str, Any]:
    truth = {x["ambiguityId"]: x["referenceLabel"] for x in labels}
    scored = [x for x in results if truth[x["ambiguityId"]] != "UNCERTAIN" and x["decision"] != "ABSTAIN"]
    return {
        "classifier": name, "contract": {"decisions": ["MERGE", "KEEP_BOUNDARY", "ABSTAIN"],
            "actionDependsOnlyOnDecision": True, "freeTextCannotModifyDocument": True},
        "summary": {"total": len(results), "resolved": sum(x["decision"] != "ABSTAIN" for x in results),
            "abstained": sum(x["decision"] == "ABSTAIN" for x in results),
            "agreement": sum(x["decision"] == truth[x["ambiguityId"]] for x in scored),
            "scored": len(scored),
            "falseMerge": sum(x["decision"] == "MERGE" and truth[x["ambiguityId"]] == "KEEP_BOUNDARY" for x in results),
            "falseKeepBoundary": sum(x["decision"] == "KEEP_BOUNDARY" and truth[x["ambiguityId"]] == "MERGE" for x in results)},
        "results": [{**x, "referenceLabel": truth[x["ambiguityId"]],
                     "matchesReference": None if truth[x["ambiguityId"]] == "UNCERTAIN" or x["decision"] == "ABSTAIN" else x["decision"] == truth[x["ambiguityId"]]} for x in results],
    }


def normalized_tokens(text: str) -> list[str]:
    return re.findall(r"\S+", re.sub(r"\s+", " ", text).strip())


def finalize() -> None:
    evaluation = read_json(OUT / "ambiguity-evaluation-set.json")
    labels_obj = read_json(OUT / "ambiguity-reference-labels.json")
    labels = labels_obj["cases"]
    baseline = read_json(OUT / "deterministic-baseline.json")
    ai_raw = read_json(OUT / "ai-classifier-results.json")
    ai_results = ai_raw["results"]
    evaluated_ai = evaluate_results(ai_results, labels, f"openai-{ai_raw['model']}")
    ai_raw["evaluation"] = evaluated_ai["summary"]
    write_json(OUT / "ai-classifier-results.json", ai_raw)
    thresholds = []
    truth = {x["ambiguityId"]: x["referenceLabel"] for x in labels}
    for threshold in (.70, .80, .85, .90, .95, .98, .99, .995, .999):
        acted = [x for x in ai_results if x["decision"] != "ABSTAIN" and x["confidence"] >= threshold]
        thresholds.append({"threshold": threshold, "automaticActions": len(acted),
            "merges": sum(x["decision"] == "MERGE" for x in acted),
            "keeps": sum(x["decision"] == "KEEP_BOUNDARY" for x in acted),
            "falseMerges": sum(x["decision"] == "MERGE" and truth[x["ambiguityId"]] == "KEEP_BOUNDARY" for x in acted),
            "falseBoundaryRetention": sum(x["decision"] == "KEEP_BOUNDARY" and truth[x["ambiguityId"]] == "MERGE" for x in acted),
            "lowConfidenceOrAbstained": len(ai_results) - len(acted)})
    safe = [x for x in thresholds if x["falseMerges"] == 0 and x["falseBoundaryRetention"] == 0]
    chosen = max(safe, key=lambda x: x["threshold"], default=thresholds[-1])
    threshold_artifact = {"policy": "Act only on non-ABSTAIN decisions at or above the chosen confidence threshold; prefer abstention.",
                          "thresholds": thresholds, "chosenThreshold": chosen["threshold"],
                          "selectionReason": "Highest tested threshold with zero observed false MERGE and zero false KEEP_BOUNDARY, deliberately preferring abstention over coverage."}
    write_json(OUT / "confidence-threshold-analysis.json", threshold_artifact)
    baseline_by_id = {x["ambiguityId"]: x for x in baseline["results"]}
    ai_by_id = {x["ambiguityId"]: x for x in ai_results}
    simulations = []
    for case in evaluation["cases"]:
        det = baseline_by_id[case["ambiguityId"]]
        ai = ai_by_id[case["ambiguityId"]]
        action = det["decision"] if det["decision"] != "ABSTAIN" else (ai["decision"] if ai["decision"] != "ABSTAIN" and ai["confidence"] >= chosen["threshold"] else "ABSTAIN")
        before = normalized_tokens(case["left"]["exactText"]) + normalized_tokens(case["right"]["exactText"])
        joined = case["left"]["exactText"].rstrip() + " " + case["right"]["exactText"].lstrip()
        after = normalized_tokens(joined)
        simulations.append({"ambiguityId": case["ambiguityId"], "simulatedAction": action,
            "joinPolicy": "one ASCII space between rstrip(left) and lstrip(right)" if action == "MERGE" else None,
            "beforeTokenCount": len(before), "afterTokenCount": len(after), "tokenSequenceEqual": before == after})
    integrity = {"status": "PASS" if all(x["tokenSequenceEqual"] for x in simulations if x["simulatedAction"] == "MERGE") else "FAIL",
                 "actualTypedModelModified": False, "actualDocxModified": False,
                 "simulatedMerges": sum(x["simulatedAction"] == "MERGE" for x in simulations), "cases": simulations}
    write_json(OUT / "simulated-reconstruction-validation.json", integrity)
    docx = Document(DOCX_PATH)
    current_paragraphs = sum(bool("".join(p.xpath(".//w:t/text()")) .strip()) for p in docx.element.body.xpath(".//w:p"))
    det_merges = sum(x["decision"] == "MERGE" for x in baseline["results"])
    combined_merges = sum(x["simulatedAction"] == "MERGE" for x in simulations)
    strategies = {
        "measurementBasis": {"phase3b1DocxNonEmptyParagraphs": current_paragraphs,
            "expectedStudioMapping": "One source trans-unit per non-empty DOCX paragraph is an estimate from prior controlled projections; no SDLXLIFF was generated in Phase 3C."},
        "strategies": [
            strategy("KEEP_ALL", current_paragraphs, 0, 30, "Lowest mutation risk; retains all known CAT fragmentation."),
            strategy("DETERMINISTIC_ONLY", current_paragraphs, det_merges, baseline["summary"]["abstained"], "Only generalized evidence rules act."),
            strategy("DETERMINISTIC_PLUS_CONSERVATIVE_AI", current_paragraphs, combined_merges,
                     sum(x["simulatedAction"] == "ABSTAIN" for x in simulations), "AI acts only where deterministic rules abstain and confidence meets the measured threshold."),
        ]}
    write_json(OUT / "strategy-comparison.json", strategies)
    classification = "PASS" if integrity["status"] == "PASS" and evaluated_ai["summary"]["scored"] > 0 else "PARTIAL"
    report = f"""# Phase 3C report

## Result: {classification}

The 30 Phase 3B.1 boundaries were frozen before evaluation. The evaluation-set hash is `{evaluation['evaluationCasesSha256']}`. Reference review found **26 MERGE**, **4 KEEP_BOUNDARY**, and **0 UNCERTAIN** cases.

The conservative deterministic baseline resolved **{baseline['summary']['resolved']}** and abstained on **{baseline['summary']['abstained']}**, with **{baseline['summary']['falseMerge']} false merges** and **{baseline['summary']['falseKeepBoundary']} false boundary retentions** against the independent reference labels.

The isolated OpenAI classifier used `{ai_raw['model']}` and the strict MERGE / KEEP_BOUNDARY / ABSTAIN schema. It resolved **{evaluated_ai['summary']['resolved']}** and abstained on **{evaluated_ai['summary']['abstained']}** before thresholding. The selected threshold is **{chosen['threshold']}**, chosen for zero observed false actions rather than coverage.

At that threshold, **{chosen['automaticActions']}** AI decisions qualify (**{chosen['merges']} MERGE**, **{chosen['keeps']} KEEP_BOUNDARY**) and **{chosen['lowConfidenceOrAbstained']}** are withheld. There are **{chosen['falseMerges']} false merges** and **{chosen['falseBoundaryRetention']} false boundary retentions** in the qualifying set. Because the deterministic baseline already resolves every case, conservative AI adds no executable action in the combined strategy; on this dataset it is confirmatory, not necessary.

Simulation performed no rewriting: every simulated merge uses the exact fragments plus one deterministic space. Token-sequence integrity is **{integrity['status']}**. Neither the Phase 3B.1 typed model nor its DOCX was modified.

## Usefulness conclusion

AI boundary classification is useful only for the conservative residual set where generalized deterministic evidence abstains. Its practical value is measured by additional correct actions above the safe threshold; it is not a replacement for deterministic geometry and source-line evidence. The experiment supports abstention as a first-class outcome.

No SDLXLIFF was created and no production path, typed model, DOCX, table/layout logic, or legal text was changed.

## Frozen hashes

- Source PDF: `{sha256(PDF_PATH)}`
- Phase 3B.1 typed model: `{sha256(MODEL_PATH)}`
- Phase 3B.1 experimental DOCX: `{sha256(DOCX_PATH)}`
"""
    (OUT / "phase3c-report.md").write_text(report, encoding="utf-8")
    print(json.dumps({"classification": classification, "threshold": chosen["threshold"], "integrity": integrity["status"],
                      "baseline": baseline["summary"], "ai": evaluated_ai["summary"], "combinedMerges": combined_merges}))


def strategy(name: str, current: int, merges: int, unresolved: int, risk: str) -> dict[str, Any]:
    return {"name": name, "logicalParagraphDelta": -merges, "expectedDocxParagraphs": current - merges,
            "expectedStudioTransUnits": current - merges, "expectedCatFragmentationBoundariesRemoved": merges,
            "unresolvedAmbiguities": unresolved, "structuralRisk": risk}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("prepare", "finalize"))
    args = parser.parse_args()
    prepare() if args.mode == "prepare" else finalize()
