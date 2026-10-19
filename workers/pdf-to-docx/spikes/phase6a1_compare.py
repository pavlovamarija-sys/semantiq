from __future__ import annotations
import hashlib, json, re, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]; sys.path.insert(0,str(ROOT/'workers/pdf-to-docx'))
from app.reconstruction.core import build_typed_document as production_build, render_docx_phase2b as production_render
from spikes.typed_model_phase1 import build_typed_document as spike_build, render_docx_phase2b as spike_render, inspect_docx_structure, model_text
OUT=ROOT/'artifacts/pdf-phase6a1'; OUT.mkdir(parents=True,exist_ok=True)
CASES=[('32006L0114',ROOT/'workers/pdf-to-docx/tests/fixtures/32006L0114.pdf'),('32006L0126',ROOT/'artifacts/pdf-phase3/32006L0126-source.pdf'),('32006L0042',ROOT/'artifacts/pdf-phase4/32006L0042-source.pdf')]
def flat(n): return {'type':n.type,'id':n.id,'attributes':n.attributes,'text':model_text(n),'children':[flat(x) for x in n.children], 'source': [r.__dict__|{'boxes':[b.__dict__ for b in r.boxes]} for r in n.source]}
def main():
 rows=[]
 for celex,pdf in CASES:
  sm,sd,sg=spike_build(pdf,celex); pm,pd,pg=production_build(pdf,celex); a=ROOT/'.tmp'/f'phase6a1-spike-{celex}.docx'; b=ROOT/'.tmp'/f'phase6a1-production-{celex}.docx'; spike_render(sm,a); production_render(pm,b)
  sr=json.dumps(flat(sm),sort_keys=True,ensure_ascii=False); pr=json.dumps(flat(pm),sort_keys=True,ensure_ascii=False); sr_d=[x for x in sd if x.kind=='paragraph-boundary']; pr_d=[x for x in pd if x.kind=='paragraph-boundary']; item={'celex':celex,'status':'PASS' if sr==pr and len(sr_d)==len(pr_d) and inspect_docx_structure(a)==inspect_docx_structure(b) else 'FAIL','typedModelEqual':sr==pr,'decisionCountEqual':len(sr_d)==len(pr_d),'docxStructureEqual':inspect_docx_structure(a)==inspect_docx_structure(b),'spikeDocxSha256':hashlib.sha256(a.read_bytes()).hexdigest(),'productionDocxSha256':hashlib.sha256(b.read_bytes()).hexdigest()}; (OUT/f'spike-vs-production-{celex}.json').write_text(json.dumps(item,indent=2),encoding='utf8'); rows.append(item)
 (OUT/'docx-equivalence.json').write_text(json.dumps({'status':'PASS' if all(x['status']=='PASS' for x in rows) else 'FAIL','cases':rows},indent=2),encoding='utf8')
if __name__=='__main__':main()
