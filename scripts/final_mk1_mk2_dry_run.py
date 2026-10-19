"""Final report-only MK1 -> MK2 corpus dry run.

Reuses the frozen reconciliation implementation from mk1_to_mk2_prototype.py.
No TMX is written and no database code is imported.
"""
from pathlib import Path
import csv, json, os, shutil, subprocess, tempfile, zipfile, xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
PROTO = HERE / "mk1_to_mk2_prototype.py"
source = PROTO.read_text(encoding="utf-8")
exec(compile(source[:source.index("units = read_tmx(TMX)")], str(PROTO), "exec"), globals())

ROOT = Path(os.environ.get("LEGACY_CORPUS_ROOT", r"D:\Преводи\EU_Acquis_Corpus"))
OUT = HERE / "output" / "final-mk1-mk2-dry-run"
WORD = Path(r"C:\Program Files\LibreOffice\program\soffice.exe")

def extract_mk2(path):
    if path.suffix.lower() == ".docx":
        return globals()["_extract_docx"](path) if "_extract_docx" in globals() else _docx(path, "DOCX")
    if path.suffix.lower() != ".doc": raise ValueError("MK2 format is not DOC or DOCX")
    if not WORD.exists(): raise RuntimeError("legacy DOC temporary DOCX extraction unavailable: LibreOffice not found")
    temp = Path(tempfile.mkdtemp(prefix="mk1-mk2-doc-")); profile=temp/"profile"; out=temp/"out"; profile.mkdir(); out.mkdir()
    try:
        inp=temp/"source.doc"; shutil.copy2(path, inp)
        p=subprocess.run([str(WORD), f"-env:UserInstallation={profile.resolve().as_uri()}", "--headless", "--convert-to", "docx", "--outdir", str(out), str(inp)], capture_output=True, text=True, timeout=120)
        converted=out/"source.docx"
        if p.returncode or not converted.exists(): raise RuntimeError(f"temporary DOCX extraction failed: {(p.stderr or p.stdout).strip()}")
        atoms, d = _docx(converted, "DOC")
        d["extraction_method"]="legacy DOC -> temporary DOCX -> OOXML"
        return atoms, d
    finally: shutil.rmtree(temp, ignore_errors=True)

def _docx(path, fmt):
    w="{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    with zipfile.ZipFile(path) as z: root=ET.fromstring(z.read("word/document.xml"))
    atoms=[]
    for p in root.findall(".//"+w+"p"):
        text=norm("".join(p.itertext()))
        if text: atoms.append({"kind":"body","text":text,"footnote_refs":[]})
    return atoms, {"format":fmt,"paragraphs":len(atoms),"table_cells":0,"characters":sum(len(a["text"]) for a in atoms),"extraction_method":"working DOCX OOXML"}

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    meta={r["DocumentID"]:r for r in csv.DictReader((ROOT/"_metadata"/"sure_set.csv").open(encoding="utf-8-sig"))}
    rows=[]; audits=[]; skipped_reasons={}; format_rows=[]
    for celex,m in sorted(meta.items()):
        if str(m.get("Sure_Set","")).lower()!="true": continue
        d=ROOT/"Documents"/celex; tmx=sorted((d/"TMX_MK1").glob("*.tmx")) if (d/"TMX_MK1").exists() else []
        declared=Path(m["MK2_File"]) if m.get("MK2_File") else None
        mk2=[declared] if declared and declared.exists() else sorted([*d.glob("MK2/*.docx"),*d.glob("MK2/*.doc")])
        reason="" if len(tmx)==1 and len(mk2)==1 else (f"ambiguous original TMX ({len(tmx)} candidates)" if len(tmx)!=1 else f"ambiguous final MK2 ({len(mk2)} candidates)")
        base={"CELEX":celex,"status":"SKIPPED","reason":reason,"source_format":"","original_tus":0,"accepted_clean_tus":0,"skipped_tus":0,"acceptance_percent":0.0,"clean_en_chars":0,"clean_mk2_chars":0,"mk1_coverage_percent":0.0,"mk2_coverage_percent":0.0}
        if not reason:
            try:
                units=read_tmx(tmx[0]); atoms,diag=extract_mk2(mk2[0]); results=match(units,atoms)
                # Apply the prototype's existing safety classification unchanged.
                fmatches=match_footnotes(units,results,diag.get("footnote_records", [])); unsafe={x["unit_index"] for x in fmatches if x.get("unit") is not None}
                for r in results: r["export_status"]="HIGH" if r.get("status")=="HIGH" and not r.get("index") in unsafe else ("UNSAFE_REFERENCE" if r.get("index") in unsafe else r.get("status"))
                accepted=[r for r in results if r.get("status")=="HIGH" and r.get("export_status")=="HIGH" and r.get("mk2")]
                reasons={}
                for r in results:
                    if r not in accepted: reasons[r.get("export_status",r.get("status","UNKNOWN"))]=reasons.get(r.get("export_status",r.get("status","UNKNOWN")),0)+1
                base.update(status="DRY_RUN",source_format=mk2[0].suffix.lower().lstrip("."),original_tus=len(units),accepted_clean_tus=len(accepted),skipped_tus=len(units)-len(accepted),acceptance_percent=round(100*len(accepted)/max(1,len(units)),2),clean_en_chars=sum(len(r["en"]) for r in accepted),clean_mk2_chars=sum(len(r["mk2"]) for r in accepted),mk1_coverage_percent=round(100*sum(len(r["mk1"]) for r in results if r.get("mk2"))/max(1,sum(len(x["mk1"]) for x in units)),2),mk2_coverage_percent=round(100*sum(len(r["mk2"]) for r in results if r.get("mk2"))/max(1,sum(len(x["text"]) for x in atoms)),2))
                audits.append({"celex":celex,"results":results,"diagnostics":diag,"accepted_indices":[r["index"] for r in accepted],"original_tus":len(units),"accepted_clean_tus":len(accepted),"reasons":reasons})
                for k,v in reasons.items(): skipped_reasons[k]=skipped_reasons.get(k,0)+v
                format_rows.append({"CELEX":celex,"format":base["source_format"],"status":"processed","accepted_clean_tus":len(accepted),"original_tus":len(units)})
            except Exception as e: reason=f"processing error: {type(e).__name__}: {e}"; base["reason"]=reason
        if base["status"]=="SKIPPED": skipped_reasons[reason]=skipped_reasons.get(reason,0)+1
        rows.append(base)
    bands={"0%":0,"0.01-5%":0,"5.01-10%":0,"10.01-25%":0,">25%":0}
    for r in rows:
        if r["status"]!="SKIPPED":
            p=r["acceptance_percent"]; key="0%" if p==0 else "0.01-5%" if p<=5 else "5.01-10%" if p<=10 else "10.01-25%" if p<=25 else ">25%"; bands[key]+=1
    eligible=[r for r in rows if r["status"]!="SKIPPED"]
    total={"dry_run":True,"tmx_generation":"not performed","trusted_documents":len(audits),"processed_documents":len(audits),"skipped_documents":sum(r["status"]=="SKIPPED" for r in rows),"original_tus":sum(r["original_tus"] for r in rows),"accepted_clean_tus":sum(r["accepted_clean_tus"] for r in rows),"acceptance_percent":round(100*sum(r["accepted_clean_tus"] for r in rows)/max(1,sum(r["original_tus"] for r in rows)),2),"clean_en_chars":sum(r["clean_en_chars"] for r in rows),"clean_mk2_chars":sum(r["clean_mk2_chars"] for r in rows),"mk1_mk2_coverage":"see CSV per document","acceptance_bands_by_document":bands,"top_acceptance_documents":sorted(eligible,key=lambda r:r["acceptance_percent"],reverse=True)[:10],"bottom_acceptance_documents":sorted(eligible,key=lambda r:r["acceptance_percent"])[:10],"aggregate_skipped_reasons":skipped_reasons,"doc_vs_docx":{k:{"documents":sum(1 for r in rows if r["source_format"]==k),"original_tus":sum(r["original_tus"] for r in rows if r["source_format"]==k),"accepted_clean_tus":sum(r["accepted_clean_tus"] for r in rows if r["source_format"]==k)} for k in ("doc","docx")}}
    with (OUT/"final-summary.csv").open("w",encoding="utf-8-sig",newline="") as f: csv.DictWriter(f,fieldnames=list(rows[0])).writeheader(); csv.DictWriter(f,fieldnames=list(rows[0])).writerows(rows)
    (OUT/"final-summary.json").write_text(json.dumps({"summary":total,"documents":rows,"audits":audits,"format_results":format_rows},ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(total,ensure_ascii=False,indent=2))
if __name__=="__main__": main()
