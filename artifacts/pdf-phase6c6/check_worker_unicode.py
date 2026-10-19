from pathlib import Path
from app.canonical import canonicalize_docx
import json
doc=Path(r'D:\EU Acquis AI App\artifacts\pdf-phase6c4\controlled-run-readback\validated-docx.docx')
b,_=canonicalize_docx(doc,validated_docx_artifact_id='b0e8fec5-91c8-4755-87a4-ff8f6dd8d307',validated_docx_sha256='2dc5da5384974468da3d1711f6194e03187274f225a9ef99dcc3027b3ee5a971')
e=json.loads(b)
for i in [26,46,67]: print(i,repr(e['translationUnits'][i]['source_text'][:80]),[hex(ord(x)) for x in e['translationUnits'][i]['source_text'] if ord(x)>127][:8])
