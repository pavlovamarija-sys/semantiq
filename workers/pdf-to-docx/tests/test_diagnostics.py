from pathlib import Path

import pymupdf
from app.backend import Pdf2DocxBackend
from app.diagnostics import analyze_pdf, count_pdf_characters, diagnose_pdf
from app.reconstruct import reconstruct_native_docx
from app.validate import validate_docx


def _native_pdf(path: Path):
    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((72, 100), "Article 1 This Regulation establishes common rules.")
    document.save(path)


def _image_only_pdf(path: Path):
    source = pymupdf.open()
    page = source.new_page()
    page.insert_text((72, 100), "Scanned legal document without a PDF text layer.", fontsize=16)
    pixmap = page.get_pixmap(dpi=150, alpha=False)
    source.close()
    scanned = pymupdf.open()
    output_page = scanned.new_page(width=pixmap.width, height=pixmap.height)
    output_page.insert_image(output_page.rect, stream=pixmap.tobytes("png"))
    scanned.save(path)


def test_diagnoses_native_text(tmp_path):
    path = tmp_path / "native.pdf"
    _native_pdf(path)
    result = diagnose_pdf(path)
    assert result.classification == "native_text"
    assert result.nativeWords > 3
    without_spaces, with_spaces = count_pdf_characters(path)
    assert without_spaces == len("Article1ThisRegulationestablishescommonrules.")
    assert with_spaces == len("Article 1 This Regulation establishes common rules.")
    analysis = analyze_pdf(path)
    assert analysis.sourceText.strip() == "Article 1 This Regulation establishes common rules."
    assert analysis.charactersWithoutSpaces == without_spaces
    assert analysis.charactersWithSpaces == with_spaces


def test_diagnoses_scanned_image(tmp_path):
    path = tmp_path / "scanned.pdf"
    _image_only_pdf(path)
    result = diagnose_pdf(path)
    assert result.classification == "scanned_image"
    assert result.nativeWords == 0
    assert result.pages[0].imageCoverage > 0.9


def test_native_positioned_text_reconstruction_is_editable(tmp_path):
    source = tmp_path / "native.pdf"
    output = tmp_path / "native.docx"
    _native_pdf(source)
    reconstruct_native_docx(source, output)
    report = validate_docx(output)
    assert report["editableCharacters"] > 20


def test_native_text_uses_geometry_reconstruction(tmp_path):
    source = tmp_path / "native.pdf"
    output = tmp_path / "reconstructed.docx"
    _native_pdf(source)
    path, diagnostics = Pdf2DocxBackend().convert(source, output)
    assert path == "native-geometry-reconstruction"
    assert diagnostics.classification == "native_text"
    assert validate_docx(output)["editableCharacters"] > 20
