from __future__ import annotations

from .contracts import AmbiguityStatus, DiagnosticRecord, Provenance


def make_diagnostic(*, record_type: str, outcome: str, reason: str, evidence: list[str],
                    source: list[Provenance], ambiguity_status: AmbiguityStatus,
                    confidence: float | None = None, details: dict[str, object] | None = None) -> DiagnosticRecord:
    """Single construction boundary for diagnostics; malformed records fail immediately."""
    return DiagnosticRecord(record_type, outcome, reason, tuple(evidence), ambiguity_status,
                             confidence, tuple(source), details or {})
