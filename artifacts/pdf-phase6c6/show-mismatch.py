import json,xml.etree.ElementTree as E
r=E.parse('artifacts/pdf-phase6c6/studio-input/validated-docx-corrected.sdlxliff').getroot(); n={'x':'urn:oasis:names:tc:xliff:document:1.2'}; u=r.findall('.//x:trans-unit',n); c=json.load(open('artifacts/pdf-phase6c6/canonical-tus.json',encoding='utf-8'))
for i in [26,46,67,68,69,70,74,82,91,111,170,173,252,255,257,261,263]:
 print('CAN',i,repr(c[i]['source_text'][:180])); print('STU',i,repr(''.join(u[i].find('x:source',n).itertext())[:180]))
