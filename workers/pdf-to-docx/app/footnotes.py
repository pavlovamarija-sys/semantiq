from __future__ import annotations

import copy
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

from lxml import etree

from .errors import WorkerError

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
XML_NS = "http://www.w3.org/XML/1998/namespace"
NS = {"w": W_NS}
MARKER = r"(?:\(\s*(?P<marker>\d+|[*'’�»x!])\s*\))"
NOTE_START = re.compile(MARKER + r"\s*OJ\s+No\b", re.I)


@dataclass(frozen=True)
class FootnoteRecord:
    id: int
    marker: str
    text: str


def _canonical(marker: str) -> str:
    if marker in {"*", "'", "’", "�", "»", "x"}:
        return "*"
    return "1" if marker == "!" else marker


def _paragraph_text(paragraph) -> str:
    return "".join(paragraph.xpath(".//w:t/text()", namespaces=NS))


def _split_notes(text: str) -> list[tuple[str, str]]:
    starts = list(NOTE_START.finditer(text))
    if not starts or starts[0].start() != 0:
        return []
    return [
        (
            _canonical(match.group("marker")),
            f"OJ No{text[match.end():starts[index + 1].start() if index + 1 < len(starts) else len(text)]}".strip(),
        )
        for index, match in enumerate(starts)
    ]


def _marker_pattern(marker: str) -> re.Pattern[str]:
    value = r"[*'’�»x]" if marker == "*" else re.escape(marker)
    # A source footnote call closes immediately after its marker in the OJ
    # corpus. Requiring that observable form avoids confusing e.g. the legal
    # subdivision "Article 4 ( 1 )" with the nearby footnote call "( 1)".
    return re.compile(rf"\(\s*{value}\)")


def _reference_properties(run) -> None:
    properties = etree.SubElement(run, f"{{{W_NS}}}rPr")
    etree.SubElement(properties, f"{{{W_NS}}}rStyle").set(f"{{{W_NS}}}val", "FootnoteReference")


def _marker_run(marker: str):
    run = etree.Element(f"{{{W_NS}}}r")
    _reference_properties(run)
    text = etree.SubElement(run, f"{{{W_NS}}}t")
    text.text = f"({marker})"
    return run


def _insert_reference(paragraph, pattern: re.Pattern[str], marker: str, footnote_id: int, *, automatic: bool) -> bool:
    matches = []
    for text_node in paragraph.xpath(".//w:t", namespaces=NS):
        matches.extend((text_node, match) for match in pattern.finditer(text_node.text or ""))
    if len(matches) != 1:
        return False
    text_node, match = matches[0]
    run = text_node.getparent()
    parent = run.getparent()
    index = parent.index(run)
    before, after = (text_node.text or "")[:match.start()], (text_node.text or "")[match.end():]
    text_node.text = before
    if before.startswith(" ") or before.endswith(" "):
        text_node.set(f"{{{XML_NS}}}space", "preserve")
    reference_run = etree.Element(f"{{{W_NS}}}r")
    _reference_properties(reference_run)
    reference = etree.SubElement(reference_run, f"{{{W_NS}}}footnoteReference")
    reference.set(f"{{{W_NS}}}id", str(footnote_id))
    parent.insert(index + 1, reference_run)
    if not automatic:
        reference.set(f"{{{W_NS}}}customMarkFollows", "1")
        parent.insert(index + 2, _marker_run(marker))
    if after:
        suffix = copy.deepcopy(run)
        suffix_texts = suffix.xpath(".//w:t", namespaces=NS)
        for node in suffix_texts:
            node.getparent().remove(node)
        suffix_text = etree.SubElement(suffix, f"{{{W_NS}}}t")
        suffix_text.text = after
        if after.startswith(" ") or after.endswith(" "):
            suffix_text.set(f"{{{XML_NS}}}space", "preserve")
        parent.insert(index + (3 if not automatic else 2), suffix)
    return True


def _footnotes_xml(records: list[FootnoteRecord], *, automatic: bool) -> bytes:
    root = etree.Element(f"{{{W_NS}}}footnotes", nsmap={"w": W_NS})
    for note_id, kind in ((-1, "separator"), (-2, "continuationSeparator")):
        note = etree.SubElement(root, f"{{{W_NS}}}footnote")
        note.set(f"{{{W_NS}}}id", str(note_id))
        paragraph = etree.SubElement(note, f"{{{W_NS}}}p")
        run = etree.SubElement(paragraph, f"{{{W_NS}}}r")
        etree.SubElement(run, f"{{{W_NS}}}{kind}")
    for record in records:
        note = etree.SubElement(root, f"{{{W_NS}}}footnote")
        note.set(f"{{{W_NS}}}id", str(record.id))
        if not automatic:
            note.set(f"{{{W_NS}}}customMarkFollows", "1")
        paragraph = etree.SubElement(note, f"{{{W_NS}}}p")
        run = etree.SubElement(paragraph, f"{{{W_NS}}}r")
        _reference_properties(run)
        etree.SubElement(run, f"{{{W_NS}}}footnoteRef")
        text_run = etree.SubElement(paragraph, f"{{{W_NS}}}r")
        text = etree.SubElement(text_run, f"{{{W_NS}}}t")
        text.set(f"{{{XML_NS}}}space", "preserve")
        text.text = f" {record.text}"
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


def _uses_sequential_numbering(note_groups: list[list[tuple[str, str]]]) -> bool:
    """Recognize ordinary numbering from structure, including a corrupt first glyph."""
    for group in note_groups:
        markers = [marker for marker, _ in group]
        numeric = [int(marker) for marker in markers if marker.isdigit()]
        if markers and all(marker.isdigit() for marker in markers):
            values = [int(marker) for marker in markers]
            if values == list(range(values[0], values[0] + len(values))):
                return True
        if len(markers) >= 2 and not markers[0].isdigit() and numeric == list(range(2, len(markers) + 1)):
            return True
    return False


def create_word_footnotes(path: Path) -> list[FootnoteRecord]:
    with zipfile.ZipFile(path) as source:
        entries = {item.filename: source.read(item.filename) for item in source.infolist()}
    document = etree.fromstring(entries["word/document.xml"])
    body = document.find(f"{{{W_NS}}}body")
    paragraphs = body.xpath(".//w:p", namespaces=NS)
    note_groups = [
        notes for paragraph in paragraphs
        if (notes := _split_notes(" ".join(_paragraph_text(paragraph).split())))
    ]
    automatic_numbering = _uses_sequential_numbering(note_groups)
    page_start = 0
    records: list[FootnoteRecord] = []
    remove = []
    for index, paragraph in enumerate(paragraphs):
        text = " ".join(_paragraph_text(paragraph).split())
        notes = _split_notes(text)
        if notes:
            for marker, note_text in notes:
                pattern = _marker_pattern(marker)
                candidates = [p for p in paragraphs[page_start:index] if pattern.search(_paragraph_text(p))]
                if not candidates and page_start:
                    candidates = [p for p in paragraphs[:page_start] if pattern.search(_paragraph_text(p))]
                if len(candidates) > 1:
                    citation_candidates = []
                    for candidate in candidates:
                        candidate_text = _paragraph_text(candidate)
                        candidate_match = pattern.search(candidate_text)
                        if candidate_match and re.search(r"\b\d+\s*/\s*\d+\s*/\s*EEC\s*$", candidate_text[:candidate_match.start()], re.I):
                            citation_candidates.append(candidate)
                    if len(citation_candidates) == 1:
                        candidates = citation_candidates
                if len(candidates) != 1:
                    raise WorkerError("footnotes_need_review", "Footnote matching needs review; source text was preserved.", details={"marker": marker, "candidateCount": len(candidates), "footnoteText": note_text})
                record = FootnoteRecord(len(records) + 1, str(len(records) + 1) if automatic_numbering else marker, note_text)
                if not _insert_reference(candidates[0], pattern, marker, record.id, automatic=automatic_numbering):
                    raise WorkerError("footnotes_need_review", "Footnote marker could not be attached unambiguously; source text was preserved.", details={"marker": marker})
                records.append(record)
            remove.append(paragraph)
        if paragraph.xpath(".//w:br[@w:type='page']", namespaces=NS):
            page_start = index + 1
    if not records:
        return []
    for paragraph in remove:
        paragraph.getparent().remove(paragraph)
    entries["word/document.xml"] = etree.tostring(document, xml_declaration=True, encoding="UTF-8", standalone=True)
    entries["word/footnotes.xml"] = _footnotes_xml(records, automatic=automatic_numbering)
    relationships = etree.fromstring(entries["word/_rels/document.xml.rels"])
    ids = {node.get("Id") for node in relationships}
    number = 1
    while f"rIdFootnotes{number}" in ids:
        number += 1
    relationship = etree.SubElement(relationships, f"{{{REL_NS}}}Relationship")
    relationship.attrib.update({"Id": f"rIdFootnotes{number}", "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes", "Target": "footnotes.xml"})
    entries["word/_rels/document.xml.rels"] = etree.tostring(relationships, xml_declaration=True, encoding="UTF-8", standalone=True)
    content_types = etree.fromstring(entries["[Content_Types].xml"])
    override = etree.SubElement(content_types, f"{{{CT_NS}}}Override")
    override.attrib.update({"PartName": "/word/footnotes.xml", "ContentType": "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"})
    entries["[Content_Types].xml"] = etree.tostring(content_types, xml_declaration=True, encoding="UTF-8", standalone=True)
    temporary = path.with_suffix(".with-footnotes.docx")
    with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as output:
        for name, data in entries.items():
            output.writestr(name, data)
    temporary.replace(path)
    validate_footnote_integrity(path, records)
    return records


def validate_footnote_integrity(path: Path, expected: list[FootnoteRecord], *, verify_formatting: bool = False) -> None:
    with zipfile.ZipFile(path) as archive:
        entries = {name: archive.read(name) for name in archive.namelist()}
    if not expected:
        return
    document = etree.fromstring(entries.get("word/document.xml", b""))
    footnotes = etree.fromstring(entries.get("word/footnotes.xml", b""))
    body_text = " ".join(document.xpath(".//w:body//w:t/text()", namespaces=NS))
    references = [int(value) for value in document.xpath(".//w:footnoteReference/@w:id", namespaces=NS)]
    failures = []
    for record in expected:
        notes = footnotes.xpath(f"w:footnote[@w:id='{record.id}']", namespaces=NS)
        actual = " ".join("".join(notes[0].xpath(".//w:t/text()", namespaces=NS)).split()) if notes else ""
        if references.count(record.id) != 1:
            failures.append(f"marker/reference {record.id} occurs {references.count(record.id)} times")
        # Word renders the custom reference mark from w:footnoteRef; it must
        # not be duplicated as literal text in the footnote body.
        expected_text = record.text
        if actual != " ".join(expected_text.split()):
            failures.append(f"footnote {record.id} text is incomplete")
        if " ".join(record.text.split()) in " ".join(body_text.split()):
            failures.append(f"footnote {record.id} remains duplicated in body")
        if verify_formatting and notes:
            for paragraph in notes[0].xpath(".//w:p", namespaces=NS):
                spacing = paragraph.find("w:pPr/w:spacing", namespaces=NS)
                expected_spacing = {"before": "0", "after": "0", "line": "240"}
                if spacing is None or any(spacing.get(f"{{{W_NS}}}{key}") != value for key, value in expected_spacing.items()):
                    failures.append(f"footnote {record.id} paragraph spacing is incorrect")
            for run in notes[0].xpath(".//w:r[.//w:t]", namespaces=NS):
                fonts = run.find("w:rPr/w:rFonts", namespaces=NS)
                size = run.find("w:rPr/w:sz", namespaces=NS)
                if fonts is None or fonts.get(f"{{{W_NS}}}ascii") != "Times New Roman" or size is None or size.get(f"{{{W_NS}}}val") != "18":
                    failures.append(f"footnote {record.id} font is incorrect")
    if failures:
        raise WorkerError("footnote_integrity_failed", "DOCX footnote integrity validation failed.", details={"failures": failures})
