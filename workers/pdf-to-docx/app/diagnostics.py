from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from pathlib import Path

import pymupdf


logger = logging.getLogger("pdf_to_docx.diagnostics")


@dataclass(frozen=True)
class PageDiagnostics:
    page: int
    width: float
    height: float
    textCharacters: int
    words: int
    rawCharacters: int
    replacementCharacters: int
    images: int
    imageCoverage: float
    drawings: int
    classification: str


@dataclass(frozen=True)
class PdfDiagnostics:
    pages: tuple[PageDiagnostics, ...]
    nativeCharacters: int
    nativeWords: int
    rawCharacters: int
    classification: str

    def log(self) -> None:
        for page in self.pages:
            logger.info("pdf_page_diagnostics %s", asdict(page))
        logger.info("pdf_diagnostics_summary %s", {
            "pages": len(self.pages), "nativeCharacters": self.nativeCharacters,
            "nativeWords": self.nativeWords, "rawCharacters": self.rawCharacters,
            "classification": self.classification,
        })


@dataclass(frozen=True)
class PdfAnalysis:
    sourceText: str
    charactersWithoutSpaces: int
    charactersWithSpaces: int
    diagnostics: PdfDiagnostics


def _raw_characters(page: pymupdf.Page) -> tuple[int, int]:
    raw = page.get_text("rawdict")
    values = [char.get("c", "") for block in raw.get("blocks", []) if block.get("type") == 0
              for line in block.get("lines", []) for span in line.get("spans", []) for char in span.get("chars", [])]
    return sum(len(value) for value in values), sum(value == "\ufffd" for value in values)


def _image_coverage(page: pymupdf.Page) -> float:
    area = max(page.rect.width * page.rect.height, 1)
    rectangles = []
    for image in page.get_images(full=True):
        try:
            rectangles.extend(page.get_image_rects(image[0]))
        except Exception:
            continue
    # Capped sum is sufficient for classification and avoids expensive union geometry.
    return min(1.0, sum(max(rect.width, 0) * max(rect.height, 0) for rect in rectangles) / area)


def analyze_pdf(path: Path) -> PdfAnalysis:
    """Canonical PyMuPDF extraction used by analysis and Transformer diagnostics."""
    pages: list[PageDiagnostics] = []
    page_texts: list[str] = []
    with pymupdf.open(path) as document:
        for index, page in enumerate(document):
            text = page.get_text("text", sort=True)
            page_texts.append(text)
            words = page.get_text("words", sort=True)
            raw_count, replacements = _raw_characters(page)
            images = page.get_images(full=True)
            coverage = _image_coverage(page)
            drawings = len(page.get_drawings())
            useful = len("".join(text.split()))
            if useful >= 10 or len(words) >= 3:
                classification = "native_text"
            elif raw_count >= 10 and replacements / max(raw_count, 1) < 0.25:
                classification = "raw_glyph_text"
            elif images and coverage >= 0.35:
                classification = "scanned_image"
            elif drawings:
                classification = "vector_or_outlined_glyphs"
            else:
                classification = "empty_or_unknown"
            pages.append(PageDiagnostics(
                page=index + 1, width=round(page.rect.width, 2), height=round(page.rect.height, 2),
                textCharacters=len(text), words=len(words), rawCharacters=raw_count,
                replacementCharacters=replacements, images=len(images), imageCoverage=round(coverage, 4),
                drawings=drawings, classification=classification,
            ))
    native_chars = sum(page.textCharacters for page in pages)
    native_words = sum(page.words for page in pages)
    raw_chars = sum(page.rawCharacters for page in pages)
    if native_chars >= max(20, len(pages) * 5) and native_words >= max(3, len(pages)):
        classification = "native_text"
    elif raw_chars >= max(20, len(pages) * 5) and sum(page.replacementCharacters for page in pages) / max(raw_chars, 1) < 0.25:
        classification = "raw_glyph_text"
    elif any(page.classification == "scanned_image" for page in pages):
        classification = "scanned_image"
    elif any(page.classification == "vector_or_outlined_glyphs" for page in pages):
        classification = "vector_or_outlined_glyphs"
    else:
        classification = "empty_or_unknown"
    diagnostics = PdfDiagnostics(tuple(pages), native_chars, native_words, raw_chars, classification)
    diagnostics.log()
    source_text = "\n".join(page_texts)
    return PdfAnalysis(
        sourceText=source_text,
        charactersWithoutSpaces=sum(not character.isspace() for character in source_text),
        charactersWithSpaces=sum(not character.isspace() or character in {" ", "\u00a0"} for character in source_text),
        diagnostics=diagnostics,
    )


def diagnose_pdf(path: Path) -> PdfDiagnostics:
    return analyze_pdf(path).diagnostics


def count_pdf_characters(path: Path) -> tuple[int, int]:
    analysis = analyze_pdf(path)
    return analysis.charactersWithoutSpaces, analysis.charactersWithSpaces

