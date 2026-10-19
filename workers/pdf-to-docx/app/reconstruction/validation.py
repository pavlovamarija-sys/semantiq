from __future__ import annotations

import re
from collections import Counter
from typing import Iterable

from .contracts import ReconstructionDecision


def _tokens(text: str) -> list[str]:
    return re.findall(r"\S+", re.sub(r"\s+", " ", text).strip())


def validate_decisions(decisions: Iterable[ReconstructionDecision]) -> dict[str, object]:
    items = list(decisions)
    ids = [item.decision_id for item in items]
    if len(ids) != len(set(ids)):
        raise ValueError("Reconstruction decision IDs must be unique.")
    return {"status": "PASS", "total": len(items), "outcomes": dict(Counter(item.outcome.value for item in items))}


def validate_provenance_exact_once(source_span_ids: Iterable[str], represented_span_ids: Iterable[str]) -> dict[str, object]:
    expected, actual = list(source_span_ids), list(represented_span_ids)
    missing = sorted(set(expected) - set(actual))
    added = sorted(set(actual) - set(expected))
    duplicated = sorted(span for span, count in Counter(actual).items() if count > 1)
    result = {"status": "PASS" if not missing and not added and not duplicated and Counter(expected) == Counter(actual) else "FAIL",
              "missing": missing, "added": added, "duplicated": duplicated,
              "sourceSpans": len(expected), "representedSpans": len(actual)}
    return result


def validate_token_integrity(expected_text: str, actual_text: str) -> dict[str, object]:
    expected, actual = _tokens(expected_text), _tokens(actual_text)
    missing = list((Counter(expected) - Counter(actual)).elements())
    added = list((Counter(actual) - Counter(expected)).elements())
    result = {"status": "PASS" if expected == actual else "FAIL", "missing": missing, "added": added,
              "duplicated": max(0, len(actual) - len(set(actual))) if expected != actual else 0,
              "changed": 0 if expected == actual else 1, "reordered": 0 if expected == actual else 1,
              "expectedTokens": len(expected), "actualTokens": len(actual)}
    return result
