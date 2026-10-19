import hashlib,json,re
from pathlib import Path
from lxml import etree
p=Path('artifacts/pdf-phase6c6/studio-input/validated-docx-corrected.sdlxliff'); b=p.read_bytes(); text=b.decode('utf-8'); root=etree.fromstring(b); ns={'x':'urn:oasis:names:tc:xliff:document:1.2'}
hits=[]
for u in root.xpath('//x:trans-unit',namespaces=ns):
 for el in u.xpath('.//x:source|.//x:seg-source|.//x:target',namespaces=ns):
  s=''.join(el.itertext());
  for m in re.finditer('\ufffd',s): hits.append({'transUnitId':u.get('id'),'element':el.tag.rsplit('}',1)[-1],'textPosition':m.start(),'context':s[max(0,m.start()-30):m.start()+30]})
f=root.find('.//x:file',ns)
print(json.dumps({'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'rawUtf8ReplacementCount':text.count('\ufffd'),'xmlParsedReplacementCount':len(hits),'hits':hits,'fileAttributes':dict(f.attrib) if f is not None else None,'rawReplacementByte':b'\xef\xbf\xbd' in b},ensure_ascii=False,indent=2))
