"""Frozen conservative MK1 -> approved MK2 analysis for CELEX 32014R0788.

This report-only prototype never writes a replacement TMX. MK2 is ground truth;
scores are evidence scores, not probabilities.
"""
from pathlib import Path
from difflib import SequenceMatcher
import re
import zipfile
import xml.etree.ElementTree as ET
import csv

ALIGNMENT_ALGORITHM_VERSION = "32014R0788-frozen-review-v1"
REVIEW_CONTEXT_VERSION = "final-docx-exact-atoms-v1"

if hasattr(__import__("sys").stdout, "reconfigure"):
    __import__("sys").stdout.reconfigure(encoding="utf-8")

TMX = Path(r"D:\Преводи\EU_Acquis_Corpus\Documents\32014R0788\TMX_MK1\32014R0788_TM.tmx")
MK2 = Path(r"D:\Преводи\EU_Acquis_Corpus\Documents\32014R0788\MK2\32014R0788_MK2.docx")
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
XML = "{http://www.w3.org/XML/1998/namespace}lang"

def norm(text):
    return re.sub(r"\s+", " ", text.replace("\u00a0", " ")).strip()

def tokens(text):
    return re.findall(r"[\w]+(?:[-/]\w+)*|\d+(?:[./-]\d+)*", text.casefold(), re.UNICODE)

def refs(text):
    return set(re.findall(r"\b(?:Article|Член|OJ|Сл\.?|CELEX)\s*[A-ZА-Ш0-9./()\-]+|\b\d+(?:[./-]\d+)+", text, re.I))

def read_tmx(path):
    units = []
    for tu in ET.parse(path).getroot().findall(".//tu"):
        values = {}
        for tuv in tu.findall("tuv"):
            seg = tuv.find("seg")
            if seg is not None:
                values[tuv.attrib.get(XML, "").lower()[:2]] = norm("".join(seg.itertext()))
        if values.get("en") and values.get("mk"):
            units.append({"en": values["en"], "mk1": values["mk"]})
    return units

def extract_mk2(path):
    atoms = []
    body_footnote_refs = []
    with zipfile.ZipFile(path) as archive:
        footnote_text = {}
        def part(name, kind):
            if name not in archive.namelist(): return
            root = ET.fromstring(archive.read(name))
            if kind == "body":
                nodes = root.findall(".//" + W + "p")
            elif kind in ("footnote", "endnote"):
                nodes = []
                for note in root.findall(W + kind):
                    if int(note.attrib.get(W + "id", "-1")) >= 0:
                        text = norm(" ".join("".join(p.itertext()) for p in note.findall(".//" + W + "p")))
                        footnote_text[note.attrib.get(W + "id")] = text
                        nodes.extend(note.findall(".//" + W + "p"))
            else: nodes = []
            for node in nodes:
                text = norm("".join(node.itertext()))
                refs_in_p = [x.attrib.get(W + "id") for x in node.findall(".//" + W + "footnoteReference")] if kind == "body" else []
                if text:
                    if kind == "body" and refs_in_p:
                        body_footnote_refs.append((len(atoms), refs_in_p))
                    atoms.append({"kind": kind, "text": text, "footnote_refs": refs_in_p})
        part("word/document.xml", "body")
        before = len(atoms); part("word/footnotes.xml", "footnote"); footnotes = len(atoms) - before
        before = len(atoms); part("word/endnotes.xml", "endnote"); endnotes = len(atoms) - before
    # Attach note text to the body paragraph containing the actual reference.
    # The note remains evidence at its body position; it is not appended as a
    # detached tail, which previously made OJ-reference TUs appear missing.
    for atom in atoms:
        notes = [footnote_text.get(ref, "") for ref in atom.get("footnote_refs", [])]
        if notes:
            atom["text"] = norm(atom["text"] + " " + " ".join(n for n in notes if n))
            atom["kind"] = "body_with_footnote"
    # Generic administrative-form marker; deliberately not CELEX-specific.
    admin = next((i for i, a in enumerate(atoms) if re.search(r"\bОБРАЗЕЦ\b|\bFORM\b|\bTEMPLATE\b", a["text"], re.I)), None)
    excluded = atoms[admin:] if admin is not None else []
    footnote_records = []
    for body_index, refs_in_p in body_footnote_refs:
        for ref in refs_in_p:
            if footnote_text.get(ref):
                footnote_records.append({"ref": ref, "body_index": body_index, "text": footnote_text[ref]})
    return (atoms[:admin] if admin is not None else atoms), {"footnotes": footnotes, "endnotes": endnotes, "excluded": excluded, "footnote_records": footnote_records}

def match_footnotes(units, body_results, records):
    """Reconcile footnotes separately; each exact MK2 footnote is single-owner."""
    # Body results are intentionally not consulted for ownership: the existing
    # body pass may have consumed a paragraph containing a footnote reference.
    # Footnote text has its own namespace and can therefore be reconciled
    # without changing body output.
    used_units = set()
    matches = []
    for sequence, record in enumerate(records):
        candidates = []
        for i, unit in enumerate(units):
            if i in used_units: continue
            unit_refs, record_refs = refs(unit["mk1"]), refs(record["text"])
            if not unit_refs or not (unit_refs & record_refs):
                continue
            left, right = " ".join(tokens(unit["mk1"])), " ".join(tokens(record["text"]))
            if not left or not right: continue
            score = SequenceMatcher(None, left, right, autojunk=False).ratio()
            number_overlap = len(re.findall(r"\d+(?:[./-]\d+)*", unit["mk1"]) and set(re.findall(r"\d+(?:[./-]\d+)*", unit["mk1"])) & set(re.findall(r"\d+(?:[./-]\d+)*", record["text"])))
            sequence_distance = abs(i - sequence)
            candidates.append((len(unit_refs & record_refs), number_overlap, score, -sequence_distance, i))
        candidates.sort(reverse=True)
        if not candidates or (len(candidates) > 1 and candidates[0][:-1] == candidates[1][:-1]):
            matches.append({"record": record, "unit": None, "status": "UNMATCHED"})
            continue
        _, number_overlap, score, _, i = candidates[0]
        status = "HIGH" if number_overlap >= 2 and score >= .75 else "REVIEW"
        matches.append({"record": record, "unit": unit, "status": status, "score": score, "unit_index": i + 1, "mk2": record["text"], "mk2_span": [record["ref"]]})
        used_units.add(i)
    return matches

def match(units, atoms):
    """Bounded monotonic reconciliation, allowing 1:1 through 3:3 groups."""
    # Use one coordinate space for the whole MK2 text.  Atom ranges are useful
    # for diagnostics, but they are too coarse for N:1/N:M proposals: several
    # source units may legitimately be assigned exact subspans of one
    # paragraph.  Ownership is therefore committed in this character space.
    mk2_text = norm(" ".join(a["text"] for a in atoms))
    atom_offsets = []
    offset = 0
    for atom in atoms:
        start = offset
        offset += len(atom["text"])
        atom_offsets.append((start, offset))
        offset += 1

    results = []; cursor = 0
    for i in range(len(units)):
        if any(r["index"] == i + 1 for r in results): continue
        best = None
        for unit_count in range(1, min(3, len(units) - i) + 1):
            left = norm(" ".join(u["mk1"] for u in units[i:i + unit_count]))
            for atom_count in range(1, min(3, len(atoms) - cursor) + 1):
                candidate = norm(" ".join(a["text"] for a in atoms[cursor:cursor + atom_count]))
                if abs(len(candidate) - len(left)) > max(900, len(left) * 2): continue
                left_tokens, right_tokens = set(tokens(left)), set(tokens(candidate))
                if left_tokens and len(left_tokens & right_tokens) / len(left_tokens) < .10: continue
                raw = SequenceMatcher(None, " ".join(tokens(left)), " ".join(tokens(candidate)), autojunk=False).ratio()
                evidence = {"token_count": len(tokens(candidate)), "references_preserved": refs(left) <= refs(candidate), "neighbor_window": [i + 1, i + unit_count], "atom_window": [cursor, cursor + atom_count], "provenance_unsafe_footnote": any(a.get("kind") == "body_with_footnote" for a in atoms[cursor:cursor + atom_count])}
                adjusted = raw + (.04 if evidence["references_preserved"] else 0)
                if best is None or adjusted > best["adjusted"]: best = {"unit_count": unit_count, "atom_count": atom_count, "candidate": candidate, "score": raw, "adjusted": adjusted, "evidence": evidence}
        if best is None or best["score"] < .55:
            results.append({"index": i + 1, **units[i], "mk2": "", "score": best["score"] if best else 0, "status": "UNMATCHED", "cardinality": "0:0", "evidence": {"reason": "No sufficiently local non-overlapping candidate."}})
            if best is not None:
                cursor = min(len(atoms), cursor + 1)
            continue
        # Split one consumed MK2 span between consecutive TUs by expected MK1
        # lengths. This preserves exact MK2 characters without duplication.
        atom_text = best["candidate"]
        atom_start, atom_end = atom_offsets[cursor][0], atom_offsets[cursor + best["atom_count"] - 1][1]
        # The candidate is the exact monotonic slice currently being consumed.
        # Keep this assertion close to the ownership commit so a future change
        # cannot silently reintroduce proposal-local coordinates.
        assert mk2_text[atom_start:atom_end] == atom_text
        lengths = [max(1, len(u["mk1"])) for u in units[i:i + best["unit_count"]]]; total = sum(lengths); local_offset = 0
        for n, unit in enumerate(units[i:i + best["unit_count"]]):
            start_offset = local_offset
            end = len(atom_text) if n == len(lengths) - 1 else local_offset + round(len(atom_text) * lengths[n] / total)
            piece = norm(atom_text[start_offset:end]); raw = SequenceMatcher(None, " ".join(tokens(unit["mk1"])), " ".join(tokens(piece)), autojunk=False).ratio()
            status = "HIGH" if raw >= .90 and refs(unit["mk1"]) <= refs(piece) else "REVIEW" if raw >= .70 else "UNMATCHED"
            cardinality = "1:1" if best["unit_count"] == best["atom_count"] == 1 else "1:N" if best["unit_count"] == 1 else "N:1" if best["atom_count"] == 1 else "N:M"
            results.append({"index": i + n + 1, **unit, "mk2": piece, "score": raw, "status": status, "cardinality": cardinality, "mk2_span": [cursor, cursor + best["atom_count"]], "mk2_char_span": [atom_start + start_offset, atom_start + end], "evidence": best["evidence"]})
            local_offset = end
        cursor += best["atom_count"]
    return results

units = read_tmx(TMX)
atoms, diagnostics = extract_mk2(MK2)
results = match(units, atoms)
footnote_matches = match_footnotes(units, results, diagnostics["footnote_records"])
footnote_owners = [m["record"]["ref"] for m in footnote_matches if m["unit"]]
assert len(footnote_owners) == len(set(footnote_owners)), "footnote text ownership is not exclusive"
# Export classification must attach provenance risk to the actual matched
# footnote/reference TU only.  A body atom can contain a footnote anchor, but
# that does not make the body TU itself a footnote candidate.
footnote_unit_indices = {
    m["unit_index"] for m in footnote_matches if m.get("unit") is not None
}

# A proposed span can cut through a word when one MK2 atom is divided among
# adjacent TUs.  Those pieces are not independently usable candidates.  Mark
# the whole adjacent split chain as BOUNDARY without changing its score,
# ownership, or proposed text.
def is_word_char(value):
    return bool(value) and (value[-1].isalnum() if len(value) == 1 else False)

for previous, current in zip(results, results[1:]):
    left, right = previous.get("mk2", ""), current.get("mk2", "")
    spans_touch = (
        previous.get("mk2_char_span")
        and current.get("mk2_char_span")
        and previous["mk2_char_span"][1] == current["mk2_char_span"][0]
    )
    # Long adjacent allocations can legitimately meet at a word boundary
    # inside a normalized atom.  A very short adjacent piece is the reliable
    # signal for the malformed split-word fragments (for example TU 42/43).
    if (left and right and spans_touch and left[-1].isalnum() and right[0].isalnum()
            and (len(left) <= 4 or len(right) <= 4)):
        previous["boundary_fragment"] = True
        current["boundary_fragment"] = True

for result in results:
    if result.get("boundary_fragment"):
        result["export_status"] = "BOUNDARY"
    elif result.get("index") in footnote_unit_indices:
        result["export_status"] = result["status"]
        result["provenance_unsafe_footnote"] = True
    else:
        result["export_status"] = result["status"]

boundary_groups = []
for result in results:
    if result.get("boundary_fragment"):
        if not boundary_groups or result["index"] != boundary_groups[-1][-1]["index"] + 1:
            boundary_groups.append([])
        boundary_groups[-1].append(result)
manual_boundary_groups = []
for group in boundary_groups:
    manual_boundary_groups.append([r["index"] for r in group])
    for result in group:
        result["export_status"] = "MANUAL_BOUNDARY"
        result["manual_boundary"] = True
# This known split is deliberately frozen for reviewer adjudication. It must
# not be heuristically repaired or promoted by a future rerun of this export.
for result in results:
    if result.get("index") in {42, 43, 44}:
        result["export_status"] = "MANUAL_BOUNDARY"
        result["manual_boundary"] = True

def atom_context(result):
    """Return exact final-DOCX paragraph context without changing alignment."""
    span = result.get("mk2_span")
    if span and result.get("mk2"):
        start, end = span
        candidate_atoms = atoms[start:end]
        before_atoms = atoms[max(0, start - 2):start]
        after_atoms = atoms[end:min(len(atoms), end + 2)]
    else:
        # For unmatched structural units, use only an unambiguous nearby
        # heading. This is display context, never an alignment proposal.
        candidate_atoms = []
        before_atoms = []
        after_atoms = []
        expected = result.get("en", "")
        roman = re.search(r"\b([IVXLCDM]+)\b", expected.upper())
        heading_candidates = [
            (i, atom) for i, atom in enumerate(atoms)
            if atom.get("kind") == "body"
            and len(atom.get("text", "")) <= 140
            and (atom["text"].isupper() or re.match(r"^\s*\S+\s+\S+", atom["text"]))
            and roman and roman.group(1) in atom["text"].upper()
        ] if roman else []
        if len(heading_candidates) == 1:
            index, atom = heading_candidates[0]
            candidate_atoms = [atom]
            before_atoms = atoms[max(0, index - 2):index]
            after_atoms = atoms[index + 1:min(len(atoms), index + 3)]
        else:
            window = result.get("evidence", {}).get("atom_window")
            if window:
                start, end = window
                candidate_atoms = atoms[start:end]
                before_atoms = atoms[max(0, start - 2):start]
                after_atoms = atoms[end:min(len(atoms), end + 2)]
            else:
                # Final-DOCX-only fallback for the two unmatched rows whose
                # candidate search produced no atom window. These are unique
                # literal paragraphs/headings in the extracted MK2 atoms.
                anchors = {
                    "COMMON PROVISIONS": "ЗАЕДНИЧКИ ОДРЕДБИ",
                    "The Commission shall report yearly": "Комисијата поднесува годишни извештаи",
                }
                anchor = next((value for key, value in anchors.items() if key in expected), None)
                matches = [(i, atom) for i, atom in enumerate(atoms) if anchor and anchor in atom.get("text", "")]
                if len(matches) == 1:
                    index, atom = matches[0]
                    candidate_atoms = [atom]
                    before_atoms = atoms[max(0, index - 2):index]
                    after_atoms = atoms[index + 1:min(len(atoms), index + 3)]

    def exact(atom_list):
        return "\n".join(atom["text"] for atom in atom_list)

    return exact(before_atoms), exact(candidate_atoms), exact(after_atoms)
matched = [r for r in results if r["mk2"]]
ordered = sorted(matched, key=lambda r: r["mk2_char_span"])
overlap_count = sum(ordered[i]["mk2_char_span"][0] < ordered[i - 1]["mk2_char_span"][1] for i in range(1, len(ordered)))
high = [r for r in results if r["status"] == "HIGH"]
review = [r for r in results if r["status"] == "REVIEW"]
unmatched = [r for r in results if r["status"] == "UNMATCHED"]
mk1_chars = sum(len(r["mk1"]) for r in units)
act_chars = sum(len(a["text"]) for a in atoms)
matched_chars = sum(len(r["mk2"]) for r in matched)
excluded_chars = sum(len(a["text"]) for a in diagnostics["excluded"])
print("32014R0788 MK1 -> MK2 PROTOTYPE")
print("TM units:", len(units), "MK2 act atoms:", len(atoms))
print("HIGH:", len(high), "REVIEW:", len(review), "UNMATCHED:", len(unmatched))
print("CARDINALITIES:", {k: sum(r["cardinality"] == k for r in results) for k in ("1:1", "1:N", "N:1", "N:M")})
print("MK1 character coverage:", f"{sum(len(r['mk1']) for r in matched) / mk1_chars * 100:.2f}%")
print("MK2 act-text character coverage:", f"{matched_chars / act_chars * 100:.2f}%")
print("Footnotes detected:", diagnostics["footnotes"])
print("Footnote matches HIGH/REVIEW/UNMATCHED:", {k: sum(m["status"] == k for m in footnote_matches) for k in ("HIGH", "REVIEW", "UNMATCHED")})
print("Footnote TM TUs resolved:", [m["unit_index"] for m in footnote_matches if m["unit"]])
print("Footnote/endnote atoms:", diagnostics["footnotes"], diagnostics["endnotes"])
print("Excluded administrative atoms/chars:", len(diagnostics["excluded"]), excluded_chars)
print("Integrity: monotonic order OK; overlapping consumed spans:", overlap_count, "; references preserved as evidence.")
assert overlap_count == 0, f"overlapping consumed spans == {overlap_count}, expected 0"
consumed_atoms = {a for r in matched for a in range(r["mk2_span"][0], r["mk2_span"][1])}
print("Unconsumed MK2 act atoms:", len(atoms) - len(consumed_atoms))
for atom_index, atom in enumerate(atoms):
    if atom_index not in consumed_atoms:
        print(f"UNCONSUMED MK2 atom {atom_index} [{atom['kind']}]: {atom['text'][:240]}")
print("\nUNRESOLVED")
for r in unmatched:
    print(f"TU {r['index']} | EN: {r['en'][:180]} | MK1: {r['mk1'][:180]} | reason: {r['evidence'].get('reason', 'candidate below threshold or overlap')}")

def csv_row(r):
    evidence = r.get("evidence", {})
    unsafe = bool(r.get("provenance_unsafe_footnote"))
    reason = evidence.get("reason")
    if r.get("manual_boundary"):
        reason = "MANUAL_BOUNDARY: clean TU boundary could not be determined."
    elif r.get("export_status") == "BOUNDARY":
        reason = "Boundary fragment; adjacent TUs split a word and are not usable MK2 candidates."
    elif unsafe:
        reason = "Provenance-unsafe footnote candidate; manual review required."
    elif not reason:
        reason = "Candidate requires human review." if r.get("status") == "REVIEW" else "No sufficiently local non-overlapping candidate."
    candidate = r.get("mk2", "")
    context_before, context_candidate, context_after = atom_context(r)
    return {
        "TU": r.get("index", ""),
        "EN": r.get("en", ""),
        "MK1": r.get("mk1", ""),
        "proposed_MK2": candidate,
        "status": r.get("export_status", r.get("status", "")),
        "score": r.get("score", ""),
        "match_type": r.get("cardinality", "0:0"),
        "reason": reason,
        "approved_MK2": candidate if candidate and not unsafe else "",
        "decision": "",
        "review_note": "",
        "mk2_context_before": context_before,
        "mk2_context_candidate": context_candidate,
        "mk2_context_after": context_after,
    }

fields = ["TU", "EN", "MK1", "proposed_MK2", "status", "score", "match_type", "reason", "approved_MK2", "decision", "review_note", "mk2_context_before", "mk2_context_candidate", "mk2_context_after"]
review_rows = [r for r in results if r.get("export_status") in {"REVIEW", "UNMATCHED", "MANUAL_BOUNDARY", "BOUNDARY"} or r.get("provenance_unsafe_footnote")]
high_rows = [r for r in results if r.get("status") == "HIGH"]
output_dir = Path(__file__).parent / "output"
output_dir.mkdir(parents=True, exist_ok=True)
for filename, rows in (("32014R0788_mk2_review.csv", review_rows), ("32014R0788_mk2_high.csv", high_rows)):
    with (output_dir / filename).open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(csv_row(r) for r in rows)
print(f"Exported review rows: {len(review_rows)}")
print(f"Exported high rows: {len(high_rows)}")
print("Boundary groups manual:", manual_boundary_groups)
print("Alignment algorithm:", ALIGNMENT_ALGORITHM_VERSION)
print("Review context:", REVIEW_CONTEXT_VERSION)
print("Review rows:", len(review_rows))
print("MK2 coverage:", f"{matched_chars / act_chars * 100:.2f}%")
print("Overlaps:", overlap_count)
