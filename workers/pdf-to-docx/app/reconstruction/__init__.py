"""Inactive, versioned PDF reconstruction API.

This package is intentionally not imported by ``app.main`` yet. Phase 6A
extracts contracts and validation first; activation is a later rollout step.
"""

from .contracts import (
    AmbiguityStatus, BoundaryOutcome, DiagnosticRecord, Provenance, ReconstructionDecision,
)
from .validation import (
    validate_decisions, validate_provenance_exact_once, validate_token_integrity,
)

__all__ = ["AmbiguityStatus", "BoundaryOutcome", "DiagnosticRecord", "Provenance", "ReconstructionDecision",
           "validate_decisions", "validate_provenance_exact_once", "validate_token_integrity"]
