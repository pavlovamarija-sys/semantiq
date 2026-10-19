import base64, hashlib, json, re, zipfile, zlib
from pathlib import Path
from lxml import etree

path=Path('artifacts/pdf-phase6c6/studio-input/validated-docx-corrected.sdlxliff')
raw=path.read_bytes(); root=etree.fromstring(raw)
ns={'x':'urn:oasis:names:tc:xliff:document:1.2','sdl':'http://sdl.com/FileTypes/SdlXliff/1.0'}
f=root.find('.//x:file',ns)
units=root.xpath('.//x:trans-unit',namespaces=ns)
sources=[]; segs=[]; codes=[]
for u in units:
    src=u.find('x:source',ns)
    txt=''.join(src.itertext()) if src is not None else ''
    sources.append(txt)
    ss=u.find('x:seg-source',ns)
    if ss is not None:
        for m in ss.xpath('.//x:mrk[@mtype="seg"]',namespaces=ns): segs.append(''.join(m.itertext()))
        if not ss.xpath('.//x:mrk[@mtype="seg"]',namespaces=ns): segs.append(''.join(ss.itertext()))
    codes.extend(src.xpath('.//x:x|.//x:g|.//x:ph',namespaces=ns) if src is not None else [])
internal=root.find('.//x:internal-file',ns)
embedded_hash=None; embedded_size=None; embedded_name=None
if internal is not None and internal.text:
    b=base64.b64decode(re.sub(r'\s+','',internal.text))
    try: b=zlib.decompress(b)
    except zlib.error: pass
    embedded_hash=hashlib.sha256(b).hexdigest(); embedded_size=len(b)
    if b[:2]==b'PK':
        import io
        with zipfile.ZipFile(io.BytesIO(b)) as z:
            names=z.namelist(); embedded_name=names[0] if names else None
            if len(names)==1 and names[0].lower().endswith('.docx'):
                inner=z.read(names[0]); embedded_hash=hashlib.sha256(inner).hexdigest(); embedded_size=len(inner)
print(json.dumps({'sdlxliffSha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'original':f.get('original') if f is not None else None,'sourceLanguage':f.get('source-language') if f is not None else None,'targetLanguage':f.get('target-language') if f is not None else None,'transUnits':len(units),'sourceTexts':len(sources),'segments':len(segs),'inlineCodes':len(codes),'embeddedBytes':embedded_size,'embeddedSha256':embedded_hash,'embeddedDocx':embedded_name},indent=2))
