import json,xml.etree.ElementTree as E
r=E.parse('artifacts/pdf-phase6c6/studio-input/validated-docx-corrected.sdlxliff').getroot(); n={'x':'urn:oasis:names:tc:xliff:document:1.2'}; u=r.findall('.//x:trans-unit',n); c=json.load(open('artifacts/pdf-phase6c6/canonical-tus.json',encoding='utf-8'))
for ci,si in [(26,26),(46,47),(67,68)]:
 a=c[ci]['source_text']; b=''.join(u[si].find('x:source',n).itertext()); dif=[(i,ord(x),ord(y)) for i,(x,y) in enumerate(zip(a,b)) if x!=y]
 print(ci,si,len(a),len(b),dif[:5], any(ord(x)==0xfffd for x in b))
