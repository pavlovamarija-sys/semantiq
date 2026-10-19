from __future__ import annotations

import hashlib
import json
import re
import zipfile
from collections import Counter
from dataclasses import asdict, replace
from pathlib import Path
from statistics import median
from typing import Literal

import pymupdf
from docx import Document
from docx.oxml import OxmlElement
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.shared import Cm, Pt, RGBColor, Twips
from docx.oxml.ns import qn
from lxml import etree
from .contracts import BoundaryClassification, Box, Classification, DiagnosticRecord, Fragment, Node, SourceRef, StyleEvidence
from .footnote_structure import bind_footnotes, write_ooxml_footnotes


ARTICLE = re.compile(r"^Article\s+(\d+)\s*:?\s*$", re.I)
ANNEX = re.compile(r"^ANNEX\s+([IVXLCDM]+)\s*:?\s*$", re.I)
BARE_ANNEX = re.compile(r"^ANNEX\s*:?\s*$", re.I)
OTHER_HEADING = re.compile(r"^(?:PART\s+[A-Z]|CHAPTER\s+[IVXLCDM1]+|CORRELATION TABLE|Whereas:|HAVE ADOPTED THIS DIRECTIVE:)$", re.I)
LIST_ITEM = re.compile(r"^(?:\d+\.|\([a-z0-9]+\))\s+", re.I)
FOOTNOTE = re.compile(r"^\s*\((?:\d+|\*)\)\s+(?:OJ\b|Official Journal\b)", re.I)
FOOTNOTE_REGION = re.compile(r"^\s*\(\d+\)\s+(?:OJ\b|Official Journal\b|Opinion\b)", re.I)
OJ_DATE = re.compile(r"^\d{1,2}\.\d{1,2}\.\d{4}$")
OJ_PAGE = re.compile(r"^[A-Z]\s+\d+\/\d+$", re.I)
OJ_JOURNAL = re.compile(r"^Official Journal of the European Union$", re.I)
WHEREAS_HEADING = re.compile(r"^Whereas\s*:?$", re.I)
ENACTING_FORMULA = re.compile(r"^(?:HAVE|HAS)\s+ADOPTED\s+THIS\b", re.I)


Decision = DiagnosticRecord


def _clean(text: str) -> str:
    return " ".join(text.split())


def _roman(value: str) -> int:
    values = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    total = previous = 0
    for character in reversed(value.upper()):
        number = values[character]
        total += -number if number < previous else number
        previous = max(previous, number)
    return total


def _node_id(kind: str, refs: list[SourceRef], suffix: str = "") -> str:
    key = f"{kind}|{suffix}|" + "|".join(f"{r.page}:{r.block_index}:{','.join(r.line_ids)}" for r in refs)
    return f"{kind.lower()}-{hashlib.sha256(key.encode()).hexdigest()[:16]}"


def _style(fragments: list[Fragment]) -> StyleEvidence:
    fonts = sorted({font for item in fragments for font in item.fonts if font})
    sizes = sorted({round(size, 2) for item in fragments for size in item.sizes})
    box = fragments[0].box
    return StyleEvidence(fonts, sizes, any(item.bold for item in fragments), any(item.italic for item in fragments), None, round(box.x0, 2))


def _refs(fragments: list[Fragment]) -> list[SourceRef]:
    return [SourceRef(item.page, item.block_index, item.line_ids, item.span_ids, [item.box], item.reading_order, item.reading_order) for item in fragments]


def _ambiguity_diagnostic(kind: str, node_id: str, fragments: list[Fragment], reason: str, evidence: list[str], confidence: float) -> dict[str, object]:
    return asdict(DiagnosticRecord(kind,node_id,_refs(fragments),reason,confidence,"ambiguous",evidence,"unresolved"))


def _log_layout_diagnostics(records: list[dict[str, object]], page_number: int, source: list[SourceRef]) -> list[DiagnosticRecord]:
    return [DiagnosticRecord.from_mapping(record,source=source,node_id=f"layout-page-{page_number}") for record in records]


def _inline_nodes(fragments: list[Fragment]) -> list[Node]:
    result = []
    for item in fragments:
        for record in item.span_records:
            ref = SourceRef(item.page, item.block_index, item.line_ids, [str(record["id"])], [item.box], item.reading_order, item.reading_order)
            style = StyleEvidence([str(record["font"])], [float(record["size"])], bool(record["bold"]), bool(record["italic"]), None, round(item.x0, 2))
            result.append(Node(_node_id("InlineSpan", [ref], str(record["id"])), "InlineSpan", str(record["text"]), [ref], style,
                Classification("deterministic", 1.0, ["Exact source PDF span text and style retained without rewriting."])))
    return result


def _normalize_overlapping_marker_spans(spans: list[dict[str, object]], page: int, block: int,
                                        line: int, corrections: list[dict[str, object]]) -> None:
    """Repair duplicated marker text only when PDF span geometry proves overlap.

    Some OJ PDFs expose the opening glyph as ``(n)`` in metadata even though
    its bounding box covers only ``(``, followed by overlapping ``n`` and ``)``
    spans.  The visual glyph sequence is unambiguous; provenance retains the
    original metadata value.
    """
    if len(spans) < 3:
        return
    first, number, closing = spans[:3]
    match = re.fullmatch(r"\((\d+|\*)\)", str(first.get("text", "")))
    if not match or str(number.get("text", "")) != match.group(1) or str(closing.get("text", "")) != ")":
        return
    first_box, number_box, closing_box = first.get("bbox"), number.get("bbox"), closing.get("bbox")
    if not all(isinstance(value, tuple) and len(value) == 4 for value in (first_box, number_box, closing_box)):
        return
    first_width = float(first_box[2]) - float(first_box[0])
    expected_width = max(float(first.get("size", 1.0)) * .45 * len(str(first.get("text", ""))), 1.0)
    geometrically_truncated = first_width < expected_width * .55
    overlaps_next = float(number_box[0]) <= float(first_box[2]) + 1.0
    contiguous_close = float(closing_box[0]) <= float(number_box[2]) + 1.0
    if not (geometrically_truncated and overlaps_next and contiguous_close):
        return
    first["original_text"] = first["text"]
    first["text"] = "("
    corrections.append({"page": page, "block": block, "line": line,
                        "originalMetadata": f"{match.group(0)}{match.group(1)})",
                        "visualText": match.group(0),
                        "reason": "Overlapping span boxes prove that the first metadata span represents only the opening parenthesis."})


def extract_fragments(pdf_path: Path) -> tuple[list[list[Fragment]], dict[str, object]]:
    pages: list[list[Fragment]] = []
    counts = {"pages": 0, "blocks": 0, "lines": 0, "spans": 0, "dehyphenation": [], "dehyphenationAmbiguities": [],
              "overlappingMarkerCorrections": []}
    with pymupdf.open(pdf_path) as document:
        counts["pages"] = document.page_count
        for page_number, page in enumerate(document, 1):
            data = page.get_text("dict", sort=False)
            fragments: list[Fragment] = []
            for block_index, block in enumerate(data.get("blocks", [])):
                if block.get("type") != 0:
                    continue
                counts["blocks"] += 1
                current: Fragment | None = None
                for line_index, line in enumerate(block.get("lines", [])):
                    counts["lines"] += 1
                    spans = [dict(span) for span in line.get("spans", [])]
                    _normalize_overlapping_marker_spans(spans, page_number, block_index, line_index,
                                                        counts["overlappingMarkerCorrections"])
                    counts["spans"] += len(spans)
                    text = "".join(span.get("text", "") or "".join(char.get("c", "") for char in span.get("chars", [])) for span in spans).strip()
                    if not text:
                        continue
                    x0, y0, x1, y1 = line["bbox"]
                    fonts = [str(span.get("font", "")) for span in spans]
                    sizes = [float(span.get("size", 10)) for span in spans]
                    flags = [int(span.get("flags", 0)) for span in spans]
                    span_records = [{
                        "id": f"p{page_number}-b{block_index}-l{line_index}-s{index}",
                        "text": span.get("text", "") or "".join(char.get("c", "") for char in span.get("chars", [])),
                        "originalText": span.get("original_text", span.get("text", "")),
                        "font": str(span.get("font", "")), "size": float(span.get("size", 10)),
                        "bold": "bold" in str(span.get("font", "")).lower() or bool(int(span.get("flags", 0)) & 16),
                        "italic": any(value in str(span.get("font", "")).lower() for value in ("italic", "oblique")) or bool(int(span.get("flags", 0)) & 2),
                    } for index, span in enumerate(spans)]
                    item = Fragment(page_number, block_index, text, Box(page_number, x0, y0, x1, y1),
                        [f"p{page_number}-b{block_index}-l{line_index}"],
                        [f"p{page_number}-b{block_index}-l{line_index}-s{index}" for index in range(len(spans))],
                        fonts, sizes, any("bold" in font.lower() for font in fonts) or any(flag & 16 for flag in flags),
                        any("italic" in font.lower() or "oblique" in font.lower() for font in fonts) or any(flag & 2 for flag in flags), span_records)
                    if current:
                        height = max(current.y1 - current.y0, item.y1 - item.y0, 1)
                        if item.y0 - current.y1 <= height * 1.15 and abs(item.x0 - current.x0) <= 25:
                            previous = current.text
                            left_span = current.span_records[-1].get("text", "") if current.span_records else previous
                            right_span = item.span_records[0].get("text", "") if item.span_records else item.text
                            if _is_safe_line_break_hyphen(left_span, right_span, current, item):
                                current.text = previous[:-1] + item.text
                                if current.span_records and current.span_records[-1].get("text") == left_span:
                                    current.span_records[-1]["text"] = left_span[:-1]
                                counts["dehyphenation"].append({"page": page_number, "block": block_index, "fromLines": current.line_ids[-1:] + item.line_ids[:1], "removed": "-", "left": left_span, "right": right_span, "result": current.text})
                            elif _is_ambiguous_line_break_hyphen(previous, item.text):
                                counts["dehyphenationAmbiguities"].append({"page": page_number, "block": block_index, "left": previous, "right": item.text, "reason": "Hyphen occurs at a physical line boundary but lexical evidence is insufficient to distinguish a compound from a split word."})
                                current.text += " " + item.text
                            else:
                                current.text += " " + item.text
                            current.box = Box(page_number, min(current.x0, item.x0), min(current.y0, item.y0), max(current.x1, item.x1), max(current.y1, item.y1))
                            current.line_ids.extend(item.line_ids); current.span_ids.extend(item.span_ids)
                            current.fonts.extend(item.fonts); current.sizes.extend(item.sizes)
                            current.span_records.extend(item.span_records)
                            current.bold = current.bold or item.bold; current.italic = current.italic or item.italic
                            continue
                        fragments.append(current)
                    current = item
                if current:
                    fragments.append(current)
            fragments = _dehyphenate_fragment_boundaries(fragments, counts)
            pages.append(fragments)
    return pages, counts


def _is_safe_line_break_hyphen(left: str, right: str, previous: Fragment, current: Fragment, *, require_same_block: bool = True) -> bool:
    """Return true only for a word-shaped hyphen at a real PDF line join."""
    if previous.page != current.page or (require_same_block and previous.block_index != current.block_index):
        return False
    if not left.strip().endswith("-"):
        return False
    left_match = re.search(r"([A-Za-z]{2,})-$", left.strip())
    right_match = re.match(r"^([a-z][A-Za-z]+)", right.strip())
    if not left_match or not right_match:
        return False
    left_word = left_match.group(1)
    if left_word.lower() in {"well", "self", "non", "semi", "cross", "pre", "post", "anti", "co", "multi", "sub", "inter", "intra"}:
        if not ((left_word.lower() == "inter" and right_match.group(1).lower().startswith("ests")) or (left_word.lower() == "sub" and right_match.group(1).lower().startswith("ject"))):
            return False
    if not previous.line_ids or not current.line_ids:
        return False
    left_line = _source_line_index(previous.line_ids[-1])
    right_line = _source_line_index(current.line_ids[0])
    if require_same_block:
        return right_line == left_line + 1
    height = max(previous.y1 - previous.y0, current.y1 - current.y0, 1)
    return current.y0 - previous.y1 <= height * 1.6 and abs(current.x0 - previous.x0) <= 25


def _is_ambiguous_line_break_hyphen(left: str, right: str) -> bool:
    return bool(re.search(r"[A-Za-z]{2,}-$", left.strip()) and re.match(r"^[a-z][A-Za-z]+", right.strip()))


def _dehyphenate_fragment_boundaries(fragments: list[Fragment], counts: dict[str, object]) -> list[Fragment]:
    result: list[Fragment] = []
    for fragment in fragments:
        if result:
            previous = result[-1]
            left = previous.text.strip()
            right = fragment.text.lstrip()
            if _is_safe_line_break_hyphen(left, right, previous, fragment, require_same_block=False):
                previous.text = left[:-1] + right
                if previous.span_records and str(previous.span_records[-1].get("text", "")).endswith("-"):
                    previous.span_records[-1]["text"] = str(previous.span_records[-1]["text"])[:-1]
                previous.box = Box(previous.page, min(previous.x0, fragment.x0), min(previous.y0, fragment.y0), max(previous.x1, fragment.x1), max(previous.y1, fragment.y1))
                previous.line_ids.extend(fragment.line_ids); previous.span_ids.extend(fragment.span_ids); previous.fonts.extend(fragment.fonts); previous.sizes.extend(fragment.sizes); previous.span_records.extend(fragment.span_records)
                previous.bold = previous.bold or fragment.bold; previous.italic = previous.italic or fragment.italic
                counts["dehyphenation"].append({"page": previous.page, "block": previous.block_index, "fromLines": previous.line_ids[-2:], "removed": "-", "left": left, "right": right, "result": previous.text})
                continue
            if _is_ambiguous_line_break_hyphen(left, right):
                counts["dehyphenationAmbiguities"].append({"page": previous.page, "block": previous.block_index, "left": left, "right": right, "reason": "Physical fragment boundary may represent either a split word or a legitimate compound."})
        result.append(fragment)
    return result


def _two_column_order(items: list[Fragment], width: float) -> list[Fragment]:
    midpoint = width / 2
    margin = width * .015
    left = [item for item in items if item.x1 < midpoint - margin]
    right = [item for item in items if item.x0 > midpoint + margin]
    strict_overlaps = sum(1 for a in left for b in right if min(a.y1, b.y1) >= max(a.y0, b.y0))
    if len(left) < 3 or len(right) < 3 or strict_overlaps < 3:
        left = [item for item in items if item.x1-item.x0 <= width*.48 and (item.x0+item.x1)/2 < midpoint]
        right = [item for item in items if item.x1-item.x0 <= width*.48 and (item.x0+item.x1)/2 >= midpoint]
    overlaps = sum(1 for a in left for b in right if min(a.y1, b.y1) >= max(a.y0, b.y0))
    if len(left) < 3 or len(right) < 3 or overlaps < 3:
        return sorted(items, key=lambda item: (item.y0, item.x0))
    gutter_left, gutter_right = max(item.x1 for item in left), min(item.x0 for item in right)
    paired_y = min((max(a.y0, b.y0) for a in left for b in right if min(a.y1, b.y1) >= max(a.y0, b.y0)), default=0)
    full = [item for item in items if item.x0 < gutter_left and item.x1 > gutter_right]
    top = sorted((item for item in items if item.y0 < paired_y - 2 and (item in full or abs((item.x0 + item.x1) / 2 - midpoint) < width * .17)), key=lambda item: (item.y0, item.x0))
    remaining = [item for item in items if item not in top]
    return top + sorted((item for item in remaining if (item.x0 + item.x1) / 2 < midpoint), key=lambda item: (item.y0, item.x0)) + sorted((item for item in remaining if (item.x0 + item.x1) / 2 >= midpoint), key=lambda item: (item.y0, item.x0))


def _page_layout_order(items: list[Fragment], width: float) -> tuple[list[Fragment], dict[str, object]]:
    """Infer reading order for one page from geometry, without page-number or text controls."""
    if not items:
        return [], {"layout": "empty", "regions": [], "confidence": 1.0, "ambiguities": []}
    midpoint = width / 2
    margin = width * .015
    left = [item for item in items if item.x1 < midpoint - margin]
    right = [item for item in items if item.x0 > midpoint + margin]
    overlap_pairs = [(a, b) for a in left for b in right if min(a.y1, b.y1) >= max(a.y0, b.y0)]
    if len(left) < 3 or len(right) < 3 or len(overlap_pairs) < 3:
        fallback_left = [item for item in items if item.x1-item.x0 <= width*.48 and (item.x0+item.x1)/2 < midpoint]
        fallback_right = [item for item in items if item.x1-item.x0 <= width*.48 and (item.x0+item.x1)/2 >= midpoint]
        fallback_pairs = [(a, b) for a in fallback_left for b in fallback_right if min(a.y1, b.y1) >= max(a.y0, b.y0)]
        if len(fallback_left) >= 3 and len(fallback_right) >= 3 and len(fallback_pairs) >= 3:
            left, right, overlap_pairs = fallback_left, fallback_right, fallback_pairs
    if len(left) < 3 or len(right) < 3 or len(overlap_pairs) < 3:
        ordered = sorted(items, key=lambda item: (item.y0, item.x0))
        return ordered, {"layout": "single-column", "regions": [{"kind": "single-column", "y0": min(i.y0 for i in items), "y1": max(i.y1 for i in items), "fragments": len(items)}], "confidence": .98, "ambiguities": []}

    active_top = min(max(a.y0, b.y0) for a, b in overlap_pairs)
    active_bottom = max(min(a.y1, b.y1) for a, b in overlap_pairs)
    gutter_left = max((item.x1 for item in left if item.y1 >= active_top and item.y0 <= active_bottom), default=midpoint-margin)
    gutter_right = min((item.x0 for item in right if item.y1 >= active_top and item.y0 <= active_bottom), default=midpoint+margin)
    full = [item for item in items if item.x0 < gutter_left and item.x1 > gutter_right]
    top = sorted([item for item in items if item.y1 < active_top and item not in left and item not in right or item in full and item.y0 < active_top], key=lambda item: (item.y0, item.x0))
    bottom = sorted([item for item in full if item.y0 > active_bottom], key=lambda item: (item.y0, item.x0))
    reserved = {id(item) for item in top + bottom}
    middle = [item for item in items if id(item) not in reserved]
    middle_left = sorted([item for item in middle if (item.x0 + item.x1) / 2 < midpoint], key=lambda item: (item.y0, item.x0))
    middle_right = sorted([item for item in middle if (item.x0 + item.x1) / 2 >= midpoint], key=lambda item: (item.y0, item.x0))
    ordered = top + middle_left + middle_right + bottom
    ambiguities = []
    straddlers = [item for item in middle if item.x0 < midpoint < item.x1 and item not in full]
    if straddlers:
        ambiguities.append(_ambiguity_diagnostic("layout-ambiguity","mid-region-gutter-straddler",straddlers,
            "The fragment crosses the inferred midpoint but does not span the complete inferred gutter.",
            ["Candidate interpretation: full-width separator.","Candidate interpretation: wide column paragraph."],.65))
    regions = []
    if top: regions.append({"kind": "full-width-top", "y0": min(i.y0 for i in top), "y1": max(i.y1 for i in top), "fragments": len(top)})
    regions.append({"kind": "two-column", "y0": min(i.y0 for i in middle), "y1": max(i.y1 for i in middle), "leftFragments": len(middle_left), "rightFragments": len(middle_right), "gutter": [round(gutter_left,2), round(gutter_right,2)]})
    if bottom: regions.append({"kind": "full-width-bottom", "y0": min(i.y0 for i in bottom), "y1": max(i.y1 for i in bottom), "fragments": len(bottom)})
    return ordered, {"layout": "mixed" if top or bottom else "two-column", "regions": regions, "confidence": .92 if not ambiguities else .72, "ambiguities": ambiguities}


def _y_groups(items: list[Fragment], tolerance: float = 2.0) -> list[list[Fragment]]:
    groups: list[list[Fragment]] = []
    for item in sorted(items, key=lambda value: (value.y0, value.x0)):
        group = next((row for row in reversed(groups[-3:]) if abs(median(value.y0 for value in row) - item.y0) <= tolerance), None)
        if group is None: groups.append([item])
        else: group.append(item)
    return [sorted(group, key=lambda value: value.x0) for group in groups]


def _signature_matches(row: list[Fragment], prototype: list[float], tolerance: float = 14.0) -> bool:
    return len(row) == len(prototype) and all(abs(item.x0-anchor) <= tolerance for item,anchor in zip(row,prototype))


def _cluster_positions(values: list[float], tolerance: float = 1.25) -> list[float]:
    clusters: list[list[float]] = []
    for value in sorted(values):
        if clusters and abs(value - median(clusters[-1])) <= tolerance:
            clusters[-1].append(value)
        else:
            clusters.append([value])
    return [round(median(cluster), 2) for cluster in clusters]


def _ruled_table_regions(page: pymupdf.Page, items: list[Fragment]) -> list[dict[str, object]]:
    """Detect explicit PDF table grids from thin horizontal/vertical rules."""
    horizontal: list[tuple[float, float, float]] = []
    vertical: list[tuple[float, float, float]] = []
    for drawing in page.get_drawings():
        rect = drawing.get("rect")
        if rect is None:
            continue
        width, height = float(rect.x1 - rect.x0), float(rect.y1 - rect.y0)
        if width >= page.rect.width * .12 and height <= 1.5:
            horizontal.append((float(rect.y0 + rect.y1) / 2, float(rect.x0), float(rect.x1)))
        elif height >= page.rect.height * .035 and width <= 1.5:
            vertical.append((float(rect.x0 + rect.x1) / 2, float(rect.y0), float(rect.y1)))
    if len(horizontal) < 3 or len(vertical) < 3:
        return []

    raw_x = _cluster_positions([value[0] for value in vertical])
    raw_y = _cluster_positions([value[0] for value in horizontal])
    xs = [x for x in raw_x if sum(abs(vx - x) <= 1.25 for vx, _, _ in vertical) >= 2]
    ys = [y for y in raw_y if sum(abs(hy - y) <= 1.25 for hy, _, _ in horizontal) >= 2]
    if len(xs) < 3 or len(ys) < 3:
        return []
    left, right, top, bottom = xs[0], xs[-1], ys[0], ys[-1]
    # A partial set of internal rules is not a closed table boundary. Narrow
    # tables remain eligible for the independent whitespace-grid detector.
    if right - left < page.rect.width * .55:
        return []
    region_items = [item for item in items
                    if left - 2 <= (item.x0 + item.x1) / 2 <= right + 2
                    and top - 2 <= (item.y0 + item.y1) / 2 <= bottom + 2]
    if len(region_items) < (len(xs) - 1) * 2:
        return []
    return [{"groupStart": None, "groupEnd": None, "anchors": xs[:-1],
             "columnBoundaries": xs, "rowBoundaries": ys, "items": region_items,
             "confidence": .995, "detection": "ruled-grid",
             "evidence": ["Repeated thin horizontal and vertical PDF drawing segments form a connected cell grid.",
                          "Text centers fall inside the ruled cell intervals."]}]


def _aligned_table_regions(items: list[Fragment], width: float) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    """Find whitespace-aligned grids from repeated row/column geometry."""
    groups = _y_groups(items)
    candidates: list[dict[str, object]] = []
    used_groups: set[int] = set()
    for seed_index, seed in enumerate(groups):
        if seed_index in used_groups or not 2 <= len(seed) <= 6:
            continue
        prototype = [item.x0 for item in seed]
        matches = [index for index,row in enumerate(groups) if _signature_matches(row, prototype)]
        clusters: list[list[int]] = []
        for index in matches:
            if not clusters or groups[index][0].y0 - groups[clusters[-1][-1]][0].y0 > 45:
                clusters.append([index])
            else: clusters[-1].append(index)
        cluster = next((value for value in clusters if seed_index in value and len(value) >= 3), None)
        if not cluster:
            continue
        anchors = [round(median(groups[index][column].x0 for index in cluster), 2) for column in range(len(seed))]
        # Dense legal correlation tables commonly have four to six columns.
        # Require proportionally narrower, but still materially separated,
        # anchors as the observed column count increases.
        minimum_anchor_gap = width * min(.15, .4 / len(anchors))
        if any(right-left < minimum_anchor_gap for left,right in zip(anchors,anchors[1:])):
            continue
        first,last=min(cluster),max(cluster)
        if first > 0 and len(groups[first-1]) == len(anchors) and groups[first][0].y0-groups[first-1][0].y0 <= 35:
            centers=[(item.x0+item.x1)/2 for item in groups[first-1]]
            boundaries=[(anchors[i]+anchors[i+1])/2 for i in range(len(anchors)-1)]
            if all((column == sum(center > boundary for boundary in boundaries)) for column,center in enumerate(centers)):
                first -= 1
        region_groups=list(range(first,last+1))
        region_items=[item for index in region_groups for item in groups[index]]
        if len(region_items) < len(anchors)*3: continue
        candidates.append({"groupStart":first,"groupEnd":last,"anchors":anchors,"items":region_items,"confidence":.97,"evidence":["At least three repeated row baselines share stable column anchors.","Region boundaries follow contiguous aligned rows; one geometrically compatible header row may precede them."]})
        used_groups.update(region_groups)

    # Join same-page portions that share a grid and are separated only by sparse assignable rows.
    joined=[]
    for candidate in sorted(candidates,key=lambda value:min(item.y0 for item in value["items"])):
        previous=joined[-1] if joined else None
        compatible=previous and len(previous["anchors"])==len(candidate["anchors"]) and all(abs(a-b)<=15 for a,b in zip(previous["anchors"],candidate["anchors"]))
        if compatible:
            previous_end=max(item.y1 for item in previous["items"]); current_start=min(item.y0 for item in candidate["items"])
            intervening=[item for item in items if previous_end<item.y0<current_start]
            boundaries=[(previous["anchors"][i]+previous["anchors"][i+1])/2 for i in range(len(previous["anchors"])-1)]
            assignable=all(0<=sum(((item.x0+item.x1)/2)>boundary for boundary in boundaries)<len(previous["anchors"]) for item in intervening)
            if current_start-previous_end<=100 and assignable:
                previous["items"].extend(intervening+candidate["items"])
                previous["items"]=sorted({id(item):item for item in previous["items"]}.values(),key=lambda value:(value.y0,value.x0))
                previous["confidence"]=min(float(previous["confidence"]),float(candidate["confidence"]),.94)
                previous["evidence"].append("Joined compatible same-page grid portions through sparse rows assignable to the shared columns.")
                continue
        joined.append(candidate)
    candidates=joined

    # Extend stable grids through a final neighboring row even when wrapped cells change fragment count.
    occupied_before={id(item) for candidate in candidates for item in candidate["items"]}
    for candidate in candidates:
        row_groups=_y_groups(candidate["items"])
        starts=sorted(median(item.y0 for item in row) for row in row_groups)
        typical=median([b-a for a,b in zip(starts,starts[1:])]) if len(starts)>1 else 15
        end=max(item.y1 for item in candidate["items"])
        following=[row for row in _y_groups([item for item in items if id(item) not in occupied_before and item.y0>end]) if row]
        for row in following:
            gap=min(item.y0 for item in row)-end
            if gap>max(24,typical*2.2): break
            boundaries=[(candidate["anchors"][i]+candidate["anchors"][i+1])/2 for i in range(len(candidate["anchors"])-1)]
            occupied_columns={min(sum(((item.x0+item.x1)/2)>boundary for boundary in boundaries),len(candidate["anchors"])-1) for item in row}
            style_sizes=[size for item in candidate["items"] for size in item.sizes]
            row_sizes=[size for item in row for size in item.sizes]
            style_match=not style_sizes or not row_sizes or abs(median(style_sizes)-median(row_sizes))<=1
            if style_match and len(occupied_columns)>=2:
                candidate["items"].extend(row); occupied_before.update(id(item) for item in row); end=max(item.y1 for item in row)
                candidate["evidence"].append("Extended through an adjacent compatible row whose wrapped cells changed raw fragment count.")
            else: break

    # Sparse grids: repeated paired vertical rhythm in one populated column plus a distant aligned cell.
    remaining=[item for item in items if all(id(item) not in {id(x) for x in c["items"]} for c in candidates)]
    x_clusters: list[list[Fragment]]=[]
    for item in sorted(remaining,key=lambda value:(value.x0,value.y0)):
        cluster=next((value for value in x_clusters if abs(median(x.x0 for x in value)-item.x0)<=4),None)
        if cluster is None: x_clusters.append([item])
        else: cluster.append(item)
    for cluster in x_clusters:
        cluster=sorted(cluster,key=lambda value:value.y0)
        for start in range(len(cluster)-5):
            sequence=cluster[start:start+6]
            deltas=[sequence[i+1].y0-sequence[i].y0 for i in range(5)]
            if max(x.y1 for x in sequence)-min(x.y0 for x in sequence)>140: continue
            if max(abs(deltas[i]-deltas[i+2]) for i in range(3))>2.5 or abs(median(deltas[::2])-median(deltas[1::2]))<3: continue
            distant=[item for item in remaining if item.x0-sequence[0].x0 > width*.3 and sequence[0].y0-3 <= item.y0 <= sequence[-1].y1+3]
            if not distant: continue
            second_anchor=round(median(item.x0 for item in distant),2)
            table_items=sequence+distant
            candidates.append({"groupStart":None,"groupEnd":None,"anchors":[round(median(x.x0 for x in sequence),2),second_anchor],"items":table_items,"confidence":.82,"sparsePairSize":2,"evidence":["Repeated alternating vertical rhythm identifies multi-fragment records in one column.","At least one distant aligned fragment establishes a second column."]})
            break
    # Reject overlaps, preferring larger/high-confidence regions.
    selected=[]; occupied:set[int]=set(); rejected=[]
    for candidate in sorted(candidates,key=lambda value:(-len(value["items"]),-float(value["confidence"]))):
        ids={id(item) for item in candidate["items"]}
        if ids & occupied: continue
        rows=_y_groups(candidate["items"])
        if len(candidate["anchors"])==2 and len(rows)<=4 and not candidate.get("sparsePairSize"):
            y0,y1=min(item.y0 for item in candidate["items"]),max(item.y1 for item in candidate["items"])
            outside=[item for item in items if id(item) not in ids]
            midpoint=width/2
            left_out=[item for item in outside if (item.x0+item.x1)/2<midpoint]
            right_out=[item for item in outside if (item.x0+item.x1)/2>=midpoint]
            sustained=min(len(left_out),len(right_out))>=6 and any(item.y0<y0 for item in left_out) and any(item.y0<y0 for item in right_out) and any(item.y0>y1 for item in left_out) and any(item.y0>y1 for item in right_out)
            bullet_like=sum(bool(re.match(r"^(?:[\u2022\u2014\u2013\ufffd]|\([a-z0-9]+\))",_clean(item.text),re.I)) for item in candidate["items"])
            if sustained and bullet_like>=max(2,len(candidate["items"])//3):
                rejected.append(_ambiguity_diagnostic("table-rejection","aligned-body-columns-not-table",candidate["items"],
                    "The short aligned region is better explained by independent body-column list/paragraph flow than by a table.",
                    ["Candidate anchors coincide with sustained body columns above and below the region.","List/bullet and continuation indentation dominates a short candidate.","Rejected candidate interpretation: table.","Selected interpretation: independent aligned list/paragraph flows."],.94))
                continue
        selected.append(candidate); occupied.update(ids)
    return sorted(selected,key=lambda value:min(item.y0 for item in value["items"])),rejected


def _table_rows_from_region(region: dict[str, object]) -> list[list[list[Fragment]]]:
    items=list(region["items"]); anchors=list(region["anchors"])
    if region.get("detection") == "ruled-grid":
        x_edges = list(region["columnBoundaries"]); y_edges = list(region["rowBoundaries"])
        rows: list[list[list[Fragment]]] = []
        for top, bottom in zip(y_edges, y_edges[1:]):
            cells = [[] for _ in range(len(x_edges) - 1)]
            for item in items:
                center_x, center_y = (item.x0 + item.x1) / 2, (item.y0 + item.y1) / 2
                if not top - 1 <= center_y <= bottom + 1:
                    continue
                column = next((index for index, (left, right) in enumerate(zip(x_edges, x_edges[1:]))
                               if left - 1 <= center_x <= right + 1), None)
                if column is not None:
                    cells[column].append(item)
            rows.append([sorted(cell, key=lambda value: (value.y0, value.x0)) for cell in cells])
        return rows
    if region.get("sparsePairSize"):
        primary=sorted([item for item in items if abs(item.x0-anchors[0])<=8],key=lambda value:value.y0)
        rows=[]
        for index in range(0,len(primary),int(region["sparsePairSize"])):
            chunk=primary[index:index+int(region["sparsePairSize"])]
            if not chunk: continue
            end=primary[index+int(region["sparsePairSize"])].y0 if index+int(region["sparsePairSize"])<len(primary) else max(x.y1 for x in items)+1
            rows.append([chunk,sorted([item for item in items if abs(item.x0-anchors[1])<=20 and chunk[0].y0-2<=item.y0<end],key=lambda value:value.y0)])
        return rows
    rows=[]
    boundaries=[(anchors[i]+anchors[i+1])/2 for i in range(len(anchors)-1)]
    for group in _y_groups(items):
        cells=[[] for _ in anchors]
        for item in group:
            column=sum(((item.x0+item.x1)/2)>boundary for boundary in boundaries)
            cells[min(column,len(cells)-1)].append(item)
        rows.append(cells)
    return rows


def _link_cross_page_tables(nodes: list[Node], decisions: list[Decision]) -> list[dict[str, object]]:
    tables=[node for node in nodes if node.type=="Table"]
    links=[]; chains=[]; current=[]
    for table in tables:
        if not current:
            current=[table]; continue
        previous=current[-1]
        previous_anchors=[float(value) for value in previous.attributes["columnAnchors"]]
        current_anchors=[float(value) for value in table.attributes["columnAnchors"]]
        normalized_grid_matches=(len(previous_anchors)==len(current_anchors) and
            all(abs((a-previous_anchors[0])-(b-current_anchors[0]))<=15 for a,b in zip(previous_anchors,current_anchors)))
        previous_header = previous.children[0].exact_text if previous.children else ""
        current_header = table.children[0].exact_text if table.children else ""
        repeated_header = bool(previous_header and current_header and previous_header == current_header)
        page_edge_continuation = (float(previous.attributes["y1"])>=float(previous.attributes["pageHeight"])*.82 and
                                  float(table.attributes["y0"])<=float(table.attributes["pageHeight"])*.22)
        compatible=(int(table.attributes["page"])==int(previous.attributes["page"])+1 and
            int(table.attributes["columns"])==int(previous.attributes["columns"]) and normalized_grid_matches and
            (page_edge_continuation or repeated_header))
        if compatible: current.append(table)
        else:
            if len(current)>1: chains.append(current)
            current=[table]
    if len(current)>1: chains.append(current)
    for chain in chains:
        logical_id=_node_id("LogicalTable",[ref for table in chain for ref in table.source])
        first_header=chain[0].children[0].exact_text if chain[0].children else ""
        pages=[int(table.attributes["page"]) for table in chain]
        for index,table in enumerate(chain):
            table.attributes.update({"logicalTableId":logical_id,"logicalTablePages":pages,"physicalSegmentIndex":index,"physicalSegmentCount":len(chain),"crossPageContinuation":index>0})
            if index>0 and table.children and table.children[0].exact_text==first_header:
                table.children[0].attributes.update({"repeatedHeader":True,"repeatsLogicalHeader":chain[0].children[0].id})
            decisions.append(Decision("cross-page-table",logical_id,table.source,
                f"Linked physical table segment {index+1}/{len(chain)} on page {table.attributes['page']} by compatible columns, typography, page-edge continuation and repeated/compatible first-row evidence.",.96))
        links.append({"logicalTableId":logical_id,"pages":pages,"physicalSegments":[table.id for table in chain],"columns":chain[0].attributes["columns"],"rows":sum(int(table.attributes["rows"]) for table in chain),"repeatedHeaderRows":[table.children[0].id for table in chain[1:] if table.children and table.children[0].attributes.get("repeatedHeader")],"representation":"One logical table identity with page-preserving physical segments."})
    return links


def _table_node(name: str, rows: list[list[list[Fragment]]], decisions: list[Decision]) -> Node:
    row_nodes: list[Node] = []
    all_fragments = [fragment for row in rows for cell in row for fragment in cell]
    for row_index, row in enumerate(rows):
        cell_nodes = []
        for column_index, fragments in enumerate(row):
            evidence_fragments = fragments or [fragment for row_cell in row for fragment in row_cell]
            refs = _refs(evidence_fragments)
            text = "\n".join(_clean(item.text) for item in fragments)
            cell = Node(_node_id("TableCell", refs, f"{name}:{row_index}:{column_index}"), "TableCell", text, refs,
                _style(evidence_fragments),
                Classification("deterministic", .99, ["Cell assigned from repeated x anchor and row baseline within an explicit table region."]),
                _inline_nodes(fragments), {"row": row_index, "column": column_index, "inferredEmpty": not fragments})
            cell_nodes.append(cell)
            decisions.append(Decision("classification", cell.id, refs, f"Classified as table cell {row_index},{column_index} in {name}.", .99))
            if len(fragments) > 1:
                decisions.append(Decision("merge", cell.id, refs, "Merged multiple source fragments into one logical table cell using row range, x anchor, and shared style evidence.", .98))
        refs = [ref for cell in cell_nodes for ref in cell.source]
        row_nodes.append(Node(_node_id("TableRow", refs, f"{name}:{row_index}"), "TableRow", "\t".join(cell.exact_text for cell in cell_nodes), refs,
            cell_nodes[0].style if cell_nodes else StyleEvidence([], [], False, False, None, 0), Classification("deterministic", .99, ["Cells share a row baseline/range."]), cell_nodes, {"row": row_index}))
    refs = _refs(all_fragments)
    node = Node(_node_id("Table", refs, name), "Table", "\n".join(row.exact_text for row in row_nodes), refs,
        _style(all_fragments), Classification("deterministic", .99, ["Whitespace-aligned table detected from repeated x anchors and row baselines."]), row_nodes,
        {"name": name, "rows": len(rows), "columns": max(len(row) for row in rows), "detection": "whitespace-aligned"})
    decisions.append(Decision("classification", node.id, refs, f"Reconstructed {name} as a native table from repeated geometric alignment.", .99))
    decisions.append(Decision("split", node.id, refs, f"Split the aligned {name} region into {len(rows)} rows and {max(len(row) for row in rows)} columns without changing cell text.", .99))
    return node


def _rows_by_y(items: list[Fragment], columns: list[float], tolerance: float = 2.0) -> list[list[list[Fragment]]]:
    groups: list[list[Fragment]] = []
    for item in sorted(items, key=lambda value: (value.y0, value.x0)):
        group = next((row for row in groups if abs(row[0].y0 - item.y0) <= tolerance), None)
        if group is None:
            groups.append([item])
        else:
            group.append(item)
    rows = []
    for group in groups:
        cells = [[] for _ in columns]
        for item in sorted(group, key=lambda value: value.x0):
            index = min(range(len(columns)), key=lambda value: abs(item.x0 - columns[value]))
            cells[index].append(item)
        rows.append(cells)
    return rows


def _classify_text_node(fragments: list[Fragment], decisions: list[Decision], page_width: float | None = None) -> Node:
    text = " ".join(_clean(item.text) for item in fragments)
    refs = _refs(fragments)
    if ARTICLE.match(text):
        kind, attrs, reason, confidence = "Heading", {"kind": "article", "ordinal": int(ARTICLE.match(text).group(1))}, "Exact legal label outside a table, supported by isolated-line geometry.", .99
    elif ANNEX.match(text):
        kind, attrs, reason, confidence = "Heading", {"kind": "annex", "ordinal": _roman(ANNEX.match(text).group(1))}, "Exact annex label outside a table, supported by isolated centered-line geometry.", .99
    elif BARE_ANNEX.match(text):
        kind, attrs, reason, confidence = "Heading", {"kind": "annex", "ordinal": None}, "Exact unnumbered annex label outside a table, supported by isolated centered-line geometry.", .99
    elif OTHER_HEADING.match(text) or (fragments[0].bold and len(text) < 120):
        kind, attrs, reason, confidence = "Heading", {"kind": "other"}, "Short isolated text with legal-label or typographic heading evidence.", .9
    elif FOOTNOTE.match(text):
        kind, attrs, reason, confidence = "Footnote", {}, "OJ citation marker and note-body pattern.", .95
    elif LIST_ITEM.match(text):
        kind, attrs, reason, confidence = "ListItem", {"marker": LIST_ITEM.match(text).group(0).strip()}, "Leading legal numbering marker.", .95
    else:
        kind, attrs, reason, confidence = "Paragraph", {}, "Default logical body paragraph after layout-region classification.", .9
    node = Node(_node_id(kind, refs), kind, text, refs, _style(fragments), Classification("deterministic", confidence, [reason]), _inline_nodes(fragments), attrs)
    if kind == "Heading" and page_width is not None:
        center = sum((item.x0 + item.x1) / 2 for item in fragments) / len(fragments)
        node.style = replace(node.style, alignment="center" if abs(center - page_width / 2) <= page_width * .08 else "left")
    decisions.append(Decision("classification", node.id, refs, reason, confidence))
    if len(fragments) > 1:
        decisions.append(Decision("merge", node.id, refs, "Merged adjacent fragments with compatible geometry, style, region, and continuation evidence.", .96))
    return node


def _merge_fragments(items: list[Fragment]) -> list[list[Fragment]]:
    groups: list[list[Fragment]] = []
    for item in items:
        if not groups:
            groups.append([item]); continue
        previous = groups[-1][-1]
        previous_text, current_text = _clean(previous.text), _clean(item.text)
        height = max(previous.y1 - previous.y0, item.y1 - item.y0, 1)
        same_page_column = previous.page == item.page and abs(previous.x0 - item.x0) <= 25 and 0 <= item.y0 - previous.y1 <= height * 1.6
        style_match = abs(max(previous.sizes or [10]) - max(item.sizes or [10])) <= 1.0 and previous.bold == item.bold
        continuation = previous_text and not previous_text.endswith((".", ";", ":", "?", "!")) and bool(current_text) and (current_text[0].islower() or current_text[0].isdigit() or current_text[0] in "'\"")
        if same_page_column and style_match and continuation and not ARTICLE.match(previous_text) and not ANNEX.match(previous_text):
            groups[-1].append(item)
        else:
            groups.append([item])
    return groups


def _source_line_index(line_id: str) -> int:
    match = re.search(r"-l(\d+)$", line_id)
    if not match:
        raise ValueError(f"Invalid source line identity: {line_id}")
    return int(match.group(1))


def _boundary_candidate(left: Node, right: Node) -> bool:
    if left.type not in {"Paragraph", "ListItem"} or right.type != "Paragraph" or not left.source or not right.source:
        return False
    if left.source[-1].page != right.source[0].page or right.source[0].reading_order_start != left.source[-1].reading_order_end + 1:
        return False
    left_text, right_text = _clean(left.exact_text), _clean(right.exact_text)
    return bool(left_text and right_text and not re.search(r"[.;:?!]\s*$", left_text)
        and (right_text[0].islower() or right_text[0].isdigit() or right_text[0] in "'\"("))


def classify_paragraph_boundary(left: Node, right: Node) -> BoundaryClassification:
    """Classify one candidate boundary from generalized source geometry and provenance only."""
    if not _boundary_candidate(left, right):
        return BoundaryClassification("ABSTAIN", 0.0, "The nodes do not form an eligible consecutive paragraph-continuation boundary.",
            ["Boundary is outside the narrow deterministic classifier contract."])
    left_ref, right_ref = left.source[-1], right.source[0]
    left_box, right_box = left_ref.boxes[-1], right_ref.boxes[0]
    left_text, right_text = _clean(left.exact_text), _clean(right.exact_text)
    same_block = left_ref.block_index == right_ref.block_index
    left_line = _source_line_index(left_ref.line_ids[-1])
    right_line = _source_line_index(right_ref.line_ids[0])
    same_baseline = abs(left_box.y0 - right_box.y0) <= 1.25
    horizontal_gap = right_box.x0 - left_box.x1
    vertical_gap = right_box.y0 - left_box.y1
    font_overlap = bool(set(left.style.font_families) & set(right.style.font_families))
    size_overlap = bool({round(value, 1) for value in left.style.font_sizes} & {round(value, 1) for value in right.style.font_sizes})
    style_compatible = font_overlap and size_overlap and left.style.bold == right.style.bold and left.style.italic == right.style.italic
    lexical_continuation = not re.search(r"[.!?;:]\s*$", left_text) and bool(re.match(r"^[a-z0-9('\"]", right_text))
    top_margin_date = bool(re.fullmatch(r"\d{1,2}\.\d{1,2}\.\d{4}", left_text)) and left_box.y0 < 70
    if top_margin_date:
        return BoundaryClassification("KEEP_BOUNDARY", 1.0,
            "A top-margin publication-date running header is structurally separate from following body text.",
            ["Left text has a publication-date form.", "Left bounding box is in the top margin."])
    if same_block and right_line - left_line > 1:
        return BoundaryClassification("KEEP_BOUNDARY", .99,
            "Intervening source lines prove that these fragments are not directly contiguous.",
            [f"Left source line index is {left_line}.", f"Right source line index is {right_line}."])
    if style_compatible and lexical_continuation and same_block and right_line > left_line and same_baseline and -2 <= horizontal_gap <= 15:
        return BoundaryClassification("MERGE", .99,
            "Adjacent same-block fragments share a baseline and continue lexically with matching style.",
            ["Same PDF block and baseline.", f"Horizontal gap is {horizontal_gap:.3f} points.", "Typography matches."])
    if style_compatible and lexical_continuation and same_block and right_line == left_line + 1 and vertical_gap <= 2:
        return BoundaryClassification("MERGE", .98,
            "Consecutive source lines in one block form a tightly spaced lexical continuation.",
            ["Consecutive source line identities.", f"Vertical gap is {vertical_gap:.3f} points.", "Typography matches."])
    return BoundaryClassification("ABSTAIN", 0.0,
        "The boundary lacks sufficient generalized deterministic evidence for merge or retention.",
        ["No validated deterministic rule matched; the original boundary is retained."])


def _merge_text_nodes(left: Node, right: Node, classification: BoundaryClassification) -> Node:
    refs = left.source + right.source
    node_type = left.type
    attributes = dict(left.attributes)
    attributes["boundaryResolution"] = [*left.attributes.get("boundaryResolution", []), {
        "decision": classification.decision, "confidence": classification.confidence,
        "rightNodeId": right.id, "reason": classification.reason,
    }]
    return Node(_node_id(node_type, refs), node_type, left.exact_text.rstrip() + " " + right.exact_text.lstrip(), refs,
        left.style, Classification("deterministic", classification.confidence, classification.evidence),
        left.children + right.children, attributes)


def _resolve_paragraph_boundaries(nodes: list[Node], decisions: list[Decision]) -> tuple[list[Node], dict[str, int]]:
    resolved: list[Node] = []
    counts = {"MERGE": 0, "KEEP_BOUNDARY": 0, "ABSTAIN": 0}
    for index, node in enumerate(nodes):
        if not resolved or not _boundary_candidate(resolved[-1], node):
            resolved.append(node)
            continue
        left = resolved[-1]
        classification = classify_paragraph_boundary(left, node)
        counts[classification.decision] += 1
        boundary_id = _node_id("ParagraphBoundary", left.source + node.source)
        diagnostic_evidence = [
            f"leftText={left.exact_text}", f"rightText={node.exact_text}",
            f"leftNodeType={left.type}", f"rightNodeType={node.type}",
            f"leftStyle={asdict(left.style)}", f"rightStyle={asdict(node.style)}",
            f"precedingContext={resolved[-2].exact_text if len(resolved) > 1 else ''}",
            f"followingContext={nodes[index + 1].exact_text if index + 1 < len(nodes) else ''}",
        ] + classification.evidence
        decisions.append(Decision("paragraph-boundary", boundary_id, left.source + node.source,
            classification.reason, classification.confidence, classification.decision.lower(), diagnostic_evidence,
            "unresolved" if classification.decision == "ABSTAIN" else "resolved"))
        if classification.decision == "MERGE":
            resolved[-1] = _merge_text_nodes(left, node, classification)
        else:
            if classification.decision == "ABSTAIN":
                node.attributes = {**node.attributes, "unresolvedBoundaryBefore": {
                    "boundaryId": boundary_id, "reason": classification.reason}}
            resolved.append(node)
    return resolved, counts


def _is_oj_page_furniture(fragment: Fragment, page_width: float, page_height: float) -> bool:
    """Identify OJ furniture in portrait top/bottom or rotated side margins."""
    text = _clean(fragment.text)
    top = fragment.y1 <= page_height * .105
    bottom = fragment.y0 >= page_height * .94
    side = ((fragment.x1 <= page_width * .055 or fragment.x0 >= page_width * .925)
            and fragment.x1 - fragment.x0 <= 30)
    publication_label = bool(
        OJ_DATE.fullmatch(text) or text.upper() == "EN" or OJ_JOURNAL.fullmatch(text)
        or OJ_PAGE.fullmatch(text) or re.fullmatch(r"EN\s+L\s+series(?:\s+\d{1,2}\.\d{1,2}\.\d{4})?", text, re.I)
        or re.fullmatch(r"(?:OJ\s+L,?\s*\d{1,2}\.\d{1,2}\.\d{4}\s*)?EN", text, re.I)
        or re.fullmatch(r"\d{4}/\d+\s+\d{1,2}\.\d{1,2}\.\d{4}", text)
        or re.fullmatch(r"\d+\/\d+", text)
        or text.startswith("ELI: http://data.europa.eu/eli/")
        or (side and ("ELI: http://data.europa.eu/eli/" in text or "OJ L" in text or text.startswith("EN ")))
    )
    return publication_label and (top or bottom or side)


def _exclude_page_furniture(fragments: list[Fragment], page_width: float, page_height: float, page_number: int,
                            decisions: list[Decision]) -> tuple[list[Fragment], list[Fragment]]:
    retained, excluded = [], []
    for fragment in fragments:
        if _is_oj_page_furniture(fragment, page_width, page_height):
            excluded.append(fragment)
            decisions.append(Decision(
                "page-furniture", _node_id("PageFurniture", _refs([fragment])), _refs([fragment]),
                "Excluded a complete OJ page-furniture paragraph from the translatable document.",
                1.0, "excluded", [f"page={page_number}", "page-margin geometry", f"exactText={_clean(fragment.text)}"], "resolved"))
        else:
            retained.append(fragment)
    return retained, excluded


def _combine_recital_boundaries(nodes: list[Node], decisions: list[Decision]) -> list[Node]:
    """Bind recital anchors inside the document's explicit recital section.

    The expected recital count is derived from source anchors.  Parenthesised
    legal paragraphs outside an explicit ``Whereas`` section are not recital
    candidates.
    """
    result = list(nodes)
    number_pattern = re.compile(r"^\(\s*(\d+)\s*\)$")
    inline_pattern = re.compile(r"^\(\s*(\d+)\s*\)\s+\S")
    start = next((index for index, node in enumerate(result)
                  if WHEREAS_HEADING.fullmatch(_clean(node.exact_text))), None)
    if start is None:
        return result
    end = next((index for index, node in enumerate(result[start + 1:], start + 1)
                if ENACTING_FORMULA.match(_clean(node.exact_text))), None)
    if end is None:
        raise ValueError("The source contains a Whereas heading but no unambiguous enacting formula delimiting the recital section.")

    section = result[start + 1:end]
    candidates_by_ordinal: dict[int, list[tuple[Node, bool]]] = {}
    for node in section:
        if node.type in {"Footnote", "FootnoteBody"}:
            continue
        clean = _clean(node.exact_text)
        if FOOTNOTE_REGION.match(clean):
            continue
        match = number_pattern.fullmatch(clean)
        if match:
            candidates_by_ordinal.setdefault(int(match.group(1)), []).append((node, True))
            continue
        match = inline_pattern.match(clean)
        if match:
            candidates_by_ordinal.setdefault(int(match.group(1)), []).append((node, False))
    if not candidates_by_ordinal:
        raise ValueError("The source contains a Whereas section but no recital anchors could be identified safely.")

    # The recital sequence is the complete consecutive prefix beginning at 1.
    # Parenthesised footnote/citation markers can occur in the same physical
    # area; they cannot extend a sequence across a missing legal ordinal.
    count = 0
    while count + 1 in candidates_by_ordinal:
        count += 1
    if count == 0:
        raise ValueError("The Whereas section has parenthesised text but no recital sequence beginning with (1).")
    expected = list(range(1, count + 1))

    singleton_sizes = [max(node.style.font_sizes) for ordinal in expected
                       for node, _ in candidates_by_ordinal[ordinal]
                       if len(candidates_by_ordinal[ordinal]) == 1 and node.style.font_sizes]
    target_size = median(singleton_sizes) if singleton_sizes else None
    anchors: list[tuple[Node, int, bool]] = []
    for ordinal in expected:
        candidates = candidates_by_ordinal[ordinal]
        if len(candidates) > 1 and target_size is not None:
            typographic = [(node, standalone) for node, standalone in candidates if node.style.font_sizes
                           and abs(max(node.style.font_sizes) - target_size) <= .25]
            if len(typographic) == 1:
                candidates = typographic
        if len(candidates) != 1:
            raise ValueError(f"Recital anchor ({ordinal}) has {len(candidates)} structurally plausible source nodes.")
        anchors.append((candidates[0][0], ordinal, candidates[0][1]))

    combined = 0
    numbers = [node for node, _, standalone in anchors if standalone]
    for number in numbers:
        if number not in result:
            continue
        match = number_pattern.fullmatch(_clean(number.exact_text))
        if not match or not number.source or not number.source[0].boxes:
            raise ValueError("Recital number has incomplete source geometry.")
        number_box = number.source[0].boxes[0]
        candidates = []
        for candidate in section:
            if candidate is number or candidate.type not in {"Paragraph", "ListItem"} or not candidate.exact_text.strip() or FOOTNOTE_REGION.match(_clean(candidate.exact_text)):
                continue
            if not candidate.source or not candidate.source[0].boxes or candidate.source[0].page != number.source[0].page:
                continue
            text_box = candidate.source[0].boxes[0]
            if text_box.x0 > number_box.x0 and text_box.x0 - number_box.x1 <= 45 and abs(text_box.y0 - number_box.y0) <= 18:
                candidates.append(candidate)
        placement = "same-page"
        if not candidates and number_box.y0 > 680:
            next_page = number.source[0].page + 1
            candidates = [candidate for candidate in result
                          if candidate is not number and candidate.type in {"Paragraph", "ListItem"} and candidate.exact_text.strip()
                          and candidate.source and candidate.source[0].boxes and candidate.source[0].page == next_page
                          and candidate.source[0].boxes[0].y0 < 150 and not FOOTNOTE_REGION.match(_clean(candidate.exact_text))]
            placement = "text-page-preserving"
        if len(candidates) > 1 and placement == "same-page":
            ranked = sorted(candidates, key=lambda candidate: (
                abs(candidate.source[0].boxes[0].y0 - number_box.y0),
                candidate.source[0].boxes[0].x0 - number_box.x1))
            best_delta = abs(ranked[0].source[0].boxes[0].y0 - number_box.y0)
            next_delta = abs(ranked[1].source[0].boxes[0].y0 - number_box.y0)
            if best_delta <= 3 and next_delta - best_delta >= 3:
                candidates = ranked[:1]
        if len(candidates) != 1:
            raise ValueError(f"Recital number {match.group(1)} has no safe paragraph continuation.")
        text = candidates[0]
        number_index, text_index = result.index(number), result.index(text)
        insertion = text_index if placement == "text-page-preserving" else min(number_index, text_index)
        refs = number.source + text.source
        recital = Node(_node_id("Recital", refs), "Recital", f"{_clean(number.exact_text)}\t{text.exact_text.lstrip()}", refs,
                       text.style, Classification("deterministic", .99, ["Standalone recital number and following paragraph are explicitly paired by legal numbering, source order, and same/cross-page provenance."]),
                       number.children + text.children,
                       {"kind": "recital", "recitalNumber": int(match.group(1)), "numberSourceNodeId": number.id,
                        "textSourceNodeId": text.id, "paragraphBoundary": "tab-hanging-indent", "placement": placement})
        result.remove(number)
        result.remove(text)
        result.insert(insertion, recital)
        recital_spans = {span_id for ref in refs for span_id in ref.span_ids}
        for diagnostic in decisions:
            diagnostic_spans = {span_id for ref in diagnostic.source for span_id in ref.span_ids}
            if (diagnostic.kind == "paragraph-boundary" and diagnostic.ambiguity_status == "unresolved"
                    and diagnostic_spans and diagnostic_spans <= recital_spans):
                diagnostic.outcome = "resolved-by-recital-binding"
                diagnostic.ambiguity_status = "resolved"
                diagnostic.confidence = .99
                diagnostic.reason = "The later legal-structure pass proved this boundary belongs to a numbered recital binding."
                diagnostic.evidence.append(f"resolvedRecitalNumber={match.group(1)}")
        decisions.append(Decision("recital-binding", recital.id, refs,
            "Combined a standalone recital number and its exact following legal paragraph into one logical recital paragraph.",
            .99, "MERGE", [f"recitalNumber={match.group(1)}", f"placement={placement}", "source wording unchanged", "literal tab serialization required"], "resolved"))
        combined += 1

    # Recitals whose number and text already share one source node need no
    # geometric merge, but are still represented explicitly as Recital nodes.
    for original, ordinal, standalone in anchors:
        if standalone:
            continue
        if original not in result:
            raise ValueError(f"Recital anchor {ordinal} was consumed by another structural decision.")
        index = result.index(original)
        recital = replace(original, type="Recital", attributes={**original.attributes,
            "kind": "recital", "recitalNumber": ordinal, "paragraphBoundary": "source-inline"})
        result[index] = recital
        decisions.append(Decision("recital-binding", recital.id, recital.source,
            "Classified a source paragraph containing both a recital anchor and its text as one logical recital.",
            1.0, "classified", [f"recitalNumber={ordinal}", "anchor and text share one source node", "source wording unchanged"], "resolved"))

    represented = [node for node in result if node.type == "Recital"]
    detected_sequence = [int(node.attributes["recitalNumber"]) for node in represented]
    represented_positions = [result.index(node) for node in represented]
    represented = sorted(represented, key=lambda node: int(node.attributes["recitalNumber"]))
    for position, recital in zip(sorted(represented_positions), represented):
        result[position] = recital
    if represented_positions and [result[position] for position in sorted(represented_positions)] != represented:
        raise ValueError("Recital nodes could not be placed in legal-number order.")
    if detected_sequence != expected:
        decisions.append(Decision("recital-order", "recital-sequence", [ref for node in represented for ref in node.source],
            "Placed recital nodes in their explicit legal-number order where PDF column geometry interleaved anchors.",
            1.0, "reordered", [f"detectedSequence={detected_sequence}", f"legalSequence={expected}"], "resolved"))
    represented_ordinals = [int(node.attributes["recitalNumber"]) for node in represented]
    if represented_ordinals != expected:
        raise ValueError(f"Recital reconstruction is incomplete or reordered: found {represented_ordinals}, expected {expected}.")
    recital_span_ids = [span_id for node in represented for ref in node.source for span_id in ref.span_ids]
    if len(recital_span_ids) != len(set(recital_span_ids)):
        raise ValueError("Recital reconstruction duplicated source spans.")
    return result


def build_typed_document(pdf_path: Path, celex: str | None = None) -> tuple[Node, list[Decision], dict[str, object]]:
    document_identifier = celex or pdf_path.stem
    pages, extraction = extract_fragments(pdf_path)
    decisions: list[Decision] = []
    page_nodes: list[Node] = []
    canonical_fragments: list[Fragment] = []
    layout_analysis: list[dict[str, object]] = []
    excluded_page_furniture_span_ids: list[str] = []
    excluded_page_furniture: list[dict[str, object]] = []
    all_source_span_ids = [str(record["id"]) for page in pages for item in page for record in item.span_records]
    global_order = 0
    with pymupdf.open(pdf_path) as pdf:
        for page_number, fragments in enumerate(pages, 1):
            width=pdf[page_number-1].rect.width
            page = pdf[page_number-1]
            fragments, excluded_furniture = _exclude_page_furniture(fragments, page.rect.width, page.rect.height, page_number, decisions)
            excluded_page_furniture_span_ids.extend(span_id for item in excluded_furniture for span_id in item.span_ids)
            excluded_page_furniture.extend({"page": page_number, "blockIndex": item.block_index,
                "lineIds": list(item.line_ids), "spanIds": list(item.span_ids),
                "bbox": [item.x0, item.y0, item.x1, item.y1], "originalText": item.text,
                "classification": "oj-page-furniture", "reason": "Exact OJ running-header text in the top page margin."}
                for item in excluded_furniture)
            ruled_regions = _ruled_table_regions(page, fragments)
            ruled_ids = {id(item) for region in ruled_regions for item in region["items"]}
            aligned_regions,rejected_tables=_aligned_table_regions([item for item in fragments if id(item) not in ruled_ids],width)
            regions = sorted(ruled_regions + aligned_regions, key=lambda value: min(item.y0 for item in value["items"]))
            table_ids={id(item) for region in regions for item in region["items"]}
            ordinary=[item for item in fragments if id(item) not in table_ids]
            ordinary_order,layout=_page_layout_order(ordinary,width)
            layout={"page":page_number,**layout,"excludedPageFurniture":[{"text":item.text,"block":item.block_index,"lineIds":item.line_ids,"spanIds":item.span_ids,"bbox":[item.x0,item.y0,item.x1,item.y1]} for item in excluded_furniture],"tableRegions":[{"index":index,"y0":round(min(item.y0 for item in region["items"]),2),"y1":round(max(item.y1 for item in region["items"]),2),"columns":len(region["anchors"]),"anchors":region["anchors"],"fragments":len(region["items"]),"confidence":region["confidence"],"evidence":region["evidence"]} for index,region in enumerate(regions)]}
            layout["ambiguities"].extend(rejected_tables)
            layout_analysis.append(layout)

            page_sequence=list(ordinary_order)
            for region in sorted(regions,key=lambda value:min(item.y0 for item in value["items"])):
                table_sequence=[item for row in _table_rows_from_region(region) for cell in row for item in cell]
                insertion=next((index for index,item in enumerate(page_sequence) if item.y0>max(value.y1 for value in region["items"])),len(page_sequence))
                page_sequence[insertion:insertion]=table_sequence
            for item in page_sequence:
                item.reading_order=global_order; global_order+=1
            canonical_fragments.extend(page_sequence)
            layout_refs=_refs(page_sequence)
            decisions.append(Decision("layout",f"layout-page-{page_number}",layout_refs,
                f"Inferred {layout['layout']} layout with {len(layout['regions'])} reading-order region(s) and {len(regions)} table region(s) from page geometry.",float(layout["confidence"])))
            decisions.extend(_log_layout_diagnostics(layout["ambiguities"],page_number,layout_refs))

            structural=[]
            for index,region in enumerate(regions):
                rows=_table_rows_from_region(region)
                node=_table_node(f"geometry-table-p{page_number}-{index+1}",rows,decisions)
                node.attributes.update({"page":page_number,"confidence":region["confidence"],"columnAnchors":region["anchors"],
                    "columnBoundaries": region.get("columnBoundaries"), "rowBoundaries": region.get("rowBoundaries"),
                    "detection": region.get("detection", "whitespace-aligned"),
                    "pageOrientation": "landscape" if page.rect.width > page.rect.height else "portrait",
                    "pageWidth": page.rect.width, "pageHeight":page.rect.height,
                    "y0":min(item.y0 for item in region["items"]),"y1":max(item.y1 for item in region["items"])})
                structural.append((min(item.reading_order for item in region["items"]),node))
            ordinary_groups=_merge_fragments(ordinary_order)
            ordinary_nodes=[(min(item.reading_order for item in group),_classify_text_node(group,decisions,width)) for group in ordinary_groups]
            resolved_ordinary,boundary_counts=_resolve_paragraph_boundaries([node for _,node in ordinary_nodes],decisions)
            layout["paragraphBoundaryDecisions"] = boundary_counts
            ordinary_nodes=[(min(ref.reading_order_start for ref in node.source),node) for node in resolved_ordinary]
            nodes=[node for _,node in sorted(ordinary_nodes+structural,key=lambda pair:pair[0])]
            if page_number > 1:
                page_ref = SourceRef(page_number, -1, [], [], [], global_order, global_order)
                page_break = Node(_node_id("PageBreak", [page_ref]), "PageBreak", "", [page_ref], StyleEvidence([], [], False, False, None, 0), Classification("deterministic", 1.0, ["Physical PDF page boundary."]))
                page_nodes.append(page_break)
                decisions.append(Decision("classification", page_break.id, [page_ref], "Recorded physical PDF page boundary without creating a translation unit.", 1.0))
            page_nodes.extend(nodes)

    cross_page_tables=_link_cross_page_tables(page_nodes,decisions)
    page_nodes = _combine_recital_boundaries(page_nodes, decisions)
    all_refs = [ref for node in page_nodes for ref in node.source]
    document = Node(f"document-{document_identifier}", "Document", "", all_refs, StyleEvidence([], [], False, False, None, 0),
        Classification("deterministic", 1.0, ["Geometry-driven typed reconstruction root."]), page_nodes,
        {"celex": document_identifier, "source": str(pdf_path), "modelVersion": "phase3d-generalized-boundaries-v1", "extraction": extraction})
    with pymupdf.open(pdf_path) as pdf:
        footnotes = bind_footnotes(document, {index + 1: page.rect.height for index, page in enumerate(pdf)}, decisions)
    document.attributes["footnotes"] = footnotes
    unresolved = [
        {"kind": "heading-or-short-fragment", "nodeId": node.id, "text": node.exact_text, "reason": "Short/bold line lacks a full legal-label grammar."}
        for node in page_nodes if node.type == "Heading" and node.attributes.get("kind") == "other" and not OTHER_HEADING.match(node.exact_text)
    ]
    return document, decisions, {
        "extraction": extraction,
        "unresolved": unresolved,
        "layoutAnalysis": layout_analysis,
        "crossPageTables": cross_page_tables,
        "paragraphBoundaryDecisions": dict(Counter(
            decision.outcome.upper() for decision in decisions if decision.kind == "paragraph-boundary")),
        "sourceReadingText": "\n".join(item.text for item in canonical_fragments),
        "sourceSpanIds": all_source_span_ids,
        "excludedPageFurnitureSpanIds": excluded_page_furniture_span_ids,
        "excludedPageFurniture": excluded_page_furniture,
    }


def iter_content_nodes(node: Node):
    if node.type in {"Heading", "Recital", "Paragraph", "ListItem", "Footnote", "FootnoteBody", "TableCell"}:
        yield node
        return
    if node.type == "Table":
        for row in node.children:
            yield from row.children
        return
    for child in node.children:
        yield from iter_content_nodes(child)


def validate_structural_reading_order(document: Node) -> dict[str, object]:
    headings = [node for node in document.children if node.type == "Heading"]
    articles = [(node.id, int(node.attributes["ordinal"])) for node in headings if node.attributes.get("kind") == "article"]
    annexes = [(node.id, int(node.attributes["ordinal"])) for node in headings
               if node.attributes.get("kind") == "annex" and node.attributes.get("ordinal") is not None]
    issues = []
    for label, markers in (("Article", articles), ("Annex", annexes)):
        for (_, previous), (_, current) in zip(markers, markers[1:]):
            if current != previous + 1:
                issues.append(f"{label} sequence is impossible: {previous} followed by {current}")
    if issues:
        raise ValueError("; ".join(issues))
    return {"status": "PASS", "articles": [value for _, value in articles], "annexes": [value for _, value in annexes], "issues": []}


def render_docx(document: Node, target: Path, *, table_cell_multiline: Literal["paragraphs", "line_breaks"] = "paragraphs") -> None:
    output = Document()
    current_orientation = "portrait"

    def apply_page_geometry(section, orientation: str) -> None:
        """Apply the validated page geometry contract in exact OOXML twips."""
        if orientation == "landscape":
            section.orientation = WD_ORIENT.LANDSCAPE
            if section.page_width < section.page_height:
                section.page_width, section.page_height = section.page_height, section.page_width
            section.top_margin = Twips(680)
            section.bottom_margin = Twips(680)
            section.left_margin = Twips(680)
            section.right_margin = Twips(680)
        else:
            section.orientation = WD_ORIENT.PORTRAIT
            if section.page_width > section.page_height:
                section.page_width, section.page_height = section.page_height, section.page_width
            section.top_margin = Twips(1440)
            section.bottom_margin = Twips(1440)
            section.left_margin = Twips(1797)
            section.right_margin = Twips(1797)

    apply_page_geometry(output.sections[0], "portrait")

    def apply_orientation(value: str) -> None:
        nonlocal current_orientation
        if value not in {"portrait", "landscape"} or value == current_orientation:
            return
        section = output.add_section(WD_SECTION.NEW_PAGE)
        apply_page_geometry(section, value)
        current_orientation = value

    def apply_source_format(paragraph, node: Node) -> None:
        paragraph.style = output.styles["Normal"]
        if node.type == "Heading":
            outline = paragraph._p.get_or_add_pPr().find(qn("w:outlineLvl"))
            if outline is None:
                outline = OxmlElement("w:outlineLvl")
                paragraph._p.get_or_add_pPr().append(outline)
            outline.set(qn("w:val"), "0")
        if node.type == "Heading" and node.attributes.get("kind") == "article":
            alignment_name = "center"
        else:
            alignment_name = (node.style.alignment or ("left" if node.type == "Heading" else "justify")).lower()
        alignment = {"left": WD_ALIGN_PARAGRAPH.LEFT, "center": WD_ALIGN_PARAGRAPH.CENTER,
                     "right": WD_ALIGN_PARAGRAPH.RIGHT, "justify": WD_ALIGN_PARAGRAPH.JUSTIFY}.get(alignment_name, WD_ALIGN_PARAGRAPH.JUSTIFY)
        if alignment is not None:
            paragraph.alignment = alignment
        paragraph.paragraph_format.line_spacing = 1.0
        paragraph.paragraph_format.space_before = Pt(6)
        paragraph.paragraph_format.space_after = Pt(6)
        paragraph.paragraph_format.left_indent = Pt(0)
        paragraph.paragraph_format.right_indent = Pt(0)
        paragraph.paragraph_format.first_line_indent = Pt(0)
        for run in paragraph.runs:
            run.font.color.rgb = RGBColor(0, 0, 0)
            run.font.bold = node.style.bold
            run.font.italic = node.style.italic
            run.font.name = "Times New Roman"
            run.font.size = Pt(12)
        if node.type == "TableCell":
            paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
    table_chains: dict[str, list[Node]] = {}
    for candidate in document.children:
        if candidate.type == "Table":
            logical_id = str(candidate.attributes.get("logicalTableId", candidate.id))
            table_chains.setdefault(logical_id, []).append(candidate)
    rendered_table_nodes: set[str] = set()
    for node_index, node in enumerate(document.children):
        if node.type == "Heading" and node.attributes.get("kind") == "annex":
            following_table = next((candidate for candidate in document.children[node_index + 1:] if candidate.type == "Table"), None)
            if following_table is not None:
                apply_orientation(str(following_table.attributes.get("pageOrientation", "portrait")))
        if node.type == "PageBreak":
            # Source PDF page boundaries are not semantic DOCX page breaks.
            # Annex starts are handled explicitly on their heading paragraph.
            continue
        elif node.type == "Table":
            if node.id in rendered_table_nodes:
                continue
            logical_id = str(node.attributes.get("logicalTableId", node.id))
            candidates = table_chains[logical_id]
            chain = [node]
            current_index = node_index
            for candidate in candidates[candidates.index(node) + 1:]:
                candidate_index = document.children.index(candidate)
                intervening = document.children[current_index + 1:candidate_index]
                if any(item.type != "PageBreak" for item in intervening):
                    break
                chain.append(candidate)
                current_index = candidate_index
            apply_orientation(str(node.attributes.get("pageOrientation", "portrait")))
            logical_rows: list[Node] = []
            for segment_index, segment in enumerate(chain):
                for row_index, row in enumerate(segment.children):
                    if row_index == 0 and row.attributes.get("repeatedHeader"):
                        continue
                    logical_rows.append(row)
            rows, columns = len(logical_rows), int(node.attributes["columns"])
            table = output.add_table(rows=rows, cols=columns)
            table.style = "Table Grid"
            table.autofit = False
            boundaries = node.attributes.get("columnBoundaries")
            available_width = output.sections[-1].page_width - output.sections[-1].left_margin - output.sections[-1].right_margin
            widths = None
            if isinstance(boundaries, list) and len(boundaries) == columns + 1:
                source_width = float(boundaries[-1]) - float(boundaries[0])
                if source_width > 0:
                    widths = [int(available_width * ((float(right) - float(left)) / source_width))
                              for left, right in zip(boundaries, boundaries[1:])]
                    for column_index, width in enumerate(widths):
                        table.columns[column_index].width = width
                    grid_columns = table._tbl.tblGrid.gridCol_lst
                    for column_index, width in enumerate(widths):
                        grid_columns[column_index].set(qn("w:w"), str(round(width / 635)))
                    table_width = table._tbl.tblPr.first_child_found_in("w:tblW")
                    if table_width is not None:
                        table_width.set(qn("w:type"), "dxa")
                        table_width.set(qn("w:w"), str(sum(round(width / 635) for width in widths)))
            for row_index, row in enumerate(logical_rows):
                row_properties = table.rows[row_index]._tr.get_or_add_trPr()
                row_properties.append(OxmlElement("w:cantSplit"))
                if row_index == 0:
                    row_properties.append(OxmlElement("w:tblHeader"))
                for column_index, cell in enumerate(row.children):
                    target_cell = table.cell(row_index, column_index)
                    target_cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
                    if widths:
                        target_cell.width = widths[column_index]
                    parts = cell.exact_text.split("\n") if cell.exact_text else [""]
                    target_cell.paragraphs[0].text = parts[0]
                    apply_source_format(target_cell.paragraphs[0], cell)
                    if table_cell_multiline == "paragraphs":
                        for part in parts[1:]:
                            paragraph = target_cell.add_paragraph(part)
                            apply_source_format(paragraph, cell)
                    else:
                        paragraph = target_cell.paragraphs[0]
                        for part in parts[1:]:
                            run = paragraph.add_run()
                            run.add_break(WD_BREAK.LINE)
                            run.add_text(part)
                        apply_source_format(paragraph, cell)
            rendered_table_nodes.update(segment.id for segment in chain)
        elif node.type == "FootnoteBody":
            continue
        else:
            paragraph = output.add_paragraph()
            apply_source_format(paragraph, node)
            if node.type == "Recital" and "\t" in node.exact_text:
                number, text = node.exact_text.split("\t", 1)
                paragraph.add_run(number)
                paragraph.add_run().add_tab()
                paragraph.add_run(text)
                paragraph.paragraph_format.tab_stops.add_tab_stop(Cm(1.0))
                paragraph.paragraph_format.left_indent = Cm(1.0)
                paragraph.paragraph_format.first_line_indent = Cm(-1.0)
            else:
                paragraph.add_run(node.exact_text)
            apply_source_format(paragraph, node)
            if node.type == "Heading" and node.attributes.get("kind") == "annex":
                paragraph.paragraph_format.page_break_before = True
            if node.type == "Recital":
                paragraph.paragraph_format.tab_stops.add_tab_stop(Cm(1.0))
                paragraph.paragraph_format.left_indent = Cm(1.0)
                paragraph.paragraph_format.first_line_indent = Cm(-1.0)
            paragraph._p.set(qn("w:rsidR"), node.id[-8:])
    output.save(target)
    write_ooxml_footnotes(target, document)


def _normalized_tokens(text: str) -> list[str]:
    return re.findall(r"\S+", text)


def model_text(document: Node) -> str:
    return "\n".join(node.exact_text for node in iter_content_nodes(document) if node.exact_text)


def model_body_text(document: Node) -> str:
    values: list[str] = []
    def visit(node: Node, repeated_header: bool = False) -> None:
        repeated_header = repeated_header or (node.type == "TableRow" and bool(node.attributes.get("repeatedHeader")))
        if node.type in {"Heading", "Recital", "Paragraph", "ListItem", "Footnote", "TableCell"} and node.exact_text and not repeated_header:
            values.append(node.exact_text)
        for child in node.children:
            visit(child, repeated_header)
    visit(document)
    return "\n".join(values)


def docx_visible_text(path: Path) -> str:
    document = Document(path)
    body = document.element.body
    values = []
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            run_values = []
            for run in child.xpath(".//w:r"):
                for descendant in run.iterchildren():
                    local = etree.QName(descendant).localname
                    if local == "t" and descendant.text: run_values.append(descendant.text)
                    elif local == "tab": run_values.append("\t")
                    elif local == "br": run_values.append("\n")
            text = "".join(run_values)
            if text.strip(): values.append(text)
        elif child.tag == qn("w:tbl"):
            for row in child.xpath("./w:tr"):
                for cell in row.xpath("./w:tc"):
                    paragraph_values = []
                    for paragraph in cell.xpath("./w:p"):
                        run_values = []
                        for descendant in paragraph.iter():
                            local = etree.QName(descendant).localname
                            if local == "t" and descendant.text: run_values.append(descendant.text)
                            elif local == "tab": run_values.append("\t")
                            elif local == "br": run_values.append("\n")
                        paragraph_values.append("".join(run_values))
                    text = "\n".join(paragraph_values)
                    if text.strip(): values.append(text)
    return "\n".join(values)


def render_docx_phase2b(document: Node, target: Path) -> None:
    """V2-only experiment: one Word paragraph per logical table-cell paragraph."""
    render_docx(document, target, table_cell_multiline="line_breaks")


def assert_text_integrity(document: Node, docx_path: Path) -> dict[str, object]:
    expected = _normalized_tokens(model_body_text(document))
    actual = _normalized_tokens(docx_visible_text(docx_path))
    if expected != actual:
        mismatch = next((index for index, pair in enumerate(zip(expected, actual)) if pair[0] != pair[1]), min(len(expected), len(actual)))
        raise AssertionError(f"Text integrity failed at token {mismatch}: expected={expected[mismatch:mismatch+5]!r}, actual={actual[mismatch:mismatch+5]!r}")
    with zipfile.ZipFile(docx_path) as archive:
        footnote_root = etree.fromstring(archive.read("word/footnotes.xml")) if "word/footnotes.xml" in archive.namelist() else None
    expected_notes = [entry["text"] for node in document.children if node.type == "FootnoteBody" for entry in node.attributes.get("footnoteEntries", [])]
    actual_notes = [] if footnote_root is None else ["".join(note.xpath(".//w:t/text()", namespaces={"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"})).strip()
        for note in footnote_root.xpath("./w:footnote[not(@w:type)]", namespaces={"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"})]
    normalized_expected_notes = [_normalized_tokens(value) for value in expected_notes]
    normalized_actual_notes = [_normalized_tokens(re.sub(r"^(?:\((?:\d+|\*)\)|(?:\d+|\*))\s*", "", value)) for value in actual_notes]
    if normalized_expected_notes != normalized_actual_notes:
        raise AssertionError("DOCX native footnote text differs from the typed model.")
    all_tokens = _normalized_tokens(model_text(document))
    return {"status": "PASS", "tokens": len(all_tokens), "sha256": hashlib.sha256("\n".join(all_tokens).encode()).hexdigest(), "footnotes": len(expected_notes)}


def assert_source_model_integrity(document: Node, source_reading_text: str, source_span_ids: list[str], excluded_source_span_ids: list[str] | None = None) -> dict[str, object]:
    expected = _normalized_tokens(source_reading_text)
    actual = _normalized_tokens(model_text(document))
    if Counter(expected) != Counter(actual):
        raise AssertionError("Source-to-model token inventory differs; text was added, removed, or changed.")
    model_span_ids: list[str] = []
    def collect(node: Node) -> None:
        if node.type == "InlineSpan":
            model_span_ids.extend(node.source[0].span_ids)
        for child in node.children:
            collect(child)
    collect(document)
    excluded = list(excluded_source_span_ids or [])
    if len(excluded) != len(set(excluded)):
        raise AssertionError("Excluded source spans contain duplicates.")
    if set(excluded) - set(source_span_ids):
        raise AssertionError("Excluded source spans are not part of the extracted source.")
    if set(excluded) & set(model_span_ids):
        raise AssertionError("A source span is both represented as legal content and excluded as page furniture.")
    accounted_span_ids = model_span_ids + excluded
    if Counter(accounted_span_ids) != Counter(source_span_ids) or len(accounted_span_ids) != len(set(accounted_span_ids)):
        raise AssertionError("Source span coverage differs from the typed model or a span was duplicated.")
    for node in iter_content_nodes(document):
        if node.children and re.sub(r"\s+", "", node.exact_text) != re.sub(r"\s+", "", "".join(child.exact_text for child in node.children)):
            raise AssertionError(f"Inline-span text differs from parent node {node.id}.")
    return {"status": "PASS", "tokens": len(expected), "sourceSpans": len(source_span_ids), "modelSpans": len(model_span_ids), "excludedSpans": len(excluded),
        "orderBasis": "Deterministic typed reading order; table regions use row-major cell order while preserving order within every cell."}


def inspect_docx_structure(path: Path) -> dict[str, object]:
    document = Document(path)
    tables = []
    for index, table in enumerate(document.tables):
        values = [[cell.text for cell in row.cells] for row in table.rows]
        tables.append({"index": index, "rows": len(table.rows), "columns": len(table.columns), "cells": sum(len(row.cells) for row in table.rows),
            "containsArticle1": any(cell == "Article 1" for row in values for cell in row), "containsAnnexI": any(cell == "Annex I" for row in values for cell in row)})
    all_paragraphs = document.element.body.xpath(".//w:p")
    nonempty_all = sum(bool("".join(paragraph.xpath(".//w:t/text()")).strip()) for paragraph in all_paragraphs)
    return {"nonEmptyDocxParagraphs": nonempty_all, "nonEmptyBodyParagraphs": sum(bool(p.text.strip()) for p in document.paragraphs), "tables": tables,
        "article1InTableCell": any(item["containsArticle1"] for item in tables), "annexIInTableCell": any(item["containsAnnexI"] for item in tables)}


def node_to_dict(node: Node) -> dict[str, object]:
    return asdict(node)


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
