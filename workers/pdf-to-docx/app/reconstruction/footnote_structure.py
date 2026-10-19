from __future__ import annotations

import copy
import re
import zipfile
from pathlib import Path

from lxml import etree

from .contracts import Classification, DiagnosticRecord, Node, SourceRef, StyleEvidence

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
REL = "http://schemas.openxmlformats.org/package/2006/relationships"
CT = "http://schemas.openxmlformats.org/package/2006/content-types"
NS = {"w": W}
NOTE_MARKER = re.compile(r"(?<!\S)\((\d+|\*)\)\s+(?=[A-Z])")


def _ensure_word_footnote_styles(styles: etree._Element) -> None:
    """Install the native Word footnote styles when the base DOCX omits them."""
    if not styles.xpath("./w:style[@w:styleId='FootnoteReference']", namespaces=NS):
        style = etree.SubElement(styles, f"{{{W}}}style")
        style.attrib.update({f"{{{W}}}type": "character", f"{{{W}}}styleId": "FootnoteReference"})
        etree.SubElement(style, f"{{{W}}}name").set(f"{{{W}}}val", "footnote reference")
        etree.SubElement(style, f"{{{W}}}basedOn").set(f"{{{W}}}val", "DefaultParagraphFont")
        etree.SubElement(style, f"{{{W}}}uiPriority").set(f"{{{W}}}val", "99")
        etree.SubElement(style, f"{{{W}}}semiHidden")
        etree.SubElement(style, f"{{{W}}}unhideWhenUsed")
        properties = etree.SubElement(style, f"{{{W}}}rPr")
        etree.SubElement(properties, f"{{{W}}}vertAlign").set(f"{{{W}}}val", "superscript")
    if not styles.xpath("./w:style[@w:styleId='FootnoteText']", namespaces=NS):
        style = etree.SubElement(styles, f"{{{W}}}style")
        style.attrib.update({f"{{{W}}}type": "paragraph", f"{{{W}}}styleId": "FootnoteText"})
        etree.SubElement(style, f"{{{W}}}name").set(f"{{{W}}}val", "footnote text")
        etree.SubElement(style, f"{{{W}}}basedOn").set(f"{{{W}}}val", "Normal")
        etree.SubElement(style, f"{{{W}}}uiPriority").set(f"{{{W}}}val", "99")
        etree.SubElement(style, f"{{{W}}}semiHidden")
        etree.SubElement(style, f"{{{W}}}unhideWhenUsed")
        paragraph_properties = etree.SubElement(style, f"{{{W}}}pPr")
        spacing = etree.SubElement(paragraph_properties, f"{{{W}}}spacing")
        spacing.attrib.update({f"{{{W}}}before": "0", f"{{{W}}}after": "0", f"{{{W}}}line": "240", f"{{{W}}}lineRule": "auto"})
        run_properties = etree.SubElement(style, f"{{{W}}}rPr")
        fonts = etree.SubElement(run_properties, f"{{{W}}}rFonts")
        fonts.attrib.update({f"{{{W}}}ascii": "Times New Roman", f"{{{W}}}hAnsi": "Times New Roman", f"{{{W}}}eastAsia": "Times New Roman", f"{{{W}}}cs": "Times New Roman"})
        etree.SubElement(run_properties, f"{{{W}}}sz").set(f"{{{W}}}val", "20")
        etree.SubElement(run_properties, f"{{{W}}}szCs").set(f"{{{W}}}val", "20")
        etree.SubElement(run_properties, f"{{{W}}}color").set(f"{{{W}}}val", "000000")


def _entries(text: str) -> list[tuple[str, str, int]]:
    matches = list(NOTE_MARKER.finditer(text))
    if not matches or matches[0].start() != 0:
        return []
    return [(match.group(1), text[match.end():matches[index + 1].start() if index + 1 < len(matches) else len(text)].strip(), match.start())
            for index, match in enumerate(matches)]


def _box_top(node: Node) -> float:
    return min(box.y0 for ref in node.source for box in ref.boxes)


def _box_bottom(node: Node) -> float:
    return max(box.y1 for ref in node.source for box in ref.boxes)


def bind_footnotes(document: Node, page_heights: dict[int, float], decisions: list[DiagnosticRecord]) -> list[dict[str, object]]:
    """Bind bottom-margin note bodies to unique same-page source markers.

    This intentionally does not use node adjacency. Geometry establishes a note
    region; exact marker occurrence, page identity and vertical order establish
    an anchor. Any non-unique relationship fails closed.
    """
    records: list[dict[str, object]] = []
    children = document.children
    bodies: list[Node] = []
    for node in children:
        if node.type not in {"Footnote", "ListItem", "Paragraph"} or not node.source:
            continue
        page = node.source[0].page
        parsed = _entries(node.exact_text)
        if parsed and _box_top(node) >= page_heights[page] * .82:
            node.type = "FootnoteBody"
            node.attributes = {**node.attributes, "footnoteEntries": []}
            bodies.append(node)
            if node.classification.evidence != ["Bottom-margin numbered note region with uniquely resolvable anchors."]:
                node.classification = Classification("deterministic", .99, ["Bottom-margin numbered note region with uniquely resolvable anchors."])
    next_id = 1
    for body in bodies:
        page = body.source[0].page
        for marker, text, body_offset in _entries(body.exact_text):
            pattern = re.compile(rf"(?<!\S)\(\s*{re.escape(marker)}\s*\)(?=\s|[,.!?;:]|$)")
            candidates: list[tuple[Node, int]] = []
            for node in children:
                if node is body or node.type in {"FootnoteBody", "PageBreak", "Table"} or not node.source:
                    continue
                if node.source[0].page != page or _box_bottom(node) >= _box_top(body):
                    continue
                if re.fullmatch(rf"\s*\(\s*{re.escape(marker)}\s*\)\s*", node.exact_text):
                    continue
                matches = list(pattern.finditer(node.exact_text))
                if node.type in {"Recital", "ListItem"} or re.match(r"^\s*\(\s*\d+\s*\)\s+\S", node.exact_text):
                    matches = [match for match in matches if match.start() != 0]
                if len(matches) == 1:
                    candidates.append((node, matches[0].start()))
                elif len(matches) > 1:
                    raise ValueError(f"Footnote marker ({marker}) occurs multiple times in candidate node {node.id}.")
            if len(candidates) != 1:
                raise ValueError(f"Footnote marker ({marker}) on page {page} has {len(candidates)} safe anchors.")
            anchor, offset = candidates[0]
            footnote_id = next_id
            next_id += 1
            reference_id = f"footnote-reference-{footnote_id}-{anchor.id}"
            reference = Node(reference_id, "FootnoteReference", "", copy.deepcopy(anchor.source), anchor.style,
                             Classification("deterministic", 1.0, ["Unique same-page marker above a bottom-margin footnote region."]), [],
                             {"footnoteId": footnote_id, "marker": marker, "pageLocalNumber": marker, "sourcePage": page,
                              "offset": offset, "footnoteBodyNodeId": body.id})
            anchor.children.append(reference)
            entry = {"footnoteId": footnote_id, "marker": marker, "text": text, "bodyOffset": body_offset,
                     "sourcePage": page, "pageLocalNumber": marker,
                     "anchorNodeId": anchor.id, "anchorOffset": offset, "referenceNodeId": reference_id}
            body.attributes["footnoteEntries"].append(entry)
            records.append(entry)
            decisions.append(DiagnosticRecord("footnote-link", reference_id, copy.deepcopy(anchor.source) + copy.deepcopy(body.source),
                f"Linked source marker ({marker}) on page {page} to a bottom-margin footnote body using unique marker, page and geometry evidence.",
                1.0, "linked", [f"anchorNodeId={anchor.id}", f"bodyNodeId={body.id}", f"anchorOffset={offset}"], "resolved"))
    if records:
        document.attributes["footnoteNumbering"] = {
            "scheme": "page-local-explicit",
            "pages": {str(page): [item["pageLocalNumber"] for item in records if item["sourcePage"] == page]
                      for page in sorted({int(item["sourcePage"]) for item in records})},
        }
    return records


def write_ooxml_footnotes(path: Path, document: Node) -> int:
    records = [entry for node in document.children if node.type == "FootnoteBody" for entry in node.attributes.get("footnoteEntries", [])]
    if not records:
        return 0
    with zipfile.ZipFile(path) as archive:
        entries = {item.filename: archive.read(item.filename) for item in archive.infolist()}
    root = etree.fromstring(entries["word/document.xml"])
    paragraphs = root.xpath(".//w:body/w:p", namespaces=NS)
    def paragraph_text(paragraph: etree._Element) -> str:
        values = []
        # Do not traverse pPr: its tab-stop declaration is also w:tab, but is
        # formatting rather than a literal document tab.
        for run in paragraph.xpath(".//w:r", namespaces=NS):
            for child in run.iterchildren():
                local = etree.QName(child).localname
                if local == "t" and child.text:
                    values.append(child.text)
                elif local == "tab":
                    values.append("\t")
                elif local == "br":
                    values.append("\n")
        return "".join(values)
    visible_nodes = [node for node in document.children if node.type not in {"PageBreak", "Table", "FootnoteBody"} and node.exact_text]
    paragraph_by_node: dict[str, etree._Element] = {}
    cursor = 0
    for node in visible_nodes:
        # The renderer stamps every body paragraph with its source-node suffix.
        # Prefer that provenance marker over text matching: recital tabs and
        # repeated legal text are structurally non-unique by design.
        marker = node.id[-8:]
        marked = [paragraph for paragraph in paragraphs if paragraph.get(f"{{{W}}}rsidR") == marker]
        if len(marked) == 1:
            paragraph_by_node[node.id] = marked[0]
            cursor = max(cursor, paragraphs.index(marked[0]) + 1)
            continue
        while cursor < len(paragraphs) and paragraph_text(paragraphs[cursor]) != node.exact_text:
            cursor += 1
        if cursor >= len(paragraphs):
            raise ValueError(f"Footnote serializer cannot locate anchor paragraph {node.id}.")
        paragraph_by_node[node.id] = paragraphs[cursor]
        cursor += 1
    for record in records:
        paragraph = paragraph_by_node.get(str(record["anchorNodeId"]))
        if paragraph is None:
            raise ValueError(f"Footnote anchor {record['anchorNodeId']} is absent from DOCX body.")
        marker = f"({record['marker']})"
        # Include structural tabs/brs in the offset contract.  Recital anchors
        # are measured against the typed paragraph text, which contains the
        # real tab between the number and prose.
        serialized_text = paragraph_text(paragraph)
        anchor_offset = int(record["anchorOffset"])
        if serialized_text[anchor_offset:anchor_offset + len(marker)] != marker:
                raise ValueError(f"Footnote marker {marker} no longer occupies its proven anchor span: node={record['anchorNodeId']} offset={anchor_offset} text={serialized_text!r}.")
        # Resolve the proven character offset, not the marker text alone: a
        # recital label and a footnote call can legitimately share `(n)`.
        text_node = None; offset = -1; visible_offset = 0
        for candidate_run in paragraph.xpath(".//w:r", namespaces=NS):
            for child in candidate_run.iterchildren():
                local = etree.QName(child).localname
                if local == "t":
                    value = child.text or ""
                    relative = anchor_offset - visible_offset
                    if 0 <= relative <= len(value) - len(marker) and value[relative:relative + len(marker)] == marker:
                        if text_node is not None:
                            raise ValueError(f"Footnote anchor offset {anchor_offset} maps to multiple serialized runs.")
                        text_node, offset = child, relative
                    visible_offset += len(value)
                elif local in {"tab", "br"}:
                    visible_offset += 1
        if text_node is None:
            raise ValueError(f"Footnote marker {marker} cannot be resolved at its proven serialized offset {anchor_offset}.")
        run = text_node.getparent(); parent = run.getparent(); run_index = parent.index(run)
        before, after = (text_node.text or "")[:offset], (text_node.text or "")[offset + len(marker):]
        text_node.text = before
        ref_run = etree.Element(f"{{{W}}}r"); rpr = etree.SubElement(ref_run, f"{{{W}}}rPr"); etree.SubElement(rpr, f"{{{W}}}rStyle").set(f"{{{W}}}val", "FootnoteReference"); fonts = etree.SubElement(rpr, f"{{{W}}}rFonts"); fonts.attrib.update({f"{{{W}}}ascii": "Times New Roman", f"{{{W}}}hAnsi": "Times New Roman", f"{{{W}}}eastAsia": "Times New Roman", f"{{{W}}}cs": "Times New Roman"}); etree.SubElement(rpr, f"{{{W}}}sz").set(f"{{{W}}}val", "22"); etree.SubElement(rpr, f"{{{W}}}color").set(f"{{{W}}}val", "000000"); etree.SubElement(rpr, f"{{{W}}}vertAlign").set(f"{{{W}}}val", "superscript")
        ref = etree.SubElement(ref_run, f"{{{W}}}footnoteReference"); ref.set(f"{{{W}}}id", str(record["footnoteId"])); ref.set(f"{{{W}}}customMarkFollows", "1")
        # Preserve the source's visible parenthesized call in the main story.
        # The footnote story itself uses the unparenthesized Word custom mark.
        etree.SubElement(ref_run, f"{{{W}}}t").text = marker
        parent.insert(run_index + 1, ref_run)
        if after:
            suffix = copy.deepcopy(run)
            for text in suffix.xpath(".//w:t", namespaces=NS): text.getparent().remove(text)
            etree.SubElement(suffix, f"{{{W}}}t").text = after
            parent.insert(run_index + 2, suffix)
    footnotes = etree.Element(f"{{{W}}}footnotes", nsmap={"w": W})
    for value, kind in ((-1, "separator"), (0, "continuationSeparator")):
        note = etree.SubElement(footnotes, f"{{{W}}}footnote"); note.set(f"{{{W}}}id", str(value)); note.set(f"{{{W}}}type", kind); p = etree.SubElement(note, f"{{{W}}}p"); r = etree.SubElement(p, f"{{{W}}}r"); etree.SubElement(r, f"{{{W}}}{kind}")
    for record in records:
        note = etree.SubElement(footnotes, f"{{{W}}}footnote"); note.set(f"{{{W}}}id", str(record["footnoteId"]))
        p = etree.SubElement(note, f"{{{W}}}p"); p_props = etree.SubElement(p, f"{{{W}}}pPr"); etree.SubElement(p_props, f"{{{W}}}pStyle").set(f"{{{W}}}val", "FootnoteText"); etree.SubElement(p_props, f"{{{W}}}jc").set(f"{{{W}}}val", "both"); spacing = etree.SubElement(p_props, f"{{{W}}}spacing"); spacing.attrib.update({f"{{{W}}}before": "0", f"{{{W}}}after": "0", f"{{{W}}}line": "240", f"{{{W}}}lineRule": "auto"}); ind = etree.SubElement(p_props, f"{{{W}}}ind"); ind.attrib.update({f"{{{W}}}left": "340", f"{{{W}}}hanging": "340"}); tabs = etree.SubElement(p_props, f"{{{W}}}tabs"); etree.SubElement(tabs, f"{{{W}}}tab").attrib.update({f"{{{W}}}val": "left", f"{{{W}}}pos": "340"}); mark = etree.SubElement(p, f"{{{W}}}r"); mark_props = etree.SubElement(mark, f"{{{W}}}rPr"); etree.SubElement(mark_props, f"{{{W}}}rStyle").set(f"{{{W}}}val", "FootnoteReference"); mark_fonts = etree.SubElement(mark_props, f"{{{W}}}rFonts"); mark_fonts.attrib.update({f"{{{W}}}ascii": "Times New Roman", f"{{{W}}}hAnsi": "Times New Roman", f"{{{W}}}eastAsia": "Times New Roman", f"{{{W}}}cs": "Times New Roman"}); etree.SubElement(mark_props, f"{{{W}}}sz").set(f"{{{W}}}val", "20"); etree.SubElement(mark_props, f"{{{W}}}color").set(f"{{{W}}}val", "000000"); etree.SubElement(mark_props, f"{{{W}}}vertAlign").set(f"{{{W}}}val", "superscript")
        etree.SubElement(mark, f"{{{W}}}t").text = str(record["marker"]); etree.SubElement(mark, f"{{{W}}}tab")
        text_run = etree.SubElement(p, f"{{{W}}}r"); text_props = etree.SubElement(text_run, f"{{{W}}}rPr"); text_fonts = etree.SubElement(text_props, f"{{{W}}}rFonts"); text_fonts.attrib.update({f"{{{W}}}ascii": "Times New Roman", f"{{{W}}}hAnsi": "Times New Roman", f"{{{W}}}eastAsia": "Times New Roman", f"{{{W}}}cs": "Times New Roman"}); etree.SubElement(text_props, f"{{{W}}}sz").set(f"{{{W}}}val", "20"); etree.SubElement(text_props, f"{{{W}}}color").set(f"{{{W}}}val", "000000"); etree.SubElement(text_run, f"{{{W}}}t").text = str(record["text"])
    entries["word/document.xml"] = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    entries["word/footnotes.xml"] = etree.tostring(footnotes, xml_declaration=True, encoding="UTF-8", standalone=True)
    styles = etree.fromstring(entries["word/styles.xml"])
    _ensure_word_footnote_styles(styles)
    entries["word/styles.xml"] = etree.tostring(styles, xml_declaration=True, encoding="UTF-8", standalone=True)
    settings = etree.fromstring(entries["word/settings.xml"])
    footnote_properties = settings.find(f"{{{W}}}footnotePr")
    if footnote_properties is None:
        footnote_properties = etree.Element(f"{{{W}}}footnotePr")
        settings.insert(0, footnote_properties)
    existing_special_ids = {node.get(f"{{{W}}}id") for node in footnote_properties.findall(f"{{{W}}}footnote")}
    for special_id in ("-1", "0"):
        if special_id not in existing_special_ids:
            etree.SubElement(footnote_properties, f"{{{W}}}footnote").set(f"{{{W}}}id", special_id)
    entries["word/settings.xml"] = etree.tostring(settings, xml_declaration=True, encoding="UTF-8", standalone=True)
    rels = etree.fromstring(entries["word/_rels/document.xml.rels"])
    etree.SubElement(rels, f"{{{REL}}}Relationship", Id="rIdTypedFootnotes", Type=f"{R}/footnotes", Target="footnotes.xml")
    entries["word/_rels/document.xml.rels"] = etree.tostring(rels, xml_declaration=True, encoding="UTF-8", standalone=True)
    types = etree.fromstring(entries["[Content_Types].xml"])
    etree.SubElement(types, f"{{{CT}}}Override", PartName="/word/footnotes.xml", ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml")
    entries["[Content_Types].xml"] = etree.tostring(types, xml_declaration=True, encoding="UTF-8", standalone=True)
    temporary = path.with_suffix(".footnotes.tmp")
    with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, value in entries.items(): archive.writestr(name, value)
    temporary.replace(path)
    return len(records)
