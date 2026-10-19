import json, re, hashlib
from lxml import etree
from pathlib import Path
ns={'x':'urn:oasis:names:tc:xliff:document:1.2'}
root=etree.parse('artifacts/pdf-phase6c6/studio-input/validated-docx-corrected.sdlxliff')
units=root.xpath('//x:trans-unit',namespaces=ns); canonical=json.loads(Path('artifacts/pdf-phase6c6/canonical-tus.json').read_text(encoding='utf-8'))
def norm(s): return re.sub(r'\s+',' ',re.sub(r'(?<=\w)-\s+', '', s or '')).strip()
studio=[]
for u in units:
    src=u.find('x:source',ns); text=''.join(src.itertext()) if src is not None else ''
    ss=u.find('x:seg-source',ns); segs=ss.xpath('.//x:mrk[@mtype="seg"]',namespaces=ns) if ss is not None else []
    studio.append({'id':u.get('id'),'source':text,'norm':norm(text),'segments':len(segs) or (1 if ss is not None else 0),'codes':len(src.xpath('.//x:x|.//x:g|.//x:ph',namespaces=ns)) if src is not None else 0})
matches=[]; used=[]; cursor=0; ambiguous=[]
for i,t in enumerate(canonical):
    target=norm(t['source_text']); found=[j for j in range(cursor,len(studio)) if studio[j]['norm']==target]
    if not found: matches.append({'canonicalOrdinal':i,'canonicalId':t['id'],'status':'missing'}); continue
    j=found[0]; used.append(j); cursor=j+1; matches.append({'canonicalOrdinal':i,'canonicalId':t['id'],'studioTransUnitId':studio[j]['id'],'studioIndex':j,'segments':studio[j]['segments'],'status':'matched'})
    if len(found)>1: ambiguous.append({'canonicalOrdinal':i,'candidates':found})
unmatched=[{'studioIndex':i,'id':x['id'],'source':x['source']} for i,x in enumerate(studio) if i not in used]
print(json.dumps({'canonicalTUs':len(canonical),'studioTransUnits':len(studio),'studioSegments':sum(x['segments'] for x in studio),'matches':sum(x['status']=='matched' for x in matches),'missing':[x for x in matches if x['status']=='missing'],'ambiguous':ambiguous,'unmatchedStudio':unmatched[:20],'unmatchedCount':len(unmatched),'sourceOrderPass':not any(x['status']=='missing' for x in matches) and not ambiguous},indent=2))
