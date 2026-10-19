from __future__ import annotations
import hashlib, json, sys
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]; sys.path.insert(0,str(ROOT/'workers/pdf-to-docx'))
from app.reconstruction.pipeline import reconstruct_pdf
from app.reconstruction.core import assert_source_model_integrity, assert_text_integrity, render_docx_phase2b
OUT=ROOT/'artifacts/pdf-phase6a'; OUT.mkdir(parents=True,exist_ok=True)
CASES=[('32006L0114',ROOT/'workers/pdf-to-docx/tests/fixtures/32006L0114.pdf',ROOT/'artifacts/pdf-phase1/32006L0114-typed-model.json',3,48,100,None,None,3257),('32006L0126',ROOT/'artifacts/pdf-phase3/32006L0126-source.pdf',ROOT/'artifacts/pdf-phase3d/32006L0126-final-typed-model.json',3,128,264,28,1,18308),('32006L0042',ROOT/'artifacts/pdf-phase4/32006L0042-source.pdf',ROOT/'artifacts/pdf-phase4/typed-model.json',1,278,556,95,8,30124)]
def sha(p):
 h=hashlib.sha256();
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest().upper()
def main():
 rows=[]
 for celex,pdf,_,logical,rows_expected,cells_expected,merge,keep,tokens in CASES:
  model,decisions,diag=reconstruct_pdf(pdf,document_key=celex); tables=[n for n in model.children if n.type=='Table']; bd=[d for d in decisions if d.kind=='paragraph-boundary']; counts=Counter(d.outcome.upper() for d in bd); target=ROOT/'.tmp'/f'phase6a-{celex}.docx'; target.parent.mkdir(exist_ok=True); render_docx_phase2b(model,target); coverage=assert_source_model_integrity(model,diag['sourceReadingText'],diag['sourceSpanIds'],diag.get('excludedPageFurnitureSpanIds',[])); integrity=assert_text_integrity(model,target); out={'celex':celex,'sourcePdfSha256':sha(pdf),'status':'PASS','tables':len(tables),'logicalTables':len({t.attributes.get('logicalTableId',t.id) for t in tables}),'rows':sum(len(t.children) for t in tables),'cells':sum(len(r.children) for t in tables for r in t.children),'spans':len(diag['sourceSpanIds']),'tokens':len(__import__('re').findall(r'\S+',__import__('re').sub(r'\s+',' ',diag['sourceReadingText']).strip())),'boundaryCounts':dict(counts),'coverage':coverage,'textIntegrity':integrity,'expected':{'logicalTables':logical,'rows':rows_expected,'cells':cells_expected,'merge':merge,'keep':keep,'tokens':tokens}}
  physical_expected = 3 if celex == '32006L0114' else (5 if celex == '32006L0126' else 8)
  if out['tables'] != physical_expected or out['logicalTables'] != logical or out['rows']!=rows_expected or out['cells']!=cells_expected or coverage['status']!='PASS' or integrity['status']!='PASS': out['status']='FAIL'
  if merge is not None and counts['MERGE']!=merge: out['status']='FAIL'
  if keep is not None and counts['KEEP_BOUNDARY']!=keep: out['status']='FAIL'
  if out['tokens']!=tokens: out['status']='FAIL'
  (OUT/f'regression-{celex}.json').write_text(json.dumps(out,indent=2),encoding='utf8'); rows.append(out)
 (OUT/'spike-vs-production-comparison.json').write_text(json.dumps({'status':'PASS' if all(x['status']=='PASS' for x in rows) else 'FAIL','cases':rows,'comparison':'The inactive facade delegates to the validated spike core; no material output difference is possible until the inference core is physically moved.'},indent=2),encoding='utf8')
 print(json.dumps(rows,indent=2))
if __name__=='__main__':main()
