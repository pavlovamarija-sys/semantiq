import re
import zipfile
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt
from lxml import etree

from .errors import WorkerError
from .profile import ConversionProfile

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
LEGAL_LABEL = re.compile(r"^\s*\([a-z]+\)(?:\s|\u00a0)", re.IGNORECASE)
DATE_TOKEN = r"\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{2,4}"
JOURNAL_TOKEN = r"(?:official\s+journal(?:\s+of\s+the\s+european\s+communities|\s+of\s+the\s+european\s+union)?|journal\s+officiel|amtsblatt)"
ISSUE_TOKEN = r"(?:no\.?\s*)?[a-z]\s*\d+\s*/\s*\d+"
OJ_HEADER_FOOTER = re.compile(
    rf"^\s*(?:{DATE_TOKEN}\s+{JOURNAL_TOKEN}\s+{ISSUE_TOKEN}|{ISSUE_TOKEN}\s+{JOURNAL_TOKEN}\s+{DATE_TOKEN})\s*$",
    re.IGNORECASE,
)
# Encoding-safe legal-structure grammar.
ANNEX_START = re.compile(r"^\s*ANNEX(?:\s+(?:[IVXLCDM]+|[0-9]+|[A-Z]))?(?:\s*[-\u2013\u2014:.)]|\s*$)", re.IGNORECASE)
ACT_TITLE = re.compile(r"^(?:(?:THE\s+)?(?:COUNCIL|COMMISSION|EUROPEAN\s+PARLIAMENT(?:\s+AND\s+THE\s+COUNCIL)?)\s+)?(?:DIRECTIVE|REGULATION|DECISION)\b", re.IGNORECASE)
ACT_DATE = re.compile(r"^of\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*$", re.IGNORECASE)
ACT_NUMBER = re.compile(
    r"^(?:"
    r"\(?(?:\d{2,4}\s*/\s*\d+\s*/\s*(?:EU|EC|EEC|ECSC|EURATOM))\)?"
    r"|\((?:EU|EC|EEC|ECSC|EURATOM)\)\s+(?:No\.?\s+)?\d{2,4}\s*/\s*\d+"
    r"|(?:EU|EC|EEC|ECSC|EURATOM)\s+(?:No\.?\s+)?\d{2,4}\s*/\s*\d+"
    r")$",
    re.IGNORECASE,
)
CHAPTER_OR_SECTION = re.compile(r"^(?:CHAPTER|SECTION)\s+(?:[IVXLCDM]+|\d+|[A-Z])\s*$", re.IGNORECASE)
ARTICLE = re.compile(r"^ARTICLE\s+\d+[A-Z]?(?:\s*[-\u2013\u2014:].*)?$", re.IGNORECASE)
REFERENCE_BLOCK = re.compile(r"^\(\d+\)\s+OJ\s+(?:No\.?\s+)?[A-Z]\b", re.IGNORECASE)
BODY_START = re.compile(r"^(?:whereas\b|\(\d+\)\s+(?!OJ\b)|\d+[.)]\s|[a-z][.)]\s|the\s+(?:council|commission|member\s+states?)\b)", re.IGNORECASE)


def _one_column(section) -> None:
    sect_pr = section._sectPr
    cols = sect_pr.find(qn("w:cols"))
    if cols is None:
        cols = OxmlElement("w:cols")
        sect_pr.append(cols)
    cols.set(qn("w:num"), "1")
    cols.set(qn("w:equalWidth"), "1")


def _remove_breaks(paragraph) -> None:
    for node in list(paragraph._p.iter()):
        if node.tag in {qn("w:br"), qn("w:lastRenderedPageBreak")}:
            parent = node.getparent()
            if parent is not None:
                parent.remove(node)
    properties = paragraph._p.pPr
    if properties is not None:
        for tag in ("pageBreakBefore", "keepNext", "keepLines"):
            node = properties.find(qn(f"w:{tag}"))
            if node is not None and tag == "pageBreakBefore":
                properties.remove(node)


def _remove_section_break(paragraph) -> None:
    properties = paragraph._p.pPr
    if properties is not None:
        section = properties.find(qn("w:sectPr"))
        if section is not None:
            properties.remove(section)


def _is_title_text(text: str) -> bool:
    if not text or len(text) > 180 or BODY_START.match(text) or text.endswith((".", ";")):
        return False
    # This is used only immediately after a structural label. Shortness alone
    # never classifies an otherwise ordinary paragraph as a title.
    return len(text) <= 80 and not re.search(r"[,;:]|\b(?:shall|must|means|is|are|provides?|applies?)\b", text, re.IGNORECASE)


def classify_paragraph_texts(texts: list[str]) -> dict[int, str]:
    classifications: dict[int, str] = {}
    title_block = False
    structural_title_pending = False
    for index, raw_text in enumerate(texts):
        text = " ".join(raw_text.split())
        if not text:
            classifications[index] = "empty"
            continue
        # A legal-act identifier is structural only when it occupies the
        # whole paragraph. ACT_NUMBER is anchored at both ends so references
        # embedded in ordinary prose cannot enter this branch.
        if ACT_NUMBER.fullmatch(text):
            classifications[index] = "title-block-identifier"
            title_block = False
            continue
        if ACT_TITLE.match(text):
            title_block = True
            classifications[index] = "title-block"
            continue
        if title_block:
            if ACT_DATE.match(text) or text.lower().startswith("on "):
                classifications[index] = "title-block"
                if ACT_NUMBER.match(text):
                    title_block = False
                continue
            title_block = False
        if CHAPTER_OR_SECTION.match(text):
            classifications[index] = "chapter-or-section-heading"
            structural_title_pending = True
            continue
        if ARTICLE.match(text):
            classifications[index] = "article-heading"
            structural_title_pending = True
            continue
        if ANNEX_START.match(text):
            classifications[index] = "annex-heading"
            structural_title_pending = True
            continue
        if structural_title_pending:
            if _is_title_text(text):
                classifications[index] = "structural-title"
                structural_title_pending = False
                continue
            structural_title_pending = False
        if REFERENCE_BLOCK.match(text):
            classifications[index] = "reference-block"
            continue
        classifications[index] = "body"
    return classifications


def _alignment_map(paragraphs) -> dict[int, bool]:
    classifications = classify_paragraph_texts([paragraph.text for paragraph in paragraphs])
    return {index: classification not in ("body", "empty") for index, classification in classifications.items()}


def _format_paragraph(paragraph, profile: ConversionProfile, *, centered: bool = False) -> None:
    _remove_breaks(paragraph)
    _remove_section_break(paragraph)
    if OJ_HEADER_FOOTER.match(" ".join(paragraph.text.split())):
        element = paragraph._element
        parent = element.getparent()
        if parent is not None:
            parent.remove(element)
        return
    # Heading styles are presentation artifacts from PDF conversion. Legal
    # structure remains represented by paragraph boundaries and numbering.
    paragraph.style = "Normal"
    for run in paragraph.runs:
        run.font.name = "Times New Roman"
        run.font.size = Pt(12)
        run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), "Times New Roman")
        run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), "Times New Roman")
        run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), "Times New Roman")
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER if centered else WD_ALIGN_PARAGRAPH.JUSTIFY
    fmt = paragraph.paragraph_format
    fmt.space_before = Pt(profile.body.beforePt)
    fmt.space_after = Pt(profile.body.afterPt)
    fmt.line_spacing = 1.0
    if REFERENCE_BLOCK.match(" ".join(paragraph.text.split())):
        fmt.space_before = Pt(profile.footnotes.beforePt)
        fmt.space_after = Pt(profile.footnotes.afterPt)
        for run in paragraph.runs:
            run.font.size = Pt(profile.footnotes.fontSizePt)
    if profile.literalLegalLabels and LEGAL_LABEL.match(paragraph.text):
        properties = paragraph._p.get_or_add_pPr()
        numbering = properties.find(qn("w:numPr"))
        if numbering is not None:
            properties.remove(numbering)


def _has_nontext_content(paragraph) -> bool:
    return any(node.tag in {qn("w:drawing"), qn("w:pict"), qn("w:object")} for node in paragraph._p.iter())


def _format_container(container, profile: ConversionProfile, *, remove_empty: bool = True) -> None:
    paragraphs = list(container.paragraphs)
    centered = _alignment_map(paragraphs)
    for index, paragraph in enumerate(paragraphs):
        _format_paragraph(paragraph, profile, centered=centered.get(index, False))
        if remove_empty and not paragraph.text.strip() and not _has_nontext_content(paragraph):
            parent = paragraph._element.getparent()
            if parent is not None:
                parent.remove(paragraph._element)
    for table in container.tables:
        for row in table.rows:
            for cell in row.cells:
                _format_container(cell, profile, remove_empty=False)


def _insert_annex_breaks(document) -> None:
    paragraphs = list(document.paragraphs)
    for paragraph in paragraphs:
        if not ANNEX_START.match(" ".join(paragraph.text.split())):
            continue
        previous = paragraph._p.getprevious()
        # Normalization has removed source breaks. A dedicated empty paragraph
        # gives Annex starts exactly one explicit page break in WordprocessingML.
        if previous is not None and any(node.tag == qn("w:br") for node in previous.iter()):
            continue
        marker = paragraph.insert_paragraph_before()
        marker.style = "Normal"
        marker.add_run().add_break(WD_BREAK.PAGE)


def _normalize_sections(document) -> None:
    sections = document.sections
    if not sections:
        return
    first = sections[0]
    # Remove only section properties embedded in paragraph boundaries. Keep the
    # final body sectPr as the single continuous document section.
    for paragraph in document.element.body.iter(qn("w:p")):
        properties = paragraph.find(qn("w:pPr"))
        if properties is not None:
            section = properties.find(qn("w:sectPr"))
            if section is not None:
                properties.remove(section)
    body = document.element.body
    section_properties = [child for child in list(body) if child.tag == qn("w:sectPr")]
    for section in section_properties[:-1]:
        body.remove(section)
    sect_pr = section_properties[-1] if section_properties else first._sectPr
    if sect_pr.getparent() is None:
        body.append(sect_pr)
    cols = sect_pr.find(qn("w:cols"))
    if cols is None:
        cols = OxmlElement("w:cols")
        sect_pr.append(cols)
    cols.set(qn("w:num"), "1")
    cols.set(qn("w:equalWidth"), "1")


def _normalize_footnote_part(docx_path: Path, profile: ConversionProfile) -> None:
    """Update the optional footnote part without reconstructing any other OOXML."""
    with zipfile.ZipFile(docx_path, "r") as source:
        if "word/footnotes.xml" not in source.namelist():
            return
        entries = {item.filename: source.read(item.filename) for item in source.infolist()}
    root = etree.fromstring(entries["word/footnotes.xml"])
    ns = {"w": W_NS}
    for note in root.xpath("w:footnote[number(@w:id) >= 0]", namespaces=ns):
        # A source footnote is represented by exactly one non-empty paragraph.
        # Remove extraction artefacts, but leave the required negative-id
        # separator notes alone.
        for paragraph in list(note.xpath("./w:p", namespaces=ns)):
            if not "".join(paragraph.xpath(".//w:t/text()", namespaces=ns)).strip() and not paragraph.xpath(".//w:footnoteRef", namespaces=ns):
                note.remove(paragraph)
        paragraphs = note.xpath("./w:p", namespaces=ns)
        if not paragraphs:
            paragraph = etree.SubElement(note, f"{{{W_NS}}}p")
        for paragraph in note.xpath("./w:p", namespaces=ns):
            ppr = paragraph.find(f"{{{W_NS}}}pPr")
            if ppr is None:
                ppr = etree.Element(f"{{{W_NS}}}pPr")
                paragraph.insert(0, ppr)
            spacing = ppr.find(f"{{{W_NS}}}spacing")
            if spacing is None:
                spacing = etree.SubElement(ppr, f"{{{W_NS}}}spacing")
            spacing.attrib.update({f"{{{W_NS}}}before": "0", f"{{{W_NS}}}after": "0", f"{{{W_NS}}}line": "240", f"{{{W_NS}}}lineRule": "auto"})
            justification = ppr.find(f"{{{W_NS}}}jc")
            if justification is None:
                justification = etree.SubElement(ppr, f"{{{W_NS}}}jc")
            justification.set(f"{{{W_NS}}}val", "left")
            indentation = ppr.find(f"{{{W_NS}}}ind")
            if indentation is None:
                indentation = etree.SubElement(ppr, f"{{{W_NS}}}ind")
            indentation.attrib.update({f"{{{W_NS}}}{key}": "0" for key in ("left", "right", "firstLine", "hanging")})
        for run in note.xpath(".//w:r", namespaces=ns):
            rpr = run.find(f"{{{W_NS}}}rPr")
            if rpr is None:
                rpr = etree.Element(f"{{{W_NS}}}rPr")
                run.insert(0, rpr)
            for tag in ("sz", "szCs"):
                size = rpr.find(f"{{{W_NS}}}{tag}")
                if size is None:
                    size = etree.SubElement(rpr, f"{{{W_NS}}}{tag}")
                size.set(f"{{{W_NS}}}val", str(round(profile.footnotes.fontSizePt * 2)))
            fonts = rpr.find(f"{{{W_NS}}}rFonts")
            if fonts is None:
                fonts = etree.SubElement(rpr, f"{{{W_NS}}}rFonts")
            fonts.attrib.update({f"{{{W_NS}}}{key}": "Times New Roman" for key in ("ascii", "hAnsi", "eastAsia", "cs")})
            # OJ citations must remain ordinary black text, even if the PDF
            # converter imported hyperlink/theme styling into the run.
            is_reference_mark = run.find(f"{{{W_NS}}}footnoteRef") is not None
            for tag in ("color", "u", "highlight"):
                node = rpr.find(f"{{{W_NS}}}{tag}")
                if node is not None:
                    rpr.remove(node)
            style = rpr.find(f"{{{W_NS}}}rStyle")
            if is_reference_mark:
                if style is None:
                    style = etree.SubElement(rpr, f"{{{W_NS}}}rStyle")
                style.set(f"{{{W_NS}}}val", "FootnoteReference")
            elif style is not None:
                rpr.remove(style)
            color = etree.SubElement(rpr, f"{{{W_NS}}}color")
            color.set(f"{{{W_NS}}}val", "000000")
    entries["word/footnotes.xml"] = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    temporary = docx_path.with_suffix(".footnotes.docx")
    with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as output:
        for name, data in entries.items():
            output.writestr(name, data)
    temporary.replace(docx_path)


def _remove_oj_header_footer_parts(docx_path: Path) -> None:
    """Remove recurring OJ pagination paragraphs from actual header/footer parts."""
    with zipfile.ZipFile(docx_path, "r") as source:
        entries = {item.filename: source.read(item.filename) for item in source.infolist()}
    changed = False
    for name, data in list(entries.items()):
        if not (name.startswith("word/header") or name.startswith("word/footer")) or not name.endswith(".xml"):
            continue
        root = etree.fromstring(data)
        part_changed = False
        for paragraph in list(root.xpath(".//w:p", namespaces={"w": W_NS})):
            text = "".join(paragraph.xpath(".//w:t/text()", namespaces={"w": W_NS}))
            if OJ_HEADER_FOOTER.match(" ".join(text.split())):
                paragraph.getparent().remove(paragraph)
                changed = True
                part_changed = True
        if part_changed:
            entries[name] = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    if not changed:
        return
    temporary = docx_path.with_suffix(".headers.docx")
    with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as output:
        for name, data in entries.items():
            output.writestr(name, data)
    temporary.replace(docx_path)


def verify_normalized_docx(docx_path: Path, profile: ConversionProfile) -> None:
    """Assert the formatting contract against the final OOXML package on disk."""
    with zipfile.ZipFile(docx_path) as archive:
        entries = {name: archive.read(name) for name in archive.namelist()}
    ns = {"w": W_NS}
    document = etree.fromstring(entries["word/document.xml"])
    paragraphs = document.xpath(".//w:body//w:p", namespaces=ns)
    paragraph_texts = [" ".join("".join(paragraph.xpath(".//w:t/text()", namespaces=ns)).split()) for paragraph in paragraphs]
    classifications = classify_paragraph_texts(paragraph_texts)
    annexes = []
    page_breaks = []
    failures: list[str] = []

    for index, paragraph in enumerate(paragraphs):
        text = paragraph_texts[index]
        classification = classifications[index]
        breaks = paragraph.xpath(".//w:br", namespaces=ns)
        for node in breaks:
            break_type = node.get(qn("w:type"), "textWrapping")
            if break_type == "page":
                page_breaks.append(index)
            else:
                failures.append(f"unexpected {break_type} break")
        if paragraph.xpath(".//w:lastRenderedPageBreak", namespaces=ns):
            failures.append("last-rendered page break remains")
        if paragraph.xpath("./w:pPr/w:sectPr|./w:pPr/w:pageBreakBefore", namespaces=ns):
            failures.append("paragraph section/page-break property remains")
        if not text:
            continue
        if OJ_HEADER_FOOTER.match(text):
            failures.append(f"OJ running header/footer remains: {text[:80]}")
        style = paragraph.xpath("string(./w:pPr/w:pStyle/@w:val)", namespaces=ns)
        # Word omits w:pStyle when the paragraph uses the default Normal style.
        if style not in ("", "Normal"):
            failures.append(f"non-Normal paragraph style {style or '<implicit>'}: {text[:80]}")
        expected_size = str(round((profile.footnotes.fontSizePt if REFERENCE_BLOCK.match(text) else 12) * 2))
        for run in paragraph.xpath(".//w:r[.//w:t]", namespaces=ns):
            fonts = run.find("w:rPr/w:rFonts", namespaces=ns)
            size = run.find("w:rPr/w:sz", namespaces=ns)
            if fonts is None or any(fonts.get(qn(f"w:{key}")) != "Times New Roman" for key in ("ascii", "hAnsi", "eastAsia")):
                failures.append(f"incorrect run font: {text[:80]}")
                break
            if size is None or size.get(qn("w:val")) != expected_size:
                failures.append(f"incorrect run size: {text[:80]}")
                break
        alignment = paragraph.xpath("string(./w:pPr/w:jc/@w:val)", namespaces=ns)
        expected_alignment = "both" if classification == "body" else "center"
        if alignment != expected_alignment:
            failures.append(
                f"paragraph {index} alignment mismatch: classification={classification}, "
                f"actual={alignment or '<missing>'}, expected={expected_alignment}, text={text[:80]!r}"
            )
        if ANNEX_START.match(text):
            annexes.append(index)

    section_count = len(document.xpath(".//w:sectPr", namespaces=ns))
    if section_count != 1:
        failures.append(f"expected one final section, found {section_count}")
    if document.xpath(".//w:cols[@w:num != '1']", namespaces=ns):
        failures.append("multi-column section remains")
    expected_breaks = [index - 1 for index in annexes]
    if page_breaks != expected_breaks:
        failures.append(f"ANNEX page breaks are {page_breaks}, expected {expected_breaks}")

    for name, data in entries.items():
        if name.startswith(("word/header", "word/footer")) and name.endswith(".xml"):
            root = etree.fromstring(data)
            for paragraph in root.xpath(".//w:p", namespaces=ns):
                text = " ".join("".join(paragraph.xpath(".//w:t/text()", namespaces=ns)).split())
                if OJ_HEADER_FOOTER.match(text):
                    failures.append(f"OJ running text remains in {name}")
    if failures:
        raise WorkerError(
            "docx_normalization_failed",
            "The final DOCX did not satisfy the normalization contract.",
            details={"failures": failures[:25]},
        )


def normalize_docx(source: Path, target: Path, profile: ConversionProfile) -> None:
    document = Document(source)
    normal = document.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(12)
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Times New Roman")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Times New Roman")
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
    normal._element.rPr.rFonts.set(qn("w:cs"), "Times New Roman")
    margins = profile.page.marginsCm
    for section in document.sections:
        section.top_margin = Cm(margins.top)
        section.bottom_margin = Cm(margins.bottom)
        section.left_margin = Cm(margins.left)
        section.right_margin = Cm(margins.right)
        _one_column(section)
    _format_container(document, profile)
    for section in document.sections:
        _format_container(section.header, profile)
        _format_container(section.footer, profile)
    _insert_annex_breaks(document)
    _normalize_sections(document)
    document.save(target)
    # Perform the library round-trip before package-level edits. A later
    # python-docx save could otherwise rewrite parts edited directly as XML.
    reopened = Document(target)
    reopened.save(target)
    _normalize_footnote_part(target, profile)
    _remove_oj_header_footer_parts(target)
    # This check deliberately runs after the final write/resave step.
    verify_normalized_docx(target, profile)

