import hashlib
import json
from pathlib import Path
from fastapi.testclient import TestClient
from app import main

FIXTURE = Path(__file__).parent / "fixtures" / "32006L0114.pdf"
MODEL = Path(r"artifacts/pdf-phase6c3/controlled-run-readback/reconstruction-model.json")
DOCX = Path(r"artifacts/pdf-phase6c4/controlled-run-readback/validated-docx.docx")
ARTIFACT = "b0e8fec5-91c8-4755-87a4-ff8f6dd8d307"

def test_canonical_endpoint_preserves_units_tables_and_inline_breaks(monkeypatch):
    monkeypatch.setenv("PDF_TO_DOCX_SERVICE_TOKEN", "canonical-token")
    b = DOCX.read_bytes()
    r = TestClient(main.app).post("/canonicalize/docx", headers={"Authorization":"Bearer canonical-token"}, files={"document":("validated.docx",b,"application/vnd.openxmlformats-officedocument.wordprocessingml.document")}, data={"validated_docx_artifact_id":ARTIFACT,"validated_docx_sha256":hashlib.sha256(b).hexdigest()})
    assert r.status_code == 200
    assert r.headers["x-canonical-validation"] == "PASS"
    body = r.json(); metrics = json.loads(r.headers["x-canonical-metrics"])
    assert body["schemaVersion"] == "eu-acquis.canonical-document.v1"
    assert body["extractorVersion"] == "docx-canonical-phase6c5-v2-unicode"
    assert body["validatedDocxArtifactId"] == ARTIFACT
    assert metrics["translationUnitCount"] > 0
    assert metrics["inlineCodeCount"] == 3
    assert metrics["inlineCodeCount"] > 0
    assert metrics["normalizedTokens"] == 3389
    assert any(n["node_type"] == "table" for n in body["nodes"])
    assert sum(n["node_type"] == "table_cell" for n in body["nodes"]) == 100
    assert all(len(t["source_text"].strip()) > 0 for t in body["translationUnits"])
    all_source = " ".join(t["source_text"] for t in body["translationUnits"])
    assert "\ufffd" not in all_source
    assert "\u2019" in all_source
    tu_ordinals = [t["ordinal"] for t in body["translationUnits"]]
    assert tu_ordinals == list(range(len(tu_ordinals)))
    node_by_id = {n["id"]: n for n in body["nodes"]}
    assert any(node_by_id[t["node_id"]]["ordinal"] != t["ordinal"] for t in body["translationUnits"])

def test_canonical_endpoint_rejects_hash_mismatch(monkeypatch):
    monkeypatch.setenv("PDF_TO_DOCX_SERVICE_TOKEN", "canonical-token")
    r = TestClient(main.app).post("/canonicalize/docx", headers={"Authorization":"Bearer canonical-token"}, files={"document":("validated.docx",DOCX.read_bytes(),"application/vnd.openxmlformats-officedocument.wordprocessingml.document")}, data={"validated_docx_artifact_id":ARTIFACT,"validated_docx_sha256":"0"*64})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "canonical_validation_failed"

def test_canonical_endpoint_rejects_unsupported_external_content(monkeypatch, tmp_path):
    monkeypatch.setenv("PDF_TO_DOCX_SERVICE_TOKEN", "canonical-token")
    broken = tmp_path / "bad.docx"; broken.write_bytes(b"not-a-docx")
    r = TestClient(main.app).post("/canonicalize/docx", headers={"Authorization":"Bearer canonical-token"}, files={"document":("bad.docx",broken.read_bytes(),"application/vnd.openxmlformats-officedocument.wordprocessingml.document")}, data={"validated_docx_artifact_id":ARTIFACT,"validated_docx_sha256":hashlib.sha256(broken.read_bytes()).hexdigest()})
    assert r.status_code == 422
