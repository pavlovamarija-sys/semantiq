import tempfile
import unittest
import zipfile
from pathlib import Path

from batch_mk2_corpus import docx_atoms


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def docx_with_body(body: str) -> Path:
    root = f'''<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="{W}"><w:body>{body}<w:sectPr/></w:body></w:document>'''
    temp = tempfile.NamedTemporaryFile(suffix=".docx", delete=False)
    temp.close()
    with zipfile.ZipFile(temp.name, "w") as archive:
        archive.writestr("word/document.xml", root)
    return Path(temp.name)


class DocxExtractionTests(unittest.TestCase):
    def extract(self, body: str):
        path = docx_with_body(body)
        try:
            return docx_atoms(path)
        finally:
            path.unlink()

    def test_normal_runs(self):
        atoms, _ = self.extract('<w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:t>world.</w:t></w:r></w:p>')
        self.assertEqual(atoms, ["Hello world."])

    def test_deleted_text_followed_by_visible_text(self):
        atoms, diagnostics = self.extract('<w:p><w:del><w:r><w:delText>old </w:delText></w:r></w:del><w:r><w:t>new.</w:t></w:r></w:p>')
        self.assertEqual(atoms, ["new."])
        self.assertEqual(diagnostics["revision-affected paragraphs"], 1)

    def test_inserted_text_is_current_text(self):
        atoms, _ = self.extract('<w:p><w:r><w:t>current </w:t></w:r><w:ins><w:r><w:t>inserted.</w:t></w:r></w:ins></w:p>')
        self.assertEqual(atoms, ["current inserted."])

    def test_deletion_and_insertion_replacement(self):
        atoms, _ = self.extract('<w:p><w:r><w:t>The </w:t></w:r><w:del><w:r><w:delText>old</w:delText></w:r></w:del><w:ins><w:r><w:t>new</w:t></w:r></w:ins><w:r><w:t> text.</w:t></w:r></w:p>')
        self.assertEqual(atoms, ["The new text."])

    def test_spaces_split_across_runs(self):
        atoms, _ = self.extract('<w:p><w:r><w:t>first</w:t></w:r><w:r><w:t xml:space="preserve"> second</w:t></w:r></w:p>')
        self.assertEqual(atoms, ["first second"])

    def test_table_cell_paragraph_with_revisions(self):
        atoms, diagnostics = self.extract('<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell </w:t></w:r><w:del><w:r><w:delText>bad</w:delText></w:r></w:del><w:ins><w:r><w:t>good.</w:t></w:r></w:ins></w:p></w:tc></w:tr></w:tbl>')
        self.assertEqual(atoms, ["Cell good."])
        self.assertEqual(diagnostics["table cells"], 1)
        self.assertEqual(diagnostics["revision-affected paragraphs"], 1)


if __name__ == "__main__":
    unittest.main()
