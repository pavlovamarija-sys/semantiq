import hashlib
import json
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

from app import main

FIXTURE = Path(__file__).parent / "fixtures" / "32006L0114.pdf"


def _request(monkeypatch):
    monkeypatch.setenv("PDF_TO_DOCX_SERVICE_TOKEN", "model-token")
    source = FIXTURE.read_bytes()
    return TestClient(main.app).post("/reconstruct/model",
        headers={"Authorization": "Bearer model-token"},
        files={"document": ("fixture.pdf", source, "application/pdf")},
        data={"generation_id": "10000000-0000-4000-8000-000000000001",
              "source_artifact_id": "20000000-0000-4000-8000-000000000002",
              "source_sha256": hashlib.sha256(source).hexdigest(),
              "config_sha256": hashlib.sha256(b"{}").hexdigest()})


def test_model_endpoint_returns_validated_deterministic_json(monkeypatch):
    first, second = _request(monkeypatch), _request(monkeypatch)
    assert first.status_code == 200
    assert first.content == second.content
    payload = first.json()
    assert payload["schemaVersion"] == "eu-acquis.reconstruction-model.v1"
    assert payload["validation"]["status"] == "PASS"
    assert payload["validation"]["sourceCoverage"]["sourceSpans"] == 3362
    assert payload["metrics"]["physicalTables"] == 3
    assert payload["metrics"]["rows"] == 48
    assert payload["metrics"]["cells"] == 100
    assert "sourceReadingText" not in payload["diagnostics"]


def test_model_endpoint_rejects_source_hash_mismatch(monkeypatch):
    monkeypatch.setenv("PDF_TO_DOCX_SERVICE_TOKEN", "model-token")
    response = TestClient(main.app).post("/reconstruct/model",
        headers={"Authorization": "Bearer model-token"},
        files={"document": ("fixture.pdf", FIXTURE.read_bytes(), "application/pdf")},
        data={"generation_id": str(uuid.uuid4()), "source_artifact_id": str(uuid.uuid4()),
              "source_sha256": "0" * 64, "config_sha256": hashlib.sha256(b"{}").hexdigest()})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "source_hash_mismatch"


def test_model_endpoint_requires_authentication(monkeypatch):
    monkeypatch.setenv("PDF_TO_DOCX_SERVICE_TOKEN", "model-token")
    response = TestClient(main.app).post("/reconstruct/model")
    assert response.status_code in (401, 422)
