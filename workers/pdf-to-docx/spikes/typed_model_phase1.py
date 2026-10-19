from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from dataclasses import asdict, dataclass, field
from pathlib import Path
from statistics import median
from typing import Literal

import pymupdf
from docx import Document
from docx.enum.text import WD_BREAK
from docx.oxml.ns import qn
from lxml import etree


ARTICLE = re.compile(r"^Article\s+(\d+)\s*:?\s*$", re.I)
ANNEX = re.compile(r"^ANNEX\s+([IVXLCDM]+)\s*:?\s*$", re.I)
OTHER_HEADING = re.compile(r"^(?:PART\s+[A-Z]|CHAPTER\s+[IVXLCDM1]+|CORRELATION TABLE|Whereas:|HAVE ADOPTED THIS DIRECTIVE:)$", re.I)
LIST_ITEM = re.compile(r"^(?:\d+\.|\([a-z0-9]+\))\s+", re.I)
FOOTNOTE = re.compile(r"^\s*\((?:\d+|\*)\)\s+(?:OJ\b|Official Journal\b)", re.I)


@dataclass(frozen=True)
class Box:
    page: int
    x0: float
    y0: float
    x1: float
    y1: float


@dataclass(frozen=True)
class SourceRef:
    page: int
    block_index: int
    line_ids: list[str]
    span_ids: list[str]
    boxes: list[Box]
    reading_order_start: int
    reading_order_end: int


@dataclass(frozen=True)
class StyleEvidence:
    font_families: list[str]
    font_sizes: list[float]
    bold: bool
    italic: bool
    alignment: str | None
    indentation: float


@dataclass(frozen=True)
class Classification:
    method: Literal["deterministic"]
    confidence: float
    evidence: list[str]


@dataclass
class Node:
    id: str
    type: str
    exact_text: str
    source: list[SourceRef]
    style: StyleEvidence
    classification: Classification
    children: list["Node"] = field(default_factory=list)
    attributes: dict[str, object] = field(default_factory=dict)


@dataclass
class DiagnosticRecord:
    kind: str
    node_id: str
    source: list[SourceRef]
    reason: str
    confidence: float
    outcome: str = "recorded"
    evidence: list[str] = field(default_factory=list)
    ambiguity_status: Literal["not-ambiguous", "resolved", "unresolved"] = "not-ambiguous"

    def __post_init__(self) -> None:
        if not self.kind.strip(): raise ValueError("Diagnostic kind is required.")
        if not self.node_id.strip(): raise ValueError("Diagnostic node_id is required.")
        if not self.reason.strip(): raise ValueError("Diagnostic reason is required and must explain why the outcome was reached.")
        if not 0 <= self.confidence <= 1: raise ValueError("Diagnostic confidence must be between 0 and 1.")
        if not isinstance(self.evidence,list) or any(not isinstance(item,str) or not item.strip() for item in self.evidence):
            raise ValueError("Diagnostic evidence must be a list of non-empty observational statements.")

    @classmethod
    def from_mapping(cls, value: dict[str, object], *, source: list[SourceRef] | None = None, node_id: str | None = None) -> "DiagnosticRecord":
        required=("kind","node_id","reason","confidence","outcome","evidence","ambiguity_status")
        missing=[key for key in required if key not in value]
        if missing: raise ValueError(f"Diagnostic record is missing required fields: {', '.join(missing)}")
        return cls(str(value["kind"]),node_id or str(value["node_id"]),source or [],str(value["reason"]),float(value["confidence"]),
            str(value["outcome"]),list(value["evidence"]),str(value["ambiguity_status"]))


Decision = DiagnosticRecord


@dataclass(frozen=True)
class BoundaryClassification:
    decision: Literal["MERGE", "KEEP_BOUNDARY", "ABSTAIN"]
    confidence: float
    reason: str
    evidence: list[str]


@dataclass
class Fragment:
    page: int
    block_index: int
    text: str
    box: Box
    line_ids: list[str]
    span_ids: list[str]
    fonts: list[str]
    sizes: list[float]
    bold: bool
    italic: bool
    span_records: list[dict[str, object]]
    reading_order: int = -1

    @property
    def x0(self): return self.box.x0
    @property
    def y0(self): return self.box.y0
    @property
    def x1(self): return self.box.x1
    @property
    def y1(self): return self.box.y1


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


def extract_fragments(pdf_path: Path) -> tuple[list[list[Fragment]], dict[str, int]]:
    pages: list[list[Fragment]] = []
    counts = {"pages": 0, "blocks": 0, "lines": 0, "spans": 0}
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
                    spans = line.get("spans", [])
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
            pages.append(fragments)
    return pages, counts


def _two_column_order(items: list[Fragment], width: float) -> list[Fragment]:
    midpoint = width / 2
    left = [item for item in items if item.x1 < midpoint - width * .015]
    right = [item for item in items if item.x0 > midpoint + width * .015]
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
        if any(right-left < width*.15 for left,right in zip(anchors,anchors[1:])):
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
            if current_start-previous_end<=100 and intervening and assignable:
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
        compatible=(int(table.attributes["page"])==int(previous.attributes["page"])+1 and
            int(table.attributes["columns"])==int(previous.attributes["columns"]) and
            all(abs(float(a)-float(b))<=15 for a,b in zip(previous.attributes["columnAnchors"],table.attributes["columnAnchors"])) and
            float(previous.attributes["y1"])>=float(previous.attributes["pageHeight"])*.82 and
            float(table.attributes["y0"])<=float(table.attributes["pageHeight"])*.22)
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


def _classify_text_node(fragments: list[Fragment], decisions: list[Decision]) -> Node:
    text = " ".join(_clean(item.text) for item in fragments)
    refs = _refs(fragments)
    if ARTICLE.match(text):
        kind, attrs, reason, confidence = "Heading", {"kind": "article", "ordinal": int(ARTICLE.match(text).group(1))}, "Exact legal label outside a table, supported by isolated-line geometry.", .99
    elif ANNEX.match(text):
        kind, attrs, reason, confidence = "Heading", {"kind": "annex", "ordinal": _roman(ANNEX.match(text).group(1))}, "Exact annex label outside a table, supported by isolated centered-line geometry.", .99
    elif OTHER_HEADING.match(text) or (fragments[0].bold and len(text) < 120):
        kind, attrs, reason, confidence = "Heading", {"kind": "other"}, "Short isolated text with legal-label or typographic heading evidence.", .9
    elif FOOTNOTE.match(text):
        kind, attrs, reason, confidence = "Footnote", {}, "OJ citation marker and note-body pattern.", .95
    elif LIST_ITEM.match(text):
        kind, attrs, reason, confidence = "ListItem", {"marker": LIST_ITEM.match(text).group(0).strip()}, "Leading legal numbering marker.", .95
    else:
        kind, attrs, reason, confidence = "Paragraph", {}, "Default logical body paragraph after layout-region classification.", .9
    node = Node(_node_id(kind, refs), kind, text, refs, _style(fragments), Classification("deterministic", confidence, [reason]), _inline_nodes(fragments), attrs)
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


def build_typed_document(pdf_path: Path, celex: str | None = None) -> tuple[Node, list[Decision], dict[str, object]]:
    document_identifier = celex or pdf_path.stem
    pages, extraction = extract_fragments(pdf_path)
    decisions: list[Decision] = []
    page_nodes: list[Node] = []
    canonical_fragments: list[Fragment] = []
    layout_analysis: list[dict[str, object]] = []
    global_order = 0
    with pymupdf.open(pdf_path) as pdf:
        for page_number, fragments in enumerate(pages, 1):
            width=pdf[page_number-1].rect.width
            regions,rejected_tables=_aligned_table_regions(fragments,width)
            table_ids={id(item) for region in regions for item in region["items"]}
            ordinary=[item for item in fragments if id(item) not in table_ids]
            ordinary_order,layout=_page_layout_order(ordinary,width)
            layout={"page":page_number,**layout,"tableRegions":[{"index":index,"y0":round(min(item.y0 for item in region["items"]),2),"y1":round(max(item.y1 for item in region["items"]),2),"columns":len(region["anchors"]),"anchors":region["anchors"],"fragments":len(region["items"]),"confidence":region["confidence"],"evidence":region["evidence"]} for index,region in enumerate(regions)]}
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
                    "y0":min(item.y0 for item in region["items"]),"y1":max(item.y1 for item in region["items"]),"pageHeight":pdf[page_number-1].rect.height})
                structural.append((min(item.reading_order for item in region["items"]),node))
            ordinary_groups=_merge_fragments(ordinary_order)
            ordinary_nodes=[(min(item.reading_order for item in group),_classify_text_node(group,decisions)) for group in ordinary_groups]
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
    all_refs = [ref for node in page_nodes for ref in node.source]
    document = Node(f"document-{document_identifier}", "Document", "", all_refs, StyleEvidence([], [], False, False, None, 0),
        Classification("deterministic", 1.0, ["Geometry-driven typed reconstruction root."]), page_nodes,
        {"celex": document_identifier, "source": str(pdf_path), "modelVersion": "phase3d-generalized-boundaries-v1", "extraction": extraction})
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
        "sourceSpanIds": [str(record["id"]) for item in canonical_fragments for record in item.span_records],
    }


def iter_content_nodes(node: Node):
    if node.type in {"Heading", "Paragraph", "ListItem", "Footnote", "TableCell"}:
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
    annexes = [(node.id, int(node.attributes["ordinal"])) for node in headings if node.attributes.get("kind") == "annex"]
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
    for node in document.children:
        if node.type == "PageBreak":
            output.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
        elif node.type == "Table":
            rows, columns = int(node.attributes["rows"]), int(node.attributes["columns"])
            table = output.add_table(rows=rows, cols=columns)
            table.style = "Table Grid"
            for row_index, row in enumerate(node.children):
                for column_index, cell in enumerate(row.children):
                    target_cell = table.cell(row_index, column_index)
                    parts = cell.exact_text.split("\n") if cell.exact_text else [""]
                    target_cell.paragraphs[0].text = parts[0]
                    if table_cell_multiline == "paragraphs":
                        for part in parts[1:]:
                            target_cell.add_paragraph(part)
                    else:
                        paragraph = target_cell.paragraphs[0]
                        for part in parts[1:]:
                            run = paragraph.add_run()
                            run.add_break(WD_BREAK.LINE)
                            run.add_text(part)
        else:
            paragraph = output.add_heading(level=2) if node.type == "Heading" else output.add_paragraph()
            paragraph.add_run(node.exact_text)
            paragraph._p.set(qn("w:rsidR"), node.id[-8:])
    output.save(target)


def _normalized_tokens(text: str) -> list[str]:
    return re.findall(r"\S+", text)


def model_text(document: Node) -> str:
    return "\n".join(node.exact_text for node in iter_content_nodes(document) if node.exact_text)


def docx_visible_text(path: Path) -> str:
    document = Document(path)
    body = document.element.body
    values = []
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            text = "".join(child.xpath(".//w:t/text()"))
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
                            elif local == "br": run_values.append("\n")
                        paragraph_values.append("".join(run_values))
                    text = "\n".join(paragraph_values)
                    if text.strip(): values.append(text)
    return "\n".join(values)


def render_docx_phase2b(document: Node, target: Path) -> None:
    """V2-only experiment: one Word paragraph per logical table-cell paragraph."""
    render_docx(document, target, table_cell_multiline="line_breaks")


def assert_text_integrity(document: Node, docx_path: Path) -> dict[str, object]:
    expected = _normalized_tokens(model_text(document))
    actual = _normalized_tokens(docx_visible_text(docx_path))
    if expected != actual:
        mismatch = next((index for index, pair in enumerate(zip(expected, actual)) if pair[0] != pair[1]), min(len(expected), len(actual)))
        raise AssertionError(f"Text integrity failed at token {mismatch}: expected={expected[mismatch:mismatch+5]!r}, actual={actual[mismatch:mismatch+5]!r}")
    return {"status": "PASS", "tokens": len(expected), "sha256": hashlib.sha256("\n".join(expected).encode()).hexdigest()}


def assert_source_model_integrity(document: Node, source_reading_text: str, source_span_ids: list[str]) -> dict[str, object]:
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
    if Counter(model_span_ids) != Counter(source_span_ids) or len(model_span_ids) != len(set(model_span_ids)):
        raise AssertionError("Source span coverage differs from the typed model or a span was duplicated.")
    for node in iter_content_nodes(document):
        if node.children and re.sub(r"\s+", "", node.exact_text) != re.sub(r"\s+", "", "".join(child.exact_text for child in node.children)):
            raise AssertionError(f"Inline-span text differs from parent node {node.id}.")
    return {"status": "PASS", "tokens": len(expected), "sourceSpans": len(source_span_ids), "modelSpans": len(model_span_ids),
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
