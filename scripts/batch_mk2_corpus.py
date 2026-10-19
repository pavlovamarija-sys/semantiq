"""Dry-run/export batch for trusted MK1 TMX -> final MK2 DOCX corpus pairs.

Dry-run is the default and never writes corpus TMXs. Source files are read-only.
"""
from __future__ import annotations
import argparse, csv, hashlib, json, re, zipfile, tempfile, shutil, os, time, subprocess
from copy import deepcopy
from difflib import SequenceMatcher
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CORPUS = Path(r"D:\Преводи\EU_Acquis_Corpus")
META = CORPUS / "_metadata" / "sure_set.csv"
OUT = ROOT / "scripts" / "output" / "batch_mk2"
XML_LANG = "{http://www.w3.org/XML/1998/namespace}lang"
LIBREOFFICE = Path(r"C:\Program Files\LibreOffice\program\soffice.exe")

def norm(s): return re.sub(r"\s+", " ", s.replace("\u00a0", " ")).strip()
def toks(s): return re.findall(r"[\w]+(?:[-/]\w+)*|\d+(?:[./-]\d+)*", s.casefold(), re.UNICODE)
def refs(s): return set(re.findall(r"\b(?:Article|Член|OJ|Сл\.?|CELEX)\s*[A-ZА-Ш0-9./()\-]+|\b\d+(?:[./-]\d+)+", s, re.I))
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def tmx_units(path):
    root = ET.parse(path).getroot(); out=[]
    for tu in root.findall(".//tu"):
        vals={}
        for tuv in tu.findall("tuv"):
            seg=tuv.find("seg")
            if seg is not None: vals[tuv.get(XML_LANG, "").lower()[:2]]=("".join(seg.itertext()), tuv)
        if vals.get("en") and vals.get("mk"): out.append((vals["en"][0], vals["mk"][0], tu))
    return root, out

def _convert_legacy_doc(path):
    """Convert a binary Word document read-only, outside the corpus tree."""
    executable = LIBREOFFICE.resolve()
    if not executable.is_file():
        raise RuntimeError(f"LibreOffice executable was not found: {LIBREOFFICE}")
    temp_root = Path(tempfile.mkdtemp(prefix="mk2-doc-"))
    profile_dir = temp_root / "profile"
    output_dir = temp_root / "output"
    profile_dir.mkdir()
    output_dir.mkdir()
    input_copy = temp_root / ("source" + path.suffix.lower())
    output = output_dir / "source.docx"
    try:
        # LibreOffice can fail to open legacy files through corpus paths with
        # non-ASCII directory names; operate on a temporary copy instead.
        shutil.copy2(path, input_copy)
        profile_uri = profile_dir.resolve().as_uri()
        arguments = [
            str(executable),
            f"-env:UserInstallation={profile_uri}",
            "--headless", "--invisible", "--nodefault", "--nologo",
            "--nolockcheck", "--nofirststartwizard", "--norestore",
            "--convert-to", "docx", "--outdir", str(output_dir), str(input_copy),
        ]
        print(f"LibreOffice executable: {executable}")
        print(f"LibreOffice arguments: {arguments}")
        print(f"LibreOffice cwd: {Path.cwd().resolve()}")
        print(f"LibreOffice profile URI: {profile_uri}")
        print(f"LibreOffice temp input: {input_copy}")
        print(f"LibreOffice temp output: {output}")
        completed = subprocess.run(
            arguments,
            check=False, capture_output=True, text=True, stdin=subprocess.DEVNULL,
            timeout=120,
        )
        if completed.returncode != 0:
            detail=(completed.stderr or completed.stdout).strip()
            raise RuntimeError(f"LibreOffice exited with code {completed.returncode}: {detail}")
        if not output.is_file():
            detail=(completed.stderr or completed.stdout).strip()
            raise RuntimeError(f"LibreOffice did not create {output.name}: {detail}")
        return output, temp_root
    except subprocess.TimeoutExpired as exc:
        shutil.rmtree(temp_root, ignore_errors=True)
        raise RuntimeError("read-only LibreOffice DOC conversion timed out after 120 seconds") from exc
    except Exception as exc:
        shutil.rmtree(temp_root, ignore_errors=True)
        raise RuntimeError(f"read-only LibreOffice DOC conversion failed: {exc}") from exc

def docx_atoms(path):
    with zipfile.ZipFile(path) as z:
        root=ET.fromstring(z.read("word/document.xml"))
    w="{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    body = root.find(".//" + w + "body")
    if body is None: raise ValueError("DOCX has no w:body")
    atoms=[]; paragraphs=0; table_cells=0; revision_paragraphs=0
    deleted_tag = w + "del"
    text_tag = w + "t"
    tab_tag = w + "tab"
    break_tags = {w + "br", w + "cr"}

    def accepted_text(p):
        """Return final accepted Word text, ignoring deleted revisions."""
        parts=[]
        def visit(node):
            # A deleted run is not part of the accepted document, including
            # its w:delText descendants. Inserted runs remain current text.
            if node.tag == deleted_tag:
                return
            if node.tag == text_tag:
                parts.append(node.text or "")
                return
            if node.tag == tab_tag:
                parts.append("\t")
                return
            if node.tag in break_tags:
                parts.append("\n")
                return
            for child in node:
                visit(child)
        visit(p)
        return "".join(parts)

    def paragraph(p):
        nonlocal paragraphs, revision_paragraphs
        paragraphs += 1
        if any(node.tag in {w + "ins", deleted_tag} for node in p.iter()):
            revision_paragraphs += 1
        text=norm(accepted_text(p))
        if text: atoms.append(text)
    for child in body:
        if child.tag == w + "p": paragraph(child)
        elif child.tag == w + "tbl":
            for cell in child.iter(w + "tc"):
                table_cells += 1
                for p in cell.findall("./" + w + "p"): paragraph(p)
    return atoms, {"format":"DOCX", "paragraphs":paragraphs, "table cells":table_cells,
                   "revision-affected paragraphs":revision_paragraphs,
                   "characters":sum(len(x) for x in atoms), "extraction method":"OOXML body traversal", "error":""}

def extract_mk2(path):
    temp_root = None
    try:
        source = path
        if path.suffix.lower() == ".doc":
            source, temp_root = _convert_legacy_doc(path)
            diagnostics_method = "Word read-only conversion to temporary DOCX + OOXML body traversal"
        elif path.suffix.lower() == ".docx":
            diagnostics_method = "OOXML body traversal"
        else:
            raise ValueError("MK2 format is not DOC or DOCX")
        atoms, diagnostics = docx_atoms(source)
        diagnostics["format"] = path.suffix.lower().lstrip(".").upper()
        diagnostics["extraction method"] = diagnostics_method
        return atoms, diagnostics
    finally:
        if temp_root is not None: shutil.rmtree(temp_root, ignore_errors=True)

def reconcile(units, atoms):
    # Prepare the immutable text features once.  The old implementation rebuilt
    # these for every TU x atom-window candidate (and again for the split pieces).
    # Keep the exact strings and candidate iteration order unchanged.
    unit_data=[(src, mk1, norm(mk1), toks(mk1), refs(mk1), max(1, len(mk1)))
               for src, mk1, _ in units]
    atom_data=[(atom, toks(atom), refs(atom)) for atom in atoms]
    whole=norm(" ".join(atoms)); offsets=[]; n=0
    for a in atoms: offsets.append((n,n+len(a))); n += len(a)+1
    unit_windows={}
    for i in range(len(units)):
        for uc in range(1, min(3, len(units)-i)+1):
            text=norm(" ".join(x[1] for x in units[i:i+uc]))
            token_list=toks(text)
            unit_windows[i,uc]=(text, token_list, set(token_list), refs(text))
    atom_windows={}
    results=[]; cursor=0
    for i,(en,mk1,_) in enumerate(units):
        best=None
        for uc in range(1,min(3,len(units)-i)+1):
            left,left_tokens,left_set,left_refs=unit_windows[i,uc]
            for ac in range(1,min(3,len(atoms)-cursor)+1):
                key=(cursor,ac)
                if key not in atom_windows:
                    cand=norm(" ".join(atoms[cursor:cursor+ac])); cand_tokens=toks(cand)
                    atom_windows[key]=(cand,cand_tokens,set(cand_tokens),refs(cand))
                cand,cand_tokens,cand_set,cand_refs=atom_windows[key]
                if not left_set or len(left_set&cand_set)/len(left_set)<.10: continue
                score=SequenceMatcher(None," ".join(left_tokens)," ".join(cand_tokens),autojunk=False).ratio()
                if best is None or score + (.04 if left_refs<=cand_refs else 0)>best[0]: best=(score,uc,ac,cand)
        if best is None or best[0]<.55:
            results.append({"index":i+1,"en":en,"mk1":mk1,"status":"UNMATCHED","target":"","reason":"No sufficiently local non-overlapping candidate."});
            if best: cursor=min(len(atoms),cursor+1)
            continue
        score,uc,ac,cand=best; lengths=[x[5] for x in unit_data[i:i+uc]]; total=sum(lengths); local=0
        for j,(src,mk1,_,mk1_tokens,_,_) in enumerate(unit_data[i:i+uc]):
            end=len(cand) if j==len(lengths)-1 else local+round(len(cand)*lengths[j]/total); piece=norm(cand[local:end]); s=SequenceMatcher(None," ".join(mk1_tokens)," ".join(toks(piece)),autojunk=False).ratio()
            status="HIGH" if s>=.90 and refs(mk1)<=refs(piece) else "REVIEW" if s>=.70 else "UNMATCHED"
            results.append({"index":i+j+1,"en":src,"mk1":mk1,"status":status,"target":piece,"reason":"Candidate requires human review." if status=="REVIEW" else "Candidate below threshold."})
            local=end
        cursor+=ac
    # conservative boundary ownership guard
    for a,b in zip(results,results[1:]):
        if a["target"] and b["target"] and a["target"][-1].isalnum() and b["target"][0].isalnum() and min(len(a["target"]),len(b["target"]))<=4:
            a["status"]=b["status"]="MANUAL_BOUNDARY"; a["reason"]=b["reason"]="Boundary fragment; adjacent units split a word."
    return results

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--export",action="store_true",help="write accepted TMXs") ; args=ap.parse_args()
    OUT.mkdir(parents=True,exist_ok=True); summary=[]; totals={"documents_processed":0,"documents_skipped":0,"original_tus":0,"accepted_tus":0,"skipped_tus":0,"clean_en_chars":0,"clean_mk2_chars":0}
    performance=[]; batch_started=time.perf_counter()
    with META.open(encoding="utf-8-sig",newline="") as f: rows=list(csv.DictReader(f))
    for meta in rows:
        if totals["documents_processed"] >= 20 or time.perf_counter()-batch_started >= 180: break
        if meta.get("Sure_Set","").lower()!="true": continue
        document_started=time.perf_counter(); discovery_started=document_started
        celex=meta["DocumentID"]; tmxs=list((CORPUS/"Documents"/celex/"TMX_MK1").glob("*.tmx")); mk2s=[Path(meta["MK2_File"])] if meta.get("MK2_File") else list((CORPUS/"Documents"/celex/"MK2").glob("*.docx"))
        discovery_seconds=time.perf_counter()-discovery_started
        base={"CELEX":celex,"TMX path":str(tmxs[0]) if len(tmxs)==1 else "","MK2 path":str(mk2s[0]) if len(mk2s)==1 else "","original TUs":0,"accepted TUs":0,"skipped TUs":0,"acceptance %":"0.00","MK1 coverage":"0.00","MK2 coverage":"0.00","output TMX path":"","status":"SKIPPED","skip reason":""}
        audit={"celex":celex,"dry_run":not args.export,"source_candidates":[str(x) for x in tmxs],"mk2_candidates":[str(x) for x in mk2s]}
        tmx_seconds=mk2_seconds=reconciliation_seconds=0.0
        if len(tmxs)!=1 or len(mk2s)!=1 or not mk2s[0].exists() or tmxs[0].suffix.lower()!=".tmx": base["skip reason"]="ambiguous or missing final/source variant"; totals["documents_skipped"]+=1
        else:
            try:
                started=time.perf_counter(); root,units=tmx_units(tmxs[0]); tmx_seconds=time.perf_counter()-started
                started=time.perf_counter(); atoms,extraction=extract_mk2(mk2s[0]); mk2_seconds=time.perf_counter()-started
                started=time.perf_counter(); results=reconcile(units,atoms); reconciliation_seconds=time.perf_counter()-started
                accepted=[r for r in results if r["status"]=="HIGH" and r["target"] and not refs(r["mk1"])-refs(r["target"])]
                base.update({"original TUs":len(units),"accepted TUs":len(accepted),"skipped TUs":len(units)-len(accepted),"acceptance %":f"{100*len(accepted)/max(1,len(units)):.2f}","MK1 coverage":f"{100*sum(len(r['mk1']) for r in accepted)/max(1,sum(len(u[1]) for u in units)):.2f}","MK2 coverage":f"{100*sum(len(r['target']) for r in accepted)/max(1,sum(len(a) for a in atoms)):.2f}","status":"DRY_RUN" if not args.export else "EXPORTED"})
                totals["documents_processed"]+=1; totals["original_tus"]+=len(units); totals["accepted_tus"]+=len(accepted); totals["skipped_tus"]+=len(units)-len(accepted); totals["clean_en_chars"]+=sum(len(r["en"]) for r in accepted); totals["clean_mk2_chars"]+=sum(len(r["target"]) for r in accepted)
                if args.export:
                    out=OUT/f"{celex}_TM_MK2.tmx"; new=deepcopy(root); body=new.find("body");
                    for idx,tu in reversed(list(enumerate(body.findall("tu"),1))):
                        row=next((r for r in accepted if r["index"]==idx),None)
                        if not row: body.remove(tu); continue
                        mk=next(x for x in tu.findall("tuv") if x.get(XML_LANG,"").lower().startswith("mk")); mk.find("seg").clear(); mk.find("seg").text=row["target"]
                    ET.indent(new,space="  "); new.write(out,encoding="utf-8",xml_declaration=True); base["output TMX path"]=str(out)
                audit.update({"original_tmx_sha256":sha(tmxs[0]),"mk2_sha256":sha(mk2s[0]),"extraction":extraction,"results":results,"accepted_indices":[r["index"] for r in accepted]})
            except Exception as e:
                base["status"]="SKIPPED"; base["skip reason"]=str(e); totals["documents_skipped"]+=1
                audit["extraction"]={"format":mk2s[0].suffix.lower().lstrip("."),"paragraphs":0,"table cells":0,"characters":0,"extraction method":"not completed","error":str(e)}
        writing_started=time.perf_counter()
        (OUT/f"{celex}.audit.json").write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding="utf-8")
        writing_seconds=time.perf_counter()-writing_started
        total_seconds=time.perf_counter()-document_started
        performance.append({"CELEX":celex,"status":base["status"],"file_discovery_seconds":discovery_seconds,"tmx_parsing_seconds":tmx_seconds,"mk2_extraction_seconds":mk2_seconds,"reconciliation_seconds":reconciliation_seconds,"audit_output_writing_seconds":writing_seconds,"total_seconds":total_seconds,"TUs":base["original TUs"],"MK2_characters":audit.get("extraction",{}).get("characters",0)})
        summary.append(base)
    with (OUT/"batch_summary.csv").open("w",encoding="utf-8",newline="") as f: csv.DictWriter(f,fieldnames=summary[0].keys()).writeheader(); csv.DictWriter(f,fieldnames=summary[0].keys()).writerows(summary)
    (OUT/"batch_totals.json").write_text(json.dumps(totals,ensure_ascii=False,indent=2),encoding="utf-8"); print(json.dumps(totals,ensure_ascii=False))
    with (OUT/"batch_performance.csv").open("w",encoding="utf-8",newline="") as f:
        fields=list(performance[0].keys()) if performance else ["CELEX"]
        writer=csv.DictWriter(f,fieldnames=fields); writer.writeheader(); writer.writerows(performance)
    elapsed=time.perf_counter()-batch_started
    eligible=sum(1 for row in rows if row.get("Sure_Set","").lower()=="true")
    processed_times=[row["total_seconds"] for row in performance if row["status"]!="SKIPPED"]
    estimate=(sum(processed_times)/len(processed_times)*eligible) if processed_times else None
    (OUT/"batch_performance.json").write_text(json.dumps({"documents_measured":len(performance),"eligible_documents":eligible,"elapsed_seconds":elapsed,"estimated_all_eligible_seconds":estimate,"documents":performance},ensure_ascii=False,indent=2),encoding="utf-8")
if __name__=="__main__": main()
