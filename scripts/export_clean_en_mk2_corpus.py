"""Export the frozen accepted EN->MK2 results from the completed dry run.

This script does not perform alignment or reconciliation. It copies accepted
TU records from the original MK1 TMX files and replaces only the target seg
with the exact frozen MK2 text in final-summary.json.
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
import shutil
import xml.etree.ElementTree as ET
from copy import deepcopy
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DRY = HERE / "output" / "final-mk1-mk2-dry-run"
OUT = HERE / "output" / "final-clean-en-mk2-corpus"
CORPUS = Path(r"D:\Преводи\EU_Acquis_Corpus")
XML_LANG = "{http://www.w3.org/XML/1998/namespace}lang"


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\u00a0", " ")).strip()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prop(parent: ET.Element, name: str, value: str) -> None:
    node = ET.SubElement(parent, "prop", {"type": name})
    node.text = value


def tu_units(root: ET.Element) -> list[tuple[ET.Element, str, str]]:
    out = []
    for tu in root.find("body").findall("tu"):
        values = {}
        for tuv in tu.findall("tuv"):
            seg = tuv.find("seg")
            if seg is not None:
                lang = tuv.get(XML_LANG, "").lower()[:2]
                values[lang] = ("".join(seg.itertext()), tuv)
        if "en" in values and "mk" in values:
            out.append((tu, values["en"][0], values["mk"][0]))
    return out


def accepted_results(audit: dict) -> dict[int, dict]:
    wanted = set(audit["accepted_indices"])
    return {int(row["index"]): row for row in audit["results"] if int(row["index"]) in wanted}


def add_header_props(root: ET.Element, celex: str, source: Path, count: int) -> None:
    header = root.find("header")
    prop(header, "x-CorpusLanguagePair", "en->mk")
    prop(header, "x-CELEX", celex)
    prop(header, "x-SourceTMX", source.name)
    prop(header, "x-SourceTMXSHA256", sha256(source))
    prop(header, "x-Provenance", "accepted clean provenance-safe HIGH TUs from completed final dry run")
    prop(header, "x-AlignmentRun", "frozen final-mk1-mk2-dry-run; no alignment rerun")
    prop(header, "x-AcceptedTUCount", str(count))


def export_document(celex: str, audit: dict, source: Path, destination: Path) -> list[dict]:
    source_root = ET.parse(source).getroot()
    units = tu_units(source_root)
    rows = accepted_results(audit)
    if len(rows) != audit["accepted_clean_tus"]:
        raise ValueError(f"{celex}: accepted index count does not match audit total")
    selected = []
    spans = []
    for index in sorted(rows):
        if index < 1 or index > len(units):
            raise ValueError(f"{celex}: accepted index {index} is outside original TMX")
        tu, original_en, _ = units[index - 1]
        row = rows[index]
        if not norm(original_en) == norm(row["en"]):
            raise ValueError(f"{celex}: original EN integrity mismatch at TU {index}")
        target = row["mk2"]
        evidence = row.get("evidence") or {}
        if evidence.get("provenance_unsafe_footnote"):
            raise ValueError(f"{celex}: unsafe footnote provenance at TU {index}")
        span = row.get("mk2_char_span")
        if span:
            spans.append((int(span[0]), int(span[1]), index))
        if not original_en.strip() or not target.strip():
            raise ValueError(f"{celex}: empty EN/MK2 at TU {index}")
        copied = deepcopy(tu)
        mk_tuv = next((x for x in copied.findall("tuv") if x.get(XML_LANG, "").lower().startswith("mk")), None)
        if mk_tuv is None or mk_tuv.find("seg") is None:
            raise ValueError(f"{celex}: missing MK target at TU {index}")
        seg = mk_tuv.find("seg")
        seg.clear()
        seg.text = target
        prop(copied, "x-CELEX", celex)
        prop(copied, "x-SourceTUIndex", str(index))
        prop(copied, "x-MK2Provenance", "final dry run accepted clean HIGH")
        selected.append((index, copied, original_en, target))
    for previous, current in zip(sorted(spans), sorted(spans)[1:]):
        if current[0] < previous[1]:
            raise ValueError(f"{celex}: overlapping accepted MK2 spans at TUs {previous[2]} and {current[2]}")
    body = source_root.find("body")
    for tu in list(body.findall("tu")):
        body.remove(tu)
    for _, tu, _, _ in selected:
        body.append(tu)
    add_header_props(source_root, celex, source, len(selected))
    destination.parent.mkdir(parents=True, exist_ok=True)
    ET.indent(source_root, space="  ")
    ET.ElementTree(source_root).write(destination, encoding="utf-8", xml_declaration=True)
    parsed = ET.parse(destination).getroot()
    if len(parsed.find("body").findall("tu")) != len(selected):
        raise ValueError(f"{celex}: output TU count failed XML validation")
    return [{"celex": celex, "index": i, "en": en, "mk2": mk2} for i, _, en, mk2 in selected]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    frozen = json.loads((DRY / "final-summary.json").read_text(encoding="utf-8"))
    audits = {a["celex"]: a for a in frozen["audits"]}
    rows = {r["CELEX"]: r for r in csv.DictReader((DRY / "final-summary.csv").open(encoding="utf-8-sig"))}
    all_records = []
    summary = []
    skipped = []
    for celex in sorted(audits):
        accepted = int(rows[celex]["accepted_clean_tus"])
        if accepted == 0:
            skipped.append(celex)
            continue
        candidates = sorted((CORPUS / "Documents" / celex / "TMX_MK1").glob("*.tmx"))
        if len(candidates) != 1:
            raise ValueError(f"{celex}: expected one original TMX, found {len(candidates)}")
        source = candidates[0]
        destination = OUT / "documents" / f"{celex}_clean_EN_MK2.tmx"
        records = export_document(celex, audits[celex], source, destination)
        all_records.extend(records)
        summary.append({
            "CELEX": celex, "source_tmx": str(source), "output_tmx": str(destination),
            "original_tus": int(rows[celex]["original_tus"]), "accepted_tus": len(records),
            "rejected_tus": int(rows[celex]["skipped_tus"]),
            "clean_en_chars": int(rows[celex]["clean_en_chars"]),
            "clean_mk2_chars": int(rows[celex]["clean_mk2_chars"]),
            "source_tmx_sha256": sha256(source),
        })
    combined = ET.Element("tmx", {"version": "1.4"})
    header = ET.SubElement(combined, "header", {"creationtool": "Codex frozen corpus exporter", "datatype": "PlainText", "segtype": "sentence", "adminlang": "en", "srclang": "en"})
    prop(header, "x-CorpusLanguagePair", "en->mk")
    prop(header, "x-Provenance", "accepted clean provenance-safe HIGH TUs from completed final dry run")
    prop(header, "x-AlignmentRun", "frozen final-mk1-mk2-dry-run; no alignment rerun")
    body = ET.SubElement(combined, "body")
    for ordinal, record in enumerate(all_records, 1):
        tu = ET.SubElement(body, "tu", {"tuid": f"{record['celex']}:{record['index']}", "creationid": "final-dry-run"})
        prop(tu, "x-CELEX", record["celex"])
        prop(tu, "x-SourceTUIndex", str(record["index"]))
        prop(tu, "x-MK2Provenance", "final dry run accepted clean HIGH")
        for lang, text in (("en", record["en"]), ("mk", record["mk2"])):
            tuv = ET.SubElement(tu, "tuv", {XML_LANG: lang})
            ET.SubElement(tuv, "seg").text = text
    prop(header, "x-AcceptedTUCount", str(len(all_records)))
    ET.indent(combined, space="  ")
    ET.ElementTree(combined).write(OUT / "combined_clean_EN_MK2.tmx", encoding="utf-8", xml_declaration=True)
    parsed_combined = ET.parse(OUT / "combined_clean_EN_MK2.tmx").getroot()
    combined_tus = parsed_combined.find("body").findall("tu")
    if len(combined_tus) != len(all_records) or len(all_records) != 4029:
        raise ValueError("combined corpus TU total failed reconciliation")
    seen = set()
    for tu in combined_tus:
        key = tu.get("tuid")
        if not key or key in seen:
            raise ValueError("combined corpus contains duplicate or missing TU identifiers")
        seen.add(key)
        values = {tuv.get(XML_LANG): "".join(tuv.find("seg").itertext()) for tuv in tu.findall("tuv") if tuv.find("seg") is not None}
        if not values.get("en", "").strip() or not values.get("mk", "").strip():
            raise ValueError(f"combined corpus contains empty EN/MK2 at {key}")
    with (OUT / "corpus-summary.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(summary[0]))
        writer.writeheader(); writer.writerows(summary)
    totals = {
        "source": "final-summary.csv only", "alignment_rerun": False, "database_changes": False,
        "documents_with_accepted_tus": len(summary), "documents_skipped_zero_accepted": skipped,
        "accepted_tus": len(all_records), "expected_accepted_tus": 4029,
        "clean_en_chars": sum(len(x["en"]) for x in all_records),
        "clean_mk2_chars": sum(len(x["mk2"]) for x in all_records),
        "combined_tmx": str(OUT / "combined_clean_EN_MK2.tmx"),
    }
    (OUT / "aggregate-totals.json").write_text(json.dumps(totals, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(totals, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
