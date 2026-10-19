"""Structural OOXML validation for Transformer V1 DOCX output."""

from __future__ import annotations

import argparse
import hashlib
import json
import posixpath
import io
import re
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree as ET


CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
OFFICE_DOCUMENT_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
WORD_DOCUMENT_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006"
VALID_MEASUREMENT_UNITS = {"inches", "centimeters", "millimeters", "points", "picas"}
REQUIRED_PARTS = {"[Content_Types].xml", "_rels/.rels", "word/document.xml"}
ACT_TITLE = re.compile(r"^(?:(?:THE\s+)?(?:COUNCIL|COMMISSION|EUROPEAN\s+PARLIAMENT(?:\s+AND\s+THE\s+COUNCIL)?)\s+)?(?:DIRECTIVE|REGULATION|DECISION)\b", re.IGNORECASE)
ACT_DATE = re.compile(r"^of\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*$", re.IGNORECASE)
ACT_NUMBER = re.compile(
    r"^(?:\(?(?:\d{2,4}\s*/\s*\d+\s*/\s*(?:EU|EC|EEC|ECSC|EURATOM))\)?"
    r"|\((?:EU|EC|EEC|ECSC|EURATOM)\)\s+(?:No\.?\s+)?\d{2,4}\s*/\s*\d+"
    r"|(?:EU|EC|EEC|ECSC|EURATOM)\s+(?:No\.?\s+)?\d{2,4}\s*/\s*\d+)$",
    re.IGNORECASE,
)
CHAPTER_OR_SECTION = re.compile(r"^(?:CHAPTER|SECTION)\s+(?:[IVXLCDM]+|\d+|[A-Z])\s*$", re.IGNORECASE)
ARTICLE = re.compile(r"^ARTICLE\s+\d+[A-Z]?(?:\s*[-\u2013\u2014:].*)?$", re.IGNORECASE)
ANNEX_START = re.compile(r"^\s*ANNEX(?:\s+(?:[IVXLCDM]+|[0-9]+|[A-Z]))?(?:\s*[-\u2013\u2014:.)]|\s*$)", re.IGNORECASE)
REFERENCE_BLOCK = re.compile(r"^\(\d+\)\s+OJ\s+(?:No\.?\s+)?[A-Z]\b", re.IGNORECASE)
BODY_START = re.compile(r"^(?:whereas\b|\(\d+\)\s+(?!OJ\b)|\d+[.)]\s|[a-z][.)]\s|the\s+(?:council|commission|member\s+states?)\b)", re.IGNORECASE)
PAGE_GEOMETRY = {
    "portrait": {
        "width": 12240, "height": 15840,
        "margins": {"top": 1440, "bottom": 1440, "left": 1797, "right": 1797},
    },
    "landscape": {
        "width": 15840, "height": 12240,
        "margins": {"top": 680, "bottom": 680, "left": 680, "right": 680},
    },
}


class DocxValidationError(ValueError):
    pass


def count_visible_characters(path: Path) -> dict[str, int]:
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        values: list[str] = []
        for name in sorted(names):
            if name == "word/document.xml" or re.fullmatch(r"word/(?:header|footer|footnotes|endnotes)\d*\.xml", name):
                root = ET.fromstring(archive.read(name))
                values.extend(node.text or "" for node in root.iter(f"{{{WORD_NS}}}t"))
    visible = "".join(values)
    return {
        "charactersWithoutSpaces": sum(not character.isspace() for character in visible),
        "charactersWithSpaces": sum(not character.isspace() or character in {" ", "\u00a0"} for character in visible),
    }


def _is_structural_title(text: str) -> bool:
    return bool(text and len(text) <= 80 and not BODY_START.match(text)
                and not text.endswith((".", ";"))
                and not re.search(r"[,;:]|\b(?:shall|must|means|is|are|provides?|applies?)\b", text, re.IGNORECASE))


def _classify_paragraphs(texts: list[str]) -> list[str]:
    result: list[str] = []
    title_block = False
    structural_title_pending = False
    for raw_text in texts:
        text = " ".join(raw_text.split())
        if not text:
            result.append("empty")
        elif ACT_NUMBER.fullmatch(text):
            result.append("title-block-identifier")
            title_block = False
        elif ACT_TITLE.match(text):
            result.append("title-block")
            title_block = True
        elif title_block and (ACT_DATE.match(text) or text.lower().startswith("on ")):
            result.append("title-block")
        elif CHAPTER_OR_SECTION.match(text):
            result.append("chapter-or-section-heading")
            title_block = False
            structural_title_pending = True
        elif ARTICLE.match(text):
            result.append("article-heading")
            title_block = False
            structural_title_pending = True
        elif ANNEX_START.match(text):
            result.append("annex-heading")
            title_block = False
            structural_title_pending = True
        elif structural_title_pending and _is_structural_title(text):
            result.append("structural-title")
            title_block = False
            structural_title_pending = False
        elif REFERENCE_BLOCK.match(text):
            result.append("reference-block")
            title_block = False
            structural_title_pending = False
        else:
            result.append("body")
            title_block = False
            structural_title_pending = False
    return result


def _alignment_error(index: int, text: str, classification: str, actual: str, expected: str) -> DocxValidationError:
    return DocxValidationError(
        "Paragraph alignment mismatch: "
        f"paragraph index={index}; text={text!r}; classification={classification}; "
        f"actual alignment={actual or '<missing>'}; expected alignment={expected}"
    )


def _parse_xml(archive: zipfile.ZipFile, name: str) -> ET.Element:
    try:
        return ET.fromstring(archive.read(name))
    except ET.ParseError as error:
        raise DocxValidationError(f"Malformed XML part {name}: {error}") from error


def _validate_compatibility_namespaces(archive: zipfile.ZipFile, name: str) -> None:
    data = archive.read(name)
    namespaces = {prefix or "": uri for _, (prefix, uri) in ET.iterparse(io.BytesIO(data), events=("start-ns",))}
    root = ET.fromstring(data)
    ignored = root.get(f"{{{MC_NS}}}Ignorable", "").split()
    missing = sorted(prefix for prefix in ignored if prefix not in namespaces)
    if missing:
        raise DocxValidationError(f"{name} has mc:Ignorable prefixes without namespace declarations: {', '.join(missing)}")


def _relationship_source(rels_name: str) -> str:
    if rels_name == "_rels/.rels":
        return ""
    parent = PurePosixPath(rels_name).parent
    if parent.name != "_rels" or not rels_name.endswith(".rels"):
        raise DocxValidationError(f"Invalid relationships part path: {rels_name}")
    return str(parent.parent / PurePosixPath(rels_name).name.removesuffix(".rels"))


def _resolve_target(source_part: str, target: str) -> str:
    clean_target = unquote(urlsplit(target).path).replace("\\", "/")
    if clean_target.startswith("/"):
        resolved = clean_target.lstrip("/")
    else:
        resolved = posixpath.normpath(posixpath.join(posixpath.dirname(source_part), clean_target))
    if resolved == ".." or resolved.startswith("../"):
        raise DocxValidationError(f"Relationship target escapes the package: {target}")
    return resolved


def _validate_section_geometry(section: ET.Element) -> dict[str, int | str]:
    page_size = section.find(f"{{{WORD_NS}}}pgSz")
    margins = section.find(f"{{{WORD_NS}}}pgMar")
    if page_size is None or margins is None:
        raise DocxValidationError("DOCX section has incomplete page geometry")
    try:
        width = int(page_size.get(f"{{{WORD_NS}}}w", ""))
        height = int(page_size.get(f"{{{WORD_NS}}}h", ""))
        actual_margins = {
            side: int(margins.get(f"{{{WORD_NS}}}{side}", ""))
            for side in ("top", "bottom", "left", "right")
        }
    except ValueError as error:
        raise DocxValidationError("DOCX section page geometry is not expressed in valid twips") from error
    orientation = page_size.get(f"{{{WORD_NS}}}orient", "portrait")
    if orientation not in PAGE_GEOMETRY:
        raise DocxValidationError(f"DOCX section has unsupported page orientation: {orientation!r}")
    expected = PAGE_GEOMETRY[orientation]
    if width != expected["width"] or height != expected["height"]:
        raise DocxValidationError(
            f"DOCX {orientation} section has invalid page dimensions: {width}x{height} twips"
        )
    if actual_margins != expected["margins"]:
        raise DocxValidationError(
            f"DOCX {orientation} section has invalid margins: {actual_margins}; expected {expected['margins']}"
        )
    return {
        "orientation": orientation,
        "printable_width": width - actual_margins["left"] - actual_margins["right"],
    }


def _section_for_body_child(body: ET.Element, child_index: int) -> ET.Element:
    children = list(body)
    for child in children[child_index:]:
        if child.tag == f"{{{WORD_NS}}}sectPr":
            return child
        if child.tag == f"{{{WORD_NS}}}p":
            properties = child.find(f"{{{WORD_NS}}}pPr")
            section = properties.find(f"{{{WORD_NS}}}sectPr") if properties is not None else None
            if section is not None:
                return section
    raise DocxValidationError("DOCX body content is not associated with section properties")


def validate_docx(path: Path) -> dict[str, object]:
    if not path.is_file():
        raise DocxValidationError("Generated DOCX does not exist")
    if path.stat().st_size < 4 or path.read_bytes()[:4] != b"PK\x03\x04":
        raise DocxValidationError("Generated file is not a ZIP-based DOCX package")
    if not zipfile.is_zipfile(path):
        raise DocxValidationError("Generated file has an invalid ZIP central directory")

    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)

    with zipfile.ZipFile(path) as archive:
        corrupt_part = archive.testzip()
        if corrupt_part:
            raise DocxValidationError(f"DOCX ZIP CRC validation failed for {corrupt_part}")
        names = set(archive.namelist())
        missing = sorted(REQUIRED_PARTS - names)
        if missing:
            raise DocxValidationError(f"DOCX is missing required parts: {', '.join(missing)}")

        content_types = _parse_xml(archive, "[Content_Types].xml")
        defaults = {
            item.get("Extension", "").lower(): item.get("ContentType", "")
            for item in content_types.findall(f"{{{CONTENT_TYPES_NS}}}Default")
        }
        overrides = {
            item.get("PartName", "").lstrip("/"): item.get("ContentType", "")
            for item in content_types.findall(f"{{{CONTENT_TYPES_NS}}}Override")
        }
        if overrides.get("word/document.xml") != WORD_DOCUMENT_CONTENT_TYPE:
            raise DocxValidationError("word/document.xml has an invalid or missing DOCX main content type")
        for name in names:
            if name.endswith("/") or name == "[Content_Types].xml":
                continue
            extension = "rels" if name.endswith(".rels") else PurePosixPath(name).suffix.lstrip(".").lower()
            if name not in overrides and extension not in defaults:
                raise DocxValidationError(f"No content type is declared for package part {name}")

        root_relationships = _parse_xml(archive, "_rels/.rels")
        main_targets = []
        for relationship in root_relationships.findall(f"{{{RELATIONSHIPS_NS}}}Relationship"):
            if relationship.get("Type") == OFFICE_DOCUMENT_REL:
                main_targets.append(_resolve_target("", relationship.get("Target", "")))
        if main_targets != ["word/document.xml"]:
            raise DocxValidationError("Package must have exactly one officeDocument relationship to word/document.xml")

        relationship_count = 0
        for rels_name in sorted(name for name in names if name.endswith(".rels")):
            source_part = _relationship_source(rels_name)
            relationships = _parse_xml(archive, rels_name)
            seen_ids: set[str] = set()
            for relationship in relationships.findall(f"{{{RELATIONSHIPS_NS}}}Relationship"):
                relationship_count += 1
                rel_id = relationship.get("Id", "")
                if not rel_id or rel_id in seen_ids:
                    raise DocxValidationError(f"Invalid or duplicate relationship Id in {rels_name}")
                seen_ids.add(rel_id)
                if relationship.get("TargetMode") == "External":
                    continue
                target = _resolve_target(source_part, relationship.get("Target", ""))
                if target not in names:
                    raise DocxValidationError(f"Broken relationship in {rels_name}: missing {target}")

        document = _parse_xml(archive, "word/document.xml")
        if document.tag != f"{{{WORD_NS}}}document" or document.find(f"{{{WORD_NS}}}body") is None:
            raise DocxValidationError("word/document.xml is not a valid Word document body")
        for name in sorted(item for item in names if item.endswith(".xml")):
            _parse_xml(archive, name)
            _validate_compatibility_namespaces(archive, name)

        body = document.find(f"{{{WORD_NS}}}body")
        paragraphs = list(body.iter(f"{{{WORD_NS}}}p"))
        tables = list(body.iter(f"{{{WORD_NS}}}tbl"))
        editable_characters = sum(len(node.text or "") for node in body.iter(f"{{{WORD_NS}}}t"))
        if editable_characters == 0:
            raise DocxValidationError("DOCX contains no editable Word text")
        sections = list(body.iter(f"{{{WORD_NS}}}sectPr"))
        if not sections:
            raise DocxValidationError("DOCX has no section properties")
        for section in sections:
            _validate_section_geometry(section)
            columns = section.find(f"{{{WORD_NS}}}cols")
            if columns is not None and columns.get(f"{{{WORD_NS}}}num", "1") != "1":
                raise DocxValidationError("DOCX section is not one-column")
        for child_index, child in enumerate(list(body)):
            if child.tag != f"{{{WORD_NS}}}tbl":
                continue
            section_geometry = _validate_section_geometry(_section_for_body_child(body, child_index))
            grid_widths = [
                int(column.get(f"{{{WORD_NS}}}w", "0"))
                for column in child.findall(f"./{{{WORD_NS}}}tblGrid/{{{WORD_NS}}}gridCol")
            ]
            if not grid_widths or any(width <= 0 for width in grid_widths):
                raise DocxValidationError("DOCX table has an invalid or missing column grid")
            if sum(grid_widths) > int(section_geometry["printable_width"]):
                raise DocxValidationError(
                    f"DOCX table width {sum(grid_widths)} exceeds the {section_geometry['orientation']} "
                    f"section printable width {section_geometry['printable_width']}"
                )

        legal_label = re.compile(r"^\s*\([a-z]+\)(?:\s|\u00a0)", re.IGNORECASE)
        paragraph_texts = ["".join(node.text or "" for node in paragraph.iter(f"{{{WORD_NS}}}t")) for paragraph in paragraphs]
        classifications = _classify_paragraphs(paragraph_texts)
        table_paragraphs = {
            id(paragraph)
            for table in tables
            for paragraph in table.iter(f"{{{WORD_NS}}}p")
        }
        has_semantic_headings = any(
            (paragraph.find(f"{{{WORD_NS}}}pPr") is not None
             and paragraph.find(f"{{{WORD_NS}}}pPr/{{{WORD_NS}}}outlineLvl") is not None)
            for paragraph in paragraphs
        )
        for index, paragraph in enumerate(paragraphs):
            text = paragraph_texts[index]
            classification = classifications[index]
            properties = paragraph.find(f"{{{WORD_NS}}}pPr")
            if legal_label.match(text) and properties is not None and properties.find(f"{{{WORD_NS}}}numPr") is not None:
                raise DocxValidationError("A literal legal subdivision was converted to automatic numbering")
            if not text.strip():
                continue
            justification = properties.find(f"{{{WORD_NS}}}jc") if properties is not None else None
            actual_alignment = justification.get(f"{{{WORD_NS}}}val", "") if justification is not None else ""
            outline = properties.find(f"{{{WORD_NS}}}outlineLvl") if properties is not None else None
            semantic_heading = outline is not None
            if id(paragraph) in table_paragraphs:
                allowed_alignments = {"left", "both", "center", "right"}
                expected_alignment = "an explicit table-cell alignment"
            elif semantic_heading:
                allowed_alignments = {"left", "center", "right"}
                expected_alignment = "an explicit source-derived heading alignment"
            else:
                effective_classification = "body" if has_semantic_headings else classification
                expected_alignment = "both" if effective_classification == "body" else "center"
                allowed_alignments = {expected_alignment}
            if actual_alignment not in allowed_alignments:
                raise _alignment_error(index, text, classification, actual_alignment, expected_alignment)
            spacing = properties.find(f"{{{WORD_NS}}}spacing") if properties is not None else None
            spacing_classification = "body" if has_semantic_headings else classification
            expected_spacing = ({"before": "0", "after": "0", "line": "240", "lineRule": "auto"}
                                if spacing_classification == "reference-block"
                                else {"before": "120", "after": "120", "line": "240", "lineRule": "auto"})
            if spacing is None or any(spacing.get(f"{{{WORD_NS}}}{key}") != value for key, value in expected_spacing.items()):
                raise DocxValidationError(
                    f"Paragraph spacing mismatch: paragraph index={index}; text={text!r}; "
                    f"classification={classification}; expected spacing={expected_spacing}"
                )

        footnote_count = 0
        if "word/footnotes.xml" in names:
            footnotes_root = _parse_xml(archive, "word/footnotes.xml")
            footnote_count = sum(1 for note in footnotes_root.findall(f"{{{WORD_NS}}}footnote")
                                 if note.get(f"{{{WORD_NS}}}type") is None
                                 and int(note.get(f"{{{WORD_NS}}}id", "-1")) >= 0)
            for note in footnotes_root.findall(f"{{{WORD_NS}}}footnote"):
                if note.get(f"{{{WORD_NS}}}type") is not None or int(note.get(f"{{{WORD_NS}}}id", "-1")) < 0:
                    continue
                for paragraph in note.iter(f"{{{WORD_NS}}}p"):
                    properties = paragraph.find(f"{{{WORD_NS}}}pPr")
                    spacing = properties.find(f"{{{WORD_NS}}}spacing") if properties is not None else None
                    expected = {"before": "0", "after": "0", "line": "240", "lineRule": "auto"}
                    if spacing is None or any(spacing.get(f"{{{WORD_NS}}}{key}") != value for key, value in expected.items()):
                        raise DocxValidationError("A footnote does not use required zero/single spacing")
                for run in note.iter(f"{{{WORD_NS}}}r"):
                    properties = run.find(f"{{{WORD_NS}}}rPr")
                    size = properties.find(f"{{{WORD_NS}}}sz") if properties is not None else None
                    if size is None or size.get(f"{{{WORD_NS}}}val") != "20":
                        raise DocxValidationError("A footnote run is not 10 pt")

        if "word/settings.xml" in names:
            settings = _parse_xml(archive, "word/settings.xml")
            measurement = settings.find(f"{{{WORD_NS}}}measurementUnit")
            if measurement is not None:
                value = measurement.get(f"{{{WORD_NS}}}val", "")
                if value not in VALID_MEASUREMENT_UNITS:
                    raise DocxValidationError(f"Invalid Word measurementUnit value: {value!r}")

        visible_text = []
        for name in sorted(names):
            if not (name == "word/document.xml" or re.fullmatch(r"word/(?:header|footer|footnotes|endnotes)\d*\.xml", name)):
                continue
            root = _parse_xml(archive, name)
            visible_text.extend(node.text or "" for node in root.iter(f"{{{WORD_NS}}}t"))
        visible = "".join(visible_text)
        characters_with_spaces = sum(not character.isspace() or character in {" ", "\u00a0"} for character in visible)
        characters_without_spaces = sum(not character.isspace() for character in visible)

    return {
        "bytes": path.stat().st_size,
        "sha256": digest.hexdigest(),
        "parts": len(names),
        "relationships": relationship_count,
        "paragraphs": len(paragraphs),
        "tables": len(tables),
        "footnotes": footnote_count,
        "editableCharacters": editable_characters,
        "charactersWithoutSpaces": characters_without_spaces,
        "charactersWithSpaces": characters_with_spaces,
        "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a generated DOCX OOXML package.")
    parser.add_argument("document", type=Path)
    parser.add_argument("--counts-only", action="store_true")
    args = parser.parse_args()
    if args.counts_only:
        print(json.dumps(count_visible_characters(args.document), sort_keys=True))
        return
    print(json.dumps(validate_docx(args.document), sort_keys=True))


if __name__ == "__main__":
    main()
