import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path


SCRIPT = Path(__file__).with_name("docx_validator.py")
SPEC = importlib.util.spec_from_file_location("docx_validator", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)

CONTENT_TYPES = """<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""
ROOT_RELS = """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""
DOCUMENT = """<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:spacing w:before="120" w:after="120" w:line="240" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r><w:t>Editable legal text</w:t></w:r></w:p>
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:bottom="1440" w:left="1797" w:right="1797"/><w:cols w:num="1"/></w:sectPr>
</w:body></w:document>"""


def write_package(path: Path, measurement_unit: str = "centimeters", broken_relationship: bool = False, document_xml: str = DOCUMENT):
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("[Content_Types].xml", CONTENT_TYPES)
        archive.writestr("_rels/.rels", ROOT_RELS)
        archive.writestr("word/document.xml", document_xml)
        archive.writestr("word/settings.xml", f"<w:settings xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:measurementUnit w:val=\"{measurement_unit}\"/></w:settings>")
        if broken_relationship:
            archive.writestr("word/_rels/document.xml.rels", "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId2\" Type=\"test\" Target=\"missing.xml\"/></Relationships>")


class DocxValidatorTest(unittest.TestCase):
    def test_accepts_structurally_valid_docx(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "valid.docx"
            write_package(path)
            report = MODULE.validate_docx(path)
            self.assertEqual(report["mimeType"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
            self.assertEqual(len(report["sha256"]), 64)

    def test_rejects_invalid_measurement_unit_that_word_repairs(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invalid.docx"
            write_package(path, measurement_unit="cm")
            with self.assertRaisesRegex(MODULE.DocxValidationError, "measurementUnit"):
                MODULE.validate_docx(path)

    def test_rejects_broken_internal_relationship(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invalid.docx"
            write_package(path, broken_relationship=True)
            with self.assertRaisesRegex(MODULE.DocxValidationError, "Broken relationship"):
                MODULE.validate_docx(path)

    def test_accepts_centered_legal_act_identifier_from_eur_lex_document(self):
        document = DOCUMENT.replace(
            '<w:p><w:pPr><w:spacing w:before="120" w:after="120" w:line="240" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r><w:t>Editable legal text</w:t></w:r></w:p>',
            '<w:p><w:pPr><w:spacing w:before="120" w:after="120" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:r><w:t>(90/426/EEC)</w:t></w:r></w:p>',
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "legal-act-identifier.docx"
            write_package(path, document_xml=document)
            report = MODULE.validate_docx(path)
            self.assertGreater(report["editableCharacters"], 0)

    def test_alignment_failure_reports_paragraph_diagnostics(self):
        document = DOCUMENT.replace('w:val="both"', 'w:val="center"', 1)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "misaligned-body.docx"
            write_package(path, document_xml=document)
            with self.assertRaises(MODULE.DocxValidationError) as raised:
                MODULE.validate_docx(path)
            message = str(raised.exception)
            self.assertIn("paragraph index=0", message)
            self.assertIn("text='Editable legal text'", message)
            self.assertIn("classification=body", message)
            self.assertIn("actual alignment=center", message)
            self.assertIn("expected alignment=both", message)

    def test_accepts_landscape_section_with_landscape_geometry(self):
        document = DOCUMENT.replace(
            '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:bottom="1440" w:left="1797" w:right="1797"/><w:cols w:num="1"/></w:sectPr>',
            '<w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="680" w:bottom="680" w:left="680" w:right="680"/><w:cols w:num="1"/></w:sectPr>',
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "landscape.docx"
            write_package(path, document_xml=document)
            self.assertGreater(MODULE.validate_docx(path)["editableCharacters"], 0)

    def test_rejects_table_wider_than_landscape_printable_area(self):
        document = DOCUMENT.replace(
            '<w:p><w:pPr><w:spacing w:before="120" w:after="120" w:line="240" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r><w:t>Editable legal text</w:t></w:r></w:p>',
            '<w:tbl><w:tblGrid><w:gridCol w:w="15000"/></w:tblGrid><w:tr><w:tc><w:p><w:pPr><w:spacing w:before="120" w:after="120" w:line="240" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r><w:t>Editable legal text</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
        ).replace(
            '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:bottom="1440" w:left="1797" w:right="1797"/><w:cols w:num="1"/></w:sectPr>',
            '<w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="680" w:bottom="680" w:left="680" w:right="680"/><w:cols w:num="1"/></w:sectPr>',
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "oversized-table.docx"
            write_package(path, document_xml=document)
            with self.assertRaisesRegex(MODULE.DocxValidationError, "exceeds.*printable width"):
                MODULE.validate_docx(path)

    def test_accepts_source_derived_semantic_heading_without_heading_style(self):
        document = DOCUMENT.replace(
            '<w:p><w:pPr><w:spacing w:before="120" w:after="120" w:line="240" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r><w:t>Editable legal text</w:t></w:r></w:p>',
            '<w:p><w:pPr><w:outlineLvl w:val="0"/><w:spacing w:before="120" w:after="120" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:r><w:t>amending a legal act concerning restrictive measures in view of the situation in</w:t></w:r></w:p>',
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "semantic-heading.docx"
            write_package(path, document_xml=document)
            self.assertGreater(MODULE.validate_docx(path)["editableCharacters"], 0)


if __name__ == "__main__":
    unittest.main()
