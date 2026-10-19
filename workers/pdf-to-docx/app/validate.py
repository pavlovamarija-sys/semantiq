import io
import posixpath
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree as ET

from .errors import WorkerError

CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
FOOTNOTES_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes"
MAIN_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
FOOTNOTES_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"
W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006"
REQUIRED = {"[Content_Types].xml", "_rels/.rels", "word/document.xml"}


def _xml(archive: zipfile.ZipFile, name: str):
    try:
        return ET.fromstring(archive.read(name))
    except (KeyError, ET.ParseError) as error:
        raise WorkerError("ooxml_validation_failed", f"Malformed or missing OOXML part: {name}.", details={"reason": str(error)}) from error


def _target(source: str, target: str) -> str:
    clean = unquote(urlsplit(target).path).replace("\\", "/")
    resolved = clean.lstrip("/") if clean.startswith("/") else posixpath.normpath(posixpath.join(posixpath.dirname(source), clean))
    if resolved == ".." or resolved.startswith("../"):
        raise WorkerError("ooxml_validation_failed", "An OOXML relationship escapes the package.")
    return resolved


def validate_docx(path: Path) -> dict[str, int]:
    if not zipfile.is_zipfile(path):
        raise WorkerError("ooxml_validation_failed", "Generated output is not a ZIP-based DOCX package.")
    with zipfile.ZipFile(path) as archive:
        corrupt = archive.testzip()
        names = set(archive.namelist())
        if corrupt or REQUIRED - names:
            raise WorkerError("ooxml_validation_failed", "Generated DOCX is corrupt or missing required OOXML parts.", details={"corruptPart": corrupt, "missingParts": sorted(REQUIRED - names)})
        types = _xml(archive, "[Content_Types].xml")
        overrides = {node.get("PartName", "").lstrip("/"): node.get("ContentType") for node in types.findall(f"{{{CONTENT_TYPES_NS}}}Override")}
        if overrides.get("word/document.xml") != MAIN_TYPE:
            raise WorkerError("ooxml_validation_failed", "The package does not declare a WordprocessingML main document.")
        roots = _xml(archive, "_rels/.rels")
        main = [_target("", rel.get("Target", "")) for rel in roots.findall(f"{{{REL_NS}}}Relationship") if rel.get("Type") == OFFICE_REL]
        if main != ["word/document.xml"]:
            raise WorkerError("ooxml_validation_failed", "The package has no unique Word main-document relationship.")
        for rel_name in (name for name in names if name.endswith(".rels")):
            source = "" if rel_name == "_rels/.rels" else str(PurePosixPath(rel_name).parent.parent / PurePosixPath(rel_name).name.removesuffix(".rels"))
            for rel in _xml(archive, rel_name).findall(f"{{{REL_NS}}}Relationship"):
                if rel.get("TargetMode") != "External" and _target(source, rel.get("Target", "")) not in names:
                    raise WorkerError("ooxml_validation_failed", f"Broken relationship in {rel_name}.")
        for name in (name for name in names if name.endswith(".xml")):
            data = archive.read(name)
            namespaces = {prefix or "": uri for _, (prefix, uri) in ET.iterparse(io.BytesIO(data), events=("start-ns",))}
            root = _xml(archive, name)
            missing = [prefix for prefix in root.get(f"{{{MC_NS}}}Ignorable", "").split() if prefix not in namespaces]
            if missing:
                raise WorkerError("ooxml_validation_failed", f"Undeclared compatibility namespace in {name}.", details={"prefixes": missing})
        document = _xml(archive, "word/document.xml")
        characters = sum(len(node.text or "") for node in document.iter(f"{{{W_NS}}}t"))
        if characters == 0:
            raise WorkerError("ooxml_validation_failed", "Generated DOCX contains no editable text.")
        references = [node.get(f"{{{W_NS}}}id") for node in document.iter(f"{{{W_NS}}}footnoteReference")]
        footnote_count = 0
        if references:
            if "word/footnotes.xml" not in names or overrides.get("word/footnotes.xml") != FOOTNOTES_TYPE:
                raise WorkerError("ooxml_validation_failed", "Footnote references exist without a declared footnotes part.")
            document_rels = _xml(archive, "word/_rels/document.xml.rels")
            footnote_targets = [
                _target("word/document.xml", rel.get("Target", ""))
                for rel in document_rels.findall(f"{{{REL_NS}}}Relationship")
                if rel.get("Type") == FOOTNOTES_REL
            ]
            if footnote_targets != ["word/footnotes.xml"]:
                raise WorkerError("ooxml_validation_failed", "The document must have exactly one footnotes relationship.")
            footnotes = _xml(archive, "word/footnotes.xml")
            note_ids = [
                note.get(f"{{{W_NS}}}id") for note in footnotes.findall(f"{{{W_NS}}}footnote")
                if note.get(f"{{{W_NS}}}type") is None and int(note.get(f"{{{W_NS}}}id", "-1")) >= 0
            ]
            footnote_count = len(note_ids)
            if len(references) != len(set(references)) or set(references) != set(note_ids):
                raise WorkerError("ooxml_validation_failed", "Footnote references and footnote definitions do not match one-to-one.")
        elif "word/footnotes.xml" in names:
            footnotes = _xml(archive, "word/footnotes.xml")
            footnote_count = sum(
                note.get(f"{{{W_NS}}}type") is None and int(note.get(f"{{{W_NS}}}id", "-1")) >= 0
                for note in footnotes.findall(f"{{{W_NS}}}footnote")
            )
            if footnote_count:
                raise WorkerError("ooxml_validation_failed", "Footnote definitions exist without body references.")
        visible_text = []
        for name in names:
            if name == "word/document.xml" or (name.startswith(("word/header", "word/footer", "word/footnotes", "word/endnotes")) and name.endswith(".xml")):
                root = _xml(archive, name)
                visible_text.extend(node.text or "" for node in root.iter(f"{{{W_NS}}}t"))
        visible = "".join(visible_text)
        return {"parts": len(names), "footnotes": footnote_count, "editableCharacters": characters,
                "charactersWithoutSpaces": sum(not character.isspace() for character in visible),
                "charactersWithSpaces": sum(not character.isspace() or character in {" ", "\u00a0"} for character in visible)}

