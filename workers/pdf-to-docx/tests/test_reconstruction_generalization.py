from __future__ import annotations

import zipfile
import hashlib
from pathlib import Path

import pytest
from lxml import etree

from app.reconstruction.contracts import Box, Classification, Node, SourceRef, StyleEvidence
from app.reconstruction.core import (
    _combine_recital_boundaries,
    assert_source_model_integrity,
    assert_text_integrity,
    build_typed_document,
    render_docx_phase2b,
    validate_structural_reading_order,
)


FIXTURE_0054 = Path(__file__).parent / "fixtures" / "32006L0054.pdf"
FIXTURE_2586 = Path(__file__).parent / "fixtures" / "32025D2586.pdf"
W = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def _node(identity: str, text: str, order: int, *, kind: str = "Paragraph", x0: float = 40) -> Node:
    ref = SourceRef(1, order, [f"l{order}"], [f"s{order}"],
                    [Box(1, x0, 100 + order * 20, x0 + 200, 112 + order * 20)], order, order)
    return Node(identity, kind, text, [ref], StyleEvidence(["Times"], [9], False, False, None, x0),
                Classification("deterministic", 1, ["test source evidence"]))


def test_documents_without_whereas_have_zero_recitals():
    nodes = [_node("title", "Decision without recitals", 0, kind="Heading"),
             _node("article", "Article 1", 1, kind="Heading")]
    assert _combine_recital_boundaries(nodes, []) == nodes


def test_inline_recitals_derive_count_and_order_from_source():
    nodes = [_node("whereas", "Whereas:", 0, kind="Heading"),
             _node("r1", "(1) First recital.", 1, kind="ListItem"),
             _node("r2", "(2) Second recital.", 2, kind="ListItem"),
             _node("formula", "HAVE ADOPTED THIS DIRECTIVE:", 3, kind="Heading")]
    decisions = []
    result = _combine_recital_boundaries(nodes, decisions)
    recitals = [node for node in result if node.type == "Recital"]
    assert [node.attributes["recitalNumber"] for node in recitals] == [1, 2]
    assert [node.exact_text for node in recitals] == ["(1) First recital.", "(2) Second recital."]
    assert len([decision for decision in decisions if decision.kind == "recital-binding"]) == 2


def test_ambiguous_duplicate_recital_anchor_fails_closed():
    nodes = [_node("whereas", "Whereas:", 0, kind="Heading"),
             _node("r1a", "(1) First candidate.", 1, kind="ListItem"),
             _node("r1b", "(1) Second candidate.", 2, kind="ListItem"),
             _node("r2", "(2) Second recital.", 3, kind="ListItem"),
             _node("formula", "HAS ADOPTED THIS DECISION:", 4, kind="Heading")]
    with pytest.raises(ValueError, match=r"Recital anchor \(1\) has 2"):
        _combine_recital_boundaries(nodes, [])


def test_excluded_furniture_must_be_disjoint_and_accounted_for():
    inline = _node("inline", "Legal", 0, kind="InlineSpan")
    document = _node("document", "", 0, kind="Document")
    document.children = [_node("paragraph", "Legal", 0)]
    document.children[0].children = [inline]
    assert assert_source_model_integrity(document, "Legal", ["s0", "furniture"], ["furniture"])["status"] == "PASS"
    with pytest.raises(AssertionError, match="both represented"):
        assert_source_model_integrity(document, "Legal", ["s0"], ["s0"])


def test_32006l0054_generalizes_recitals_tables_footnotes_and_native_docx(tmp_path: Path):
    document, _, diagnostics = build_typed_document(FIXTURE_0054, "32006L0054")
    recitals = [node for node in document.children if node.type == "Recital"]
    tables = [node for node in document.children if node.type == "Table"]
    assert [node.attributes["recitalNumber"] for node in recitals] == list(range(1, 42))
    assert validate_structural_reading_order(document)["status"] == "PASS"
    assert any(int(table.attributes["columns"]) == 5 for table in tables)
    annex_table_segments = [table for table in tables if int(table.attributes["columns"]) == 5]
    assert len(annex_table_segments) == 2
    assert len({table.attributes.get("logicalTableId") for table in annex_table_segments}) == 1
    assert diagnostics["crossPageTables"][0]["pages"] == [13, 14]
    coverage = assert_source_model_integrity(
        document, diagnostics["sourceReadingText"], diagnostics["sourceSpanIds"],
        diagnostics["excludedPageFurnitureSpanIds"])
    assert coverage == {**coverage, "status": "PASS"}
    assert coverage["sourceSpans"] == coverage["modelSpans"] + coverage["excludedSpans"]
    target = tmp_path / "32006L0054.docx"
    render_docx_phase2b(document, target)
    assert assert_text_integrity(document, target)["status"] == "PASS"
    with zipfile.ZipFile(target) as archive:
        root = etree.fromstring(archive.read("word/document.xml"))
        logical_tables = {table.attributes.get("logicalTableId", table.id) for table in tables}
        assert len(root.xpath(".//w:tbl", namespaces=W)) == len(logical_tables)
        assert len(root.xpath(".//w:footnoteReference", namespaces=W)) == 7


def test_32025d2586_ruled_landscape_table_footnote_and_furniture(tmp_path: Path):
    assert hashlib.sha256(FIXTURE_2586.read_bytes()).hexdigest() == "a189c5b49a8fef33e3bc873d3d03491213ee05187a3eb1813110a677e5d4f69d"
    document, decisions, diagnostics = build_typed_document(FIXTURE_2586, "32025D2586")
    recitals = [node for node in document.children if node.type == "Recital"]
    tables = [node for node in document.children if node.type == "Table"]
    assert [node.attributes["recitalNumber"] for node in recitals] == [1, 2, 3, 4]
    assert validate_structural_reading_order(document)["articles"] == [1, 2]
    assert len(tables) == 2
    assert all(table.attributes["detection"] == "ruled-grid" for table in tables)
    assert all(table.attributes["pageOrientation"] == "landscape" for table in tables)
    assert all(int(table.attributes["columns"]) == 5 for table in tables)
    assert [len(table.children) for table in tables] == [3, 3]
    assert len({table.attributes["logicalTableId"] for table in tables}) == 1
    assert diagnostics["crossPageTables"][0]["pages"] == [2, 3]
    assert tables[1].children[0].attributes["repeatedHeader"] is True
    logical_rows = tables[0].children + tables[1].children[1:]
    assert len(logical_rows) == 5
    assert [[cell.exact_text for cell in row.children][:2] for row in logical_rows] == [
        ["", "Name"],
        ["‘2.", "Gustavo Enrique GONZÁLEZ LÓPEZ"],
        ["11.", "Iván HERNÁNDEZ DALA"],
        ["31.", "Jorge Elieser MÁRQUEZ MONSALVE"],
        ["37.", "Remigio CEBALLOS ICHASO"],
    ]
    assert len(document.attributes["footnotes"]) == 1
    assert len([decision for decision in decisions if decision.kind == "footnote-link"]) == 1
    assert not [decision for decision in decisions if decision.ambiguity_status == "unresolved"]
    assert len(diagnostics["extraction"]["overlappingMarkerCorrections"]) == 1
    furniture = diagnostics["excludedPageFurniture"]
    assert {item["page"] for item in furniture} == {1, 2, 3}
    assert any("OJ L, 16.12.2025" in item["originalText"] for item in furniture)
    assert any(item["originalText"] == "3/3" for item in furniture)
    legal_text = "\n".join(node.exact_text for node in document.children if node.type not in {"PageBreak", "FootnoteBody"})
    assert "OJ L, 16.12.2025" not in legal_text
    assert "ELI: http://data.europa.eu/eli/dec/2025/2586/oj\n3/3" not in legal_text
    coverage = assert_source_model_integrity(document, diagnostics["sourceReadingText"], diagnostics["sourceSpanIds"], diagnostics["excludedPageFurnitureSpanIds"])
    assert coverage["status"] == "PASS"
    assert coverage["sourceSpans"] == coverage["modelSpans"] + coverage["excludedSpans"]

    target = tmp_path / "32025D2586.docx"
    render_docx_phase2b(document, target)
    integrity = assert_text_integrity(document, target)
    assert integrity["status"] == "PASS" and integrity["footnotes"] == 1
    with zipfile.ZipFile(target) as archive:
        root = etree.fromstring(archive.read("word/document.xml"))
        notes = etree.fromstring(archive.read("word/footnotes.xml"))
        native_tables = root.xpath(".//w:tbl", namespaces=W)
        assert len(native_tables) == 1
        assert len(native_tables[0].xpath("./w:tr", namespaces=W)) == 5
        assert all(len(row.xpath("./w:tc", namespaces=W)) == 5 for row in native_tables[0].xpath("./w:tr", namespaces=W))
        assert root.xpath(".//w:sectPr/w:pgSz[@w:orient='landscape']", namespaces=W)
        grid = [int(item.get(f"{{{W['w']}}}w")) for item in native_tables[0].xpath("./w:tblGrid/w:gridCol", namespaces=W)]
        assert grid[3] > grid[2] > grid[1] > grid[4] > grid[0]
        assert native_tables[0].xpath("./w:tr[1]/w:trPr/w:tblHeader", namespaces=W)
        assert len(native_tables[0].xpath("./w:tr/w:trPr/w:cantSplit", namespaces=W)) == 5
        assert len(root.xpath(".//w:footnoteReference", namespaces=W)) == 1
        actual_notes = notes.xpath("./w:footnote[not(@w:type)]", namespaces=W)
        assert len(actual_notes) == 1
        note_text = "".join(actual_notes[0].xpath(".//w:t/text()", namespaces=W))
        assert not note_text.startswith("(1)1)")
