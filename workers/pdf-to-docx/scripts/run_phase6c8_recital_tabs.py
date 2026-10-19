from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.reconstruction.core import (  # noqa: E402
    assert_source_model_integrity,
    assert_text_integrity,
    build_typed_document,
    inspect_docx_structure,
    node_to_dict,
    render_docx_phase2b,
    docx_visible_text,
)

pdf = Path(__file__).parent.parent / "tests" / "fixtures" / "32006L0114.pdf"
out_dir = ROOT / "artifacts" / "pdf-phase6c8"
out_dir.mkdir(parents=True, exist_ok=True)
docx = out_dir / "32006L0114-word-native-footnotes-experimental-v2.docx"
document, decisions, diagnostics = build_typed_document(pdf, "32006L0114")
render_docx_phase2b(document, docx)
integrity = assert_text_integrity(document, docx)
coverage = assert_source_model_integrity(document, diagnostics["sourceReadingText"], diagnostics["sourceSpanIds"], diagnostics["excludedPageFurnitureSpanIds"])
recitals = [node for node in document.children if node.type == "Recital"]
metrics = {
    "status": "PASS",
    "celex": "32006L0114",
    "sourcePdfSha256": hashlib.sha256(pdf.read_bytes()).hexdigest(),
    "experimentalDocxSha256": hashlib.sha256(docx.read_bytes()).hexdigest(),
    "recitals": {"count": len(recitals), "numbers": [node.attributes["recitalNumber"] for node in recitals], "tabbed": all("\t" in node.exact_text for node in recitals)},
    "typedModel": {"nodes": len(document.children), "translationUnits": len([node for node in document.children if node.type != "PageBreak" and node.exact_text]), "tables": len([node for node in document.children if node.type == "Table"]), "footnotes": len(document.attributes.get("footnotes", []))},
    "textIntegrity": integrity,
    "sourceCoverage": coverage,
    "docxStructure": inspect_docx_structure(docx),
    "recitalDecisions": [node_to_dict(decision) for decision in decisions if decision.kind == "recital-binding"],
"formattingRules": {"articleAlignment": "center", "bodyPageBreaks": 0, "annexPageBreakBefore": 2, "footnoteSizePt": 11, "footnoteSpacing": "single/no-extra-spacing", "footnoteLeftIndentCm": 0.3, "footnoteTabStopCm": 0.8, "footnoteHangingIndentCm": 0.5, "footnoteMarkerTab": True},
    "dehyphenation": diagnostics["extraction"].get("dehyphenation", []),
    "dehyphenationAmbiguities": diagnostics["extraction"].get("dehyphenationAmbiguities", []),
    "suspiciousSplitWords": sorted(set(re.findall(r"\b[A-Za-z]{2,}-\s+[a-z][A-Za-z]+\b", docx_visible_text(docx)))),
}
(out_dir / "dehyphenation-validation.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
(out_dir / "recital-tabs-typed-model.json").write_text(json.dumps({"children": [node_to_dict(node) for node in document.children]}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(metrics, ensure_ascii=False, indent=2))
