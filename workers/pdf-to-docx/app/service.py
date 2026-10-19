from pathlib import Path

from .backend import Pdf2DocxBackend
from .footnotes import create_word_footnotes, validate_footnote_integrity
from .normalize import normalize_docx
from .profile import ConversionProfile
from .reading_order import validate_reading_order
from .validate import validate_docx


class ConversionService:
    def __init__(self, backend=None):
        self.backend = backend or Pdf2DocxBackend()

    @property
    def engine(self) -> str:
        return self.backend.identity

    def convert(self, source: Path, output: Path, profile: ConversionProfile) -> dict[str, object]:
        raw = output.with_name("raw.docx")
        conversion_path, diagnostics = self.backend.convert(source, raw)
        reading_order = validate_reading_order(raw)
        footnotes = create_word_footnotes(raw)
        normalize_docx(raw, output, profile)
        validate_footnote_integrity(output, footnotes, verify_formatting=True)
        report = validate_docx(output)
        return {**report, **reading_order, "footnotes": len(footnotes), "conversionPath": conversion_path, "ocrFallbackUsed": conversion_path == "ocr-fallback", "pdfClassification": diagnostics.classification}

