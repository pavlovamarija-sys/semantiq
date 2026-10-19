import json,re,difflib
from lxml import etree
ns={'x':'urn:oasis:names:tc:xliff:document:1.2'}
root=etree.parse('artifacts/pdf-phase6c6/studio-input/validated-docx-corrected.sdlxliff'); us=root.xpath('//x:trans-unit',namespaces=ns); c=json.loads(open('artifacts/pdf-phase6c6/canonical-tus.json',encoding='utf-8').read())
def key(s): return re.sub(r'\s+',' ',re.sub(r'(?<=\w)-\s+','',s or '')).strip().lower()
s=[{'index':i,'id':u.get('id'),'text':''.join(u.find('x:source',ns).itertext()) if u.find('x:source',ns) is not None else ''} for i,u in enumerate(us)]
a=[key(x['source_text']) for x in c]; b=[key(x['text']) for x in s]
m=difflib.SequenceMatcher(a=a,b=b,autojunk=False); inv=[]
for tag,i1,i2,j1,j2 in m.get_opcodes():
 if tag!='equal': inv.append({'operation':tag,'canonicalRange':[i1,i2],'studioRange':[j1,j2],'canonical':[{'ordinal':i,'id':c[i]['id'],'text':c[i]['source_text']} for i in range(i1,i2)],'studio':[{'index':i,'id':s[i]['id'],'text':s[i]['text']} for i in range(j1,j2)]})
print(json.dumps({'canonicalCount':len(c),'studioCount':len(s),'opcodes':inv},ensure_ascii=False,indent=2))
