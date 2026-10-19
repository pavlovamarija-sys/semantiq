import hashlib
import json
import re
from pathlib import Path
from lxml import etree

SDL = Path("artifacts/pdf-phase6c6/studio-input/validated-docx-corrected.sdlxliff")
CANONICAL = Path("artifacts/pdf-phase6c6/canonical-tus.json")
OUTPUT = Path("artifacts/pdf-phase6c6/guarded-snapshot-alignment.json")
NS = {
    "x": "urn:oasis:names:tc:xliff:document:1.2",
    "sdl": "http://sdl.com/FileTypes/SdlXliff/1.0",
}

def normalized(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"(?<=\w)-\s+", "", text or "")).strip()

raw = SDL.read_bytes()
tree = etree.fromstring(raw)
file_element = tree.find("x:file", NS)
canonical = json.loads(CANONICAL.read_text(encoding="utf-8"))
units = tree.xpath("//x:trans-unit", namespaces=NS)
studio_tags = {
    tag.get("id"): {
        "name": (tag.find("sdl:ph", NS).get("name") if tag.find("sdl:ph", NS) is not None else None),
        "segmentationHint": (tag.find("sdl:ph", NS).get("seg-hint") if tag.find("sdl:ph", NS) is not None else None),
        "definition": "".join(tag.itertext()),
    }
    for tag in tree.xpath("//sdl:tag", namespaces=NS)
}
studio = []
for index, unit in enumerate(units):
    source = unit.find("x:source", NS)
    segmented = unit.find("x:seg-source", NS)
    target = unit.find("x:target", NS)
    source_text = "".join(source.itertext()) if source is not None else ""
    segmented_text = "".join(segmented.itertext()) if segmented is not None else ""
    target_text = "".join(target.itertext()) if target is not None else ""
    segments = segmented.xpath('.//x:mrk[@mtype="seg"]', namespaces=NS) if segmented is not None else []
    group = unit.getparent()
    contexts = group.xpath("./sdl:cxts/*", namespaces=NS) if group is not None else []
    studio.append({
        "index": index,
        "transUnitId": unit.get("id"),
        "sourceText": source_text,
        "segmentedText": segmented_text,
        "targetText": target_text,
        "normalizedSource": normalized(source_text),
        "segmentCount": len(segments),
        "sourceElementCount": len(source) if source is not None else 0,
        "segSourceElementCount": len(segmented) if segmented is not None else 0,
        "inlineCodeCount": len(source.xpath(".//*", namespaces=NS)) if source is not None else 0,
        "context": [{"tag": etree.QName(item).localname, "id": item.get("id")} for item in contexts],
        "rawXml": etree.tostring(unit, encoding="unicode"),
    })

matches = []
used = set()
cursor = 0
for canonical_unit in canonical:
    wanted = normalized(canonical_unit["source_text"])
    candidates = [index for index in range(cursor, len(studio)) if studio[index]["normalizedSource"] == wanted]
    if not candidates:
        matches.append({"canonicalOrdinal": canonical_unit["ordinal"], "canonicalId": canonical_unit["id"], "status": "missing"})
        continue
    selected = candidates[0]
    used.add(selected)
    cursor = selected + 1
    matches.append({
        "canonicalOrdinal": canonical_unit["ordinal"],
        "canonicalId": canonical_unit["id"],
        "canonicalSourceHash": canonical_unit["source_hash"],
        "studioIndex": selected,
        "studioTransUnitId": studio[selected]["transUnitId"],
        "studioNormalizedSourceHash": hashlib.sha256(studio[selected]["normalizedSource"].encode("utf-8")).hexdigest(),
        "status": "matched",
    })

extras = []
for unit in studio:
    if unit["index"] in used:
        continue
    proof = {
        "sourceEmpty": unit["sourceText"] == "",
        "segmentedSourceEmpty": unit["segmentedText"] == "",
        "targetEmpty": unit["targetText"] == "",
        "noSegmentMarkers": unit["segmentCount"] == 0,
    }
    code_ids = re.findall(r'<x[^>]+id="([^"]+)"', unit["rawXml"])
    definitions = [studio_tags.get(code_id) for code_id in code_ids]
    excluded_page_breaks = bool(definitions) and all(
        definition is not None
        and definition["name"] == "page"
        and definition["segmentationHint"] == "Exclude"
        and '<br type="page"/>' in definition["definition"]
        for definition in definitions
    )
    proof["codesAreExcludedPageBreaks"] = excluded_page_breaks
    extras.append({**unit, "studioCodeDefinitions": definitions, "nonTranslatableStructuralProof": proof, "classification": "EMPTY_NON_TRANSLATABLE_PAGE_BREAK" if all(proof.values()) else "UNRESOLVED"})

ordered = [match["studioIndex"] for match in matches if match["status"] == "matched"]
result = {
    "canonicalSnapshotId": "d57fdd35-3b79-4f3a-b20a-3cfaf9941225",
    "sdlxliffPath": str(SDL),
    "sdlxliffSha256": hashlib.sha256(raw).hexdigest(),
    "sourceLanguage": file_element.get("source-language") if file_element is not None else None,
    "targetLanguage": file_element.get("target-language") if file_element is not None else None,
    "canonicalTranslationUnits": len(canonical),
    "studioTransUnits": len(studio),
    "studioSegments": sum(unit["segmentCount"] for unit in studio),
    "matched": sum(match["status"] == "matched" for match in matches),
    "missing": [match for match in matches if match["status"] == "missing"],
    "duplicateStudioAssignments": len(used) != len([match for match in matches if match["status"] == "matched"]),
    "strictDocumentOrder": ordered == sorted(ordered) and len(set(ordered)) == len(ordered),
    "extraStudioUnits": extras,
    "allExtrasProvenStructural": all(unit["classification"] == "EMPTY_NON_TRANSLATABLE_PAGE_BREAK" for unit in extras),
    "catPersistenceAllowed": False,
    "catPersistenceBlocker": "SDLXLIFF and supplied project artifacts do not establish target language mk-MK.",
}
OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(result, ensure_ascii=False, indent=2))
