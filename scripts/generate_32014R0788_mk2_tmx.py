from copy import deepcopy
from pathlib import Path
import csv
import hashlib
import sys
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
ORIGINAL = Path(r"D:\Преводи\EU_Acquis_Corpus\Documents\32014R0788\TMX_MK1\32014R0788_TM.tmx")
HIGH = ROOT / "scripts" / "output" / "32014R0788_mk2_high.csv"
OUTPUT = ROOT / "scripts" / "output" / "32014R0788_TM_MK2.tmx"
CELEX = "32014R0788"
MK2_SOURCE = Path(r"D:\Преводи\EU_Acquis_Corpus\Documents\32014R0788\MK2\32014R0788_MK2.docx")
XML_LANG = "{http://www.w3.org/XML/1998/namespace}lang"


def seg(tuv):
    node = tuv.find("seg")
    return "" if node is None else "".join(node.itertext())


def prop(parent, kind, value):
    node = ET.SubElement(parent, "prop", {"type": kind})
    node.text = value


tree = ET.parse(ORIGINAL)
root = tree.getroot()
units = root.find("body").findall("tu")
original_count = len(units)

with HIGH.open(encoding="utf-8-sig", newline="") as handle:
    rows = list(csv.DictReader(handle))

by_tu = {}
for row in rows:
    if row["status"] != "HIGH" or not row["approved_MK2"]:
        continue
    index = int(row["TU"])
    if index in by_tu:
        raise RuntimeError(f"duplicate MK2 ownership for source TU {index}")
    by_tu[index] = row

source_hash = hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()
mk2_hash = hashlib.sha256(MK2_SOURCE.read_bytes()).hexdigest() if MK2_SOURCE.exists() else "unavailable"
header = root.find("header")
prop(header, "x-MK2Provenance", f"CELEX:{CELEX}; source:final-MK2; alignment:HIGH-only")
prop(header, "x-MK2Source", str(MK2_SOURCE))
prop(header, "x-MK2SourceSHA256", mk2_hash)
prop(header, "x-OriginalTMXSHA256", source_hash)

seen_sources = set()
seen_targets = set()
generated = 0
for index, tu in enumerate(units, 1):
    row = by_tu.get(index)
    if row is None:
        root.find("body").remove(tu)
        continue
    en_tuv = next((node for node in tu.findall("tuv") if node.get(XML_LANG, "").lower().startswith("en")), None)
    mk_tuv = next((node for node in tu.findall("tuv") if node.get(XML_LANG, "").lower().startswith("mk")), None)
    if en_tuv is None or mk_tuv is None:
        raise RuntimeError(f"missing bilingual pair at TU {index}")
    source = seg(en_tuv)
    target = row["approved_MK2"]
    if not source or not target:
        raise RuntimeError(f"empty source/target at TU {index}")
    # The original TMX source is authoritative. The CSV may contain a
    # whitespace-normalized copy of the source used during alignment.
    if source in seen_sources or target in seen_targets:
        raise RuntimeError(f"duplicate source/target ownership at TU {index}")
    seen_sources.add(source)
    seen_targets.add(target)
    mk_tuv = deepcopy(mk_tuv)
    mk_tuv.find("seg").clear()
    mk_tuv.find("seg").text = target
    tu.remove(next(node for node in tu.findall("tuv") if node.get(XML_LANG, "").lower().startswith("mk")))
    tu.append(mk_tuv)
    prop(tu, "x-MK2Status", "HIGH")
    prop(tu, "x-MK2CELEX", CELEX)
    prop(tu, "x-MK2Source", "final-MK2")
    prop(tu, "x-MK2SourceTU", str(index))
    generated += 1

ET.indent(tree, space="  ")
tree.write(OUTPUT, encoding="utf-8", xml_declaration=True)
print(f"original_tu_count={original_count}")
print(f"generated_tu_count={generated}")
print(f"skipped_tu_count={original_count - generated}")
print(f"output={OUTPUT}")
