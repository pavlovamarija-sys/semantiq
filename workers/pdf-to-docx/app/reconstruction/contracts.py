from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal

@dataclass(frozen=True)
class Box:
    page: int; x0: float; y0: float; x1: float; y1: float

@dataclass(frozen=True)
class SourceRef:
    page: int; block_index: int; line_ids: list[str]; span_ids: list[str]; boxes: list[Box]; reading_order_start: int; reading_order_end: int

@dataclass(frozen=True)
class StyleEvidence:
    font_families: list[str]; font_sizes: list[float]; bold: bool; italic: bool; alignment: str | None; indentation: float

@dataclass(frozen=True)
class Classification:
    method: Literal["deterministic"]; confidence: float; evidence: list[str]

@dataclass
class Node:
    id: str; type: str; exact_text: str; source: list[SourceRef]; style: StyleEvidence; classification: Classification; children: list["Node"] = field(default_factory=list); attributes: dict[str, object] = field(default_factory=dict)

@dataclass
class DiagnosticRecord:
    kind: str; node_id: str; source: list[SourceRef]; reason: str; confidence: float; outcome: str = "recorded"; evidence: list[str] = field(default_factory=list); ambiguity_status: Literal["not-ambiguous", "resolved", "unresolved"] = "not-ambiguous"
    def __post_init__(self):
        if not self.kind.strip() or not self.node_id.strip() or not self.reason.strip(): raise ValueError("Diagnostic kind, node_id and reason are required.")
        if not 0 <= self.confidence <= 1: raise ValueError("Diagnostic confidence must be between 0 and 1.")
        if not isinstance(self.evidence, list) or any(not isinstance(x, str) or not x.strip() for x in self.evidence): raise ValueError("Diagnostic evidence must contain non-empty statements.")
    @classmethod
    def from_mapping(cls, value: dict[str, object], *, source: list[SourceRef] | None = None, node_id: str | None = None):
        required=("kind","node_id","reason","confidence","outcome","evidence","ambiguity_status"); missing=[k for k in required if k not in value]
        if missing: raise ValueError(f"Diagnostic record is missing required fields: {', '.join(missing)}")
        return cls(str(value["kind"]), node_id or str(value["node_id"]), source or [], str(value["reason"]), float(value["confidence"]), str(value["outcome"]), list(value["evidence"]), str(value["ambiguity_status"]))

Decision = DiagnosticRecord

@dataclass(frozen=True)
class BoundaryClassification:
    decision: Literal["MERGE", "KEEP_BOUNDARY", "ABSTAIN"]; confidence: float; reason: str; evidence: list[str]

@dataclass
class Fragment:
    page: int; block_index: int; text: str; box: Box; line_ids: list[str]; span_ids: list[str]; fonts: list[str]; sizes: list[float]; bold: bool; italic: bool; span_records: list[dict[str, object]]; reading_order: int = -1
    @property
    def x0(self): return self.box.x0
    @property
    def y0(self): return self.box.y0
    @property
    def x1(self): return self.box.x1
    @property
    def y1(self): return self.box.y1

BoundaryOutcome = Literal["MERGE", "KEEP_BOUNDARY", "ABSTAIN"]
AmbiguityStatus = Literal["not-ambiguous", "resolved", "unresolved"]
Provenance = SourceRef
ReconstructionDecision = DiagnosticRecord
