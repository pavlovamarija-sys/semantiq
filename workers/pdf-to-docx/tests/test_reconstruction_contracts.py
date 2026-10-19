from app.reconstruction.contracts import DiagnosticRecord, SourceRef, Box
from app.reconstruction.validation import validate_provenance_exact_once, validate_token_integrity
import pytest


def provenance():
    return SourceRef(1, 1, ["l1"], ["s1"], [Box(1, 0.0, 0.0, 1.0, 1.0)], 0, 0)


def test_diagnostic_contract_requires_reason_and_evidence():
    with pytest.raises(ValueError):
        DiagnosticRecord("boundary", "d", [provenance()], "", 1.0, "MERGE", ["evidence"], "resolved")


def test_diagnostic_outcome_and_ambiguity_are_preserved():
    record = DiagnosticRecord("boundary", "d", [provenance()], "uncertain", 1.0, "ABSTAIN", ["evidence"], "unresolved")
    assert record.outcome == "ABSTAIN" and record.ambiguity_status == "unresolved"


def test_exact_once_and_token_failure_are_explicit():
    assert validate_provenance_exact_once(["s1", "s2"], ["s1", "s2"])['status'] == 'PASS'
    assert validate_provenance_exact_once(["s1", "s2"], ["s1", "s1"])['status'] == 'FAIL'
    assert validate_token_integrity("one two", "one two")['status'] == 'PASS'
    assert validate_token_integrity("one two", "two one")['status'] == 'FAIL'


def test_contract_containers_do_not_alias_between_nodes():
    first = DiagnosticRecord("layout", "a", [provenance()], "first", 1.0, "recorded", ["e"], "not-ambiguous")
    second = DiagnosticRecord("layout", "b", [provenance()], "second", 1.0, "recorded", ["e"], "not-ambiguous")
    first.evidence.append("local")
    assert second.evidence == ["e"]
