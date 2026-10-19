"""Conservative batch dry-run/export for trusted EN->MK1 / final MK2 pairs.

Dry-run is the default and never writes a corpus TMX.  Source TMX and DOCX
files are opened read-only; only audit reports are written below --output.
"""
from pathlib import Path
import argparse, csv, hashlib, json, os, sys

HERE = Path(__file__).resolve().parent
PROTOTYPE = HERE / "mk1_to_mk2_prototype.py"

# Reuse the validated prototype's functions without executing its single-file
# report/export tail or its hard-coded example paths.
source = PROTOTYPE.read_text(encoding="utf-8")
exec(compile(source[:source.index("units = read_tmx(TMX)")], str(PROTOTYPE), "exec"), globals())

def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def pct(n, d):
    return round(n / d * 100, 2) if d else 0.0

def read_metadata(path):
    if not path.exists(): return {}
    with path.open(encoding="utf-8-sig", newline="") as h:
        return {r["DocumentID"]: r for r in csv.DictReader(h)}

def one_path(value):
    return Path(value) if value else None

def discover(root, metadata):
    docs = root / "Documents"
    for directory in sorted((p for p in docs.iterdir() if p.is_dir()), key=lambda p: p.name):
        celex = directory.name
        meta = metadata.get(celex, {})
        if str(meta.get("Sure_Set", "")).strip().lower() != "true":
            continue
        tmxs = sorted((directory / "TMX_MK1").glob("*.tmx")) if (directory / "TMX_MK1").exists() else []
        mk2s = sorted((directory / "MK2").glob("*.docx")) if (directory / "MK2").exists() else []
        # Metadata is authoritative when available; filesystem fallback is
        # still conservative and never selects among multiple candidates.
        declared = one_path(meta.get("MK2_File"))
        if declared and declared.exists(): mk2s = [declared]
        yield celex, meta, tmxs, mk2s

def audit_one(celex, tmx, mk2, out_dir):
    units = read_tmx(tmx)
    atoms, diagnostics = extract_mk2(mk2)
    results = match(units, atoms)
    footnote_matches = match_footnotes(units, results, diagnostics["footnote_records"])
    footnote_unit_indices = {m["unit_index"] for m in footnote_matches if m.get("unit") is not None}
    for prev, cur in zip(results, results[1:]):
        left, right = prev.get("mk2", ""), cur.get("mk2", "")
        spans = prev.get("mk2_char_span") and cur.get("mk2_char_span")
        if spans and prev["mk2_char_span"][1] == cur["mk2_char_span"][0] and left and right and left[-1].isalnum() and right[0].isalnum() and (len(left) <= 4 or len(right) <= 4):
            prev["boundary_fragment"] = cur["boundary_fragment"] = True
    for r in results:
        if r.get("boundary_fragment"): r["export_status"] = "BOUNDARY"
        elif r.get("index") in footnote_unit_indices: r["export_status"] = r["status"]; r["provenance_unsafe_footnote"] = True
        else: r["export_status"] = r["status"]
    groups = []
    for r in results:
        if r.get("boundary_fragment"):
            if not groups or r["index"] != groups[-1][-1]["index"] + 1: groups.append([])
            groups[-1].append(r)
    for group in groups:
        for r in group: r["export_status"] = "MANUAL_BOUNDARY"; r["manual_boundary"] = True
    # The validated prototype's frozen adjudication is part of its safety
    # policy and must apply identically in batch mode.
    for r in results:
        if r.get("index") in {42, 43, 44}: r["export_status"] = "MANUAL_BOUNDARY"; r["manual_boundary"] = True
    high = [r for r in results if r.get("status") == "HIGH" and r.get("export_status") == "HIGH" and not r.get("provenance_unsafe_footnote") and r.get("mk2")]
    matched = [r for r in results if r.get("mk2")]
    mk1_chars = sum(len(r["mk1"]) for r in units)
    mk2_chars = sum(len(a["text"]) for a in atoms)
    accepted_chars = sum(len(r["mk2"]) for r in high)
    audit = {"celex": celex, "tmx": str(tmx), "mk2": str(mk2), "tmx_sha256": sha256(tmx), "mk2_sha256": sha256(mk2), "original_tus": len(units), "accepted_tus": len(high), "skipped_tus": len(units)-len(high), "acceptance_percent": pct(len(high),len(units)), "mk1_coverage": pct(sum(len(r["mk1"]) for r in matched),mk1_chars), "mk2_coverage": pct(sum(len(r["mk2"]) for r in matched),mk2_chars), "accepted_clean_en_chars": sum(len(r["en"]) for r in high), "accepted_clean_mk2_chars": accepted_chars, "results": results, "diagnostics": diagnostics, "dry_run": True}
    target = out_dir / f"{celex}.audit.json"
    target.write_text(json.dumps(audit, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return audit

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, default=Path(os.environ.get("LEGACY_CORPUS_ROOT", r"D:\Преводи\EU_Acquis_Corpus")))
    ap.add_argument("--output", type=Path, default=HERE / "output" / "batch-dry-run")
    args = ap.parse_args(); args.output.mkdir(parents=True, exist_ok=True)
    metadata = read_metadata(args.root / "_metadata" / "sure_set.csv")
    rows, skipped_docs = [], 0
    for celex, meta, tmxs, mk2s in discover(args.root, metadata):
        reason = ""
        if len(tmxs) != 1: reason = f"ambiguous original TMX ({len(tmxs)} candidates)"
        elif len(mk2s) != 1: reason = f"ambiguous final MK2 ({len(mk2s)} candidates)"
        if reason:
            skipped_docs += 1; rows.append({"CELEX":celex,"TMX path":str(tmxs[0]) if len(tmxs)==1 else "","MK2 path":str(mk2s[0]) if len(mk2s)==1 else "","original TUs":"","accepted TUs":"","skipped TUs":"","acceptance %":"","MK1 coverage":"","MK2 coverage":"","output TMX path":"","status":"SKIPPED","skip reason":reason}); continue
        try:
            a = audit_one(celex, tmxs[0], mk2s[0], args.output)
        except Exception as exc:
            skipped_docs += 1
            rows.append({"CELEX":celex,"TMX path":str(tmxs[0]),"MK2 path":str(mk2s[0]),"original TUs":"","accepted TUs":"","skipped TUs":"","acceptance %":"","MK1 coverage":"","MK2 coverage":"","output TMX path":"","status":"SKIPPED","skip reason":f"prototype processing error: {type(exc).__name__}: {exc}"})
            continue
        rows.append({"CELEX":celex,"TMX path":a["tmx"],"MK2 path":a["mk2"],"original TUs":a["original_tus"],"accepted TUs":a["accepted_tus"],"skipped TUs":a["skipped_tus"],"acceptance %":a["acceptance_percent"],"MK1 coverage":a["mk1_coverage"],"MK2 coverage":a["mk2_coverage"],"output TMX path":"NOT GENERATED (DRY RUN)","status":"DRY_RUN","skip reason":""})
    fields = list(rows[0]) if rows else ["CELEX"]
    with (args.output / "batch-summary.csv").open("w", encoding="utf-8-sig", newline="") as h: csv.DictWriter(h, fieldnames=fields).writeheader(); csv.DictWriter(h, fieldnames=fields).writerows(rows)
    audits = [json.loads(p.read_text(encoding="utf-8")) for p in args.output.glob("*.audit.json")]
    total = {"documents_processed":len(audits),"documents_skipped":skipped_docs,"original_tus":sum(a["original_tus"] for a in audits),"accepted_tus":sum(a["accepted_tus"] for a in audits),"skipped_tus":sum(a["skipped_tus"] for a in audits),"accepted_percent":pct(sum(a["accepted_tus"] for a in audits),sum(a["original_tus"] for a in audits)),"total_clean_en_mk2_characters":sum(a["accepted_clean_en_chars"]+a["accepted_clean_mk2_chars"] for a in audits),"dry_run":True,"tmx_outputs_generated":0}
    (args.output / "aggregate-totals.json").write_text(json.dumps(total, indent=2), encoding="utf-8")
    print(json.dumps(total, indent=2))
if __name__ == "__main__": main()
