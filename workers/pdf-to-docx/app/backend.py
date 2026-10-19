from pathlib import Path

from .diagnostics import PdfDiagnostics, diagnose_pdf
from .reconstruct import ocr_to_docx, reconstruct_native_docx, reconstruct_raw_glyph_docx


class Pdf2DocxBackend:
    """Real layout-aware conversion backend, isolated behind a replaceable boundary."""

    @property
    def identity(self) -> str:
        from importlib.metadata import version
        return f"pdf2docx/{version('pdf2docx')} (PyMuPDF)"

    def convert(self, source: Path, target: Path) -> tuple[str, PdfDiagnostics]:
        diagnostics = diagnose_pdf(source)
        if diagnostics.classification == "raw_glyph_text":
            reconstruct_raw_glyph_docx(source, target)
            return "native-raw-glyph-reconstruction", diagnostics
        if diagnostics.classification != "native_text":
            ocr_to_docx(source, target)
            return "ocr-fallback", diagnostics
        # A visual two-column DOCX becomes corrupt when later normalized to one
        # column. Build the legal reading stream from PDF geometry first.
        reconstruct_native_docx(source, target)
        return "native-geometry-reconstruction", diagnostics

