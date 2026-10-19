from __future__ import annotations

from pathlib import Path
from typing import Any


ALGORITHM_VERSION = "typed-reconstruction-phase6a-inactive"


def reconstruct_pdf(pdf_path: Path, *, document_key: str | None = None) -> tuple[Any, list[Any], dict[str, object]]:
    """Stable facade for the validated deterministic reconstruction core.

    The historical algorithm identity is retained for immutable model-lineage
    compatibility; the active conversion endpoint now calls this facade.
    """
    from .core import build_typed_document
    return build_typed_document(pdf_path, document_key)
