from __future__ import annotations

import re
from pathlib import Path

from docx import Document

from .errors import WorkerError

ARTICLE = re.compile(r"^Article\s+(\d+|IS)\s*:?\s*$", re.I)
CHAPTER = re.compile(r"^CHAPTER\s+([IVXLCDM]+|1)[\s.:]*$", re.I)
ANNEX = re.compile(r"^ANNEX\s+([A-Z]|[IVXLCDM]+)[\s.:]*$", re.I)
ENACTING = re.compile(r"^HAS ADOPTED THIS DIRECTIVE\s*:\s*$", re.I)


def _roman(value: str) -> int:
    if value == "1":
        return 1
    values = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    total = previous = 0
    for character in reversed(value.upper()):
        number = values[character]
        total += -number if number < previous else number
        previous = max(previous, number)
    return total


def validate_reading_order(path: Path) -> dict[str, object]:
    texts = [" ".join(p.text.split()) for p in Document(path).paragraphs if p.text.strip()]
    issues: list[str] = []
    articles = [(i, 15 if m.group(1).upper() == "IS" else int(m.group(1))) for i, text in enumerate(texts) if (m := ARTICLE.match(text))]
    chapters = [(i, _roman(m.group(1))) for i, text in enumerate(texts) if (m := CHAPTER.match(text))]
    annexes = [(i, ord(m.group(1)) - 64 if m.group(1) in "ABCD" else _roman(m.group(1))) for i, text in enumerate(texts) if (m := ANNEX.match(text))]
    for label, markers in (("Article", articles), ("CHAPTER", chapters), ("ANNEX", annexes)):
        for (_, previous), (_, current) in zip(markers, markers[1:]):
            if current <= previous or current > previous + 1:
                issues.append(f"{label} sequence is impossible: {previous} followed by {current}")
                break
    enacted = next((i for i, text in enumerate(texts) if ENACTING.match(text)), None)
    if enacted is not None:
        if chapters and enacted > chapters[0][0]:
            issues.append("enacting formula appears after the first chapter")
        if articles and enacted > articles[0][0]:
            issues.append("enacting formula appears after the first article")
    if issues:
        raise WorkerError("invalid_reading_order", "Legal reading-order validation failed; the document was not marked Ready.", details={"issues": issues})
    return {"readingOrderValidated": True, "articles": len(articles), "chapters": len(chapters), "annexes": len(annexes)}
