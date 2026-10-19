from pathlib import Path
from fastapi.testclient import TestClient

from app import main


FIXTURE = Path(__file__).parent / "fixtures" / "32006L0114.pdf"


def test_shadow_endpoint_is_non_authoritative_and_returns_summary(monkeypatch):
    monkeypatch.setenv("PDF_TO_DOCX_SERVICE_TOKEN", "shadow-token")
    response = TestClient(main.app).post(
        "/shadow/reconstruct",
        headers={"Authorization": "Bearer shadow-token"},
        files={"document": ("fixture.pdf", FIXTURE.read_bytes(), "application/pdf")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "completed"
    assert payload["typedModelSummary"]["spans"] == 3362
    assert "docxSha256" in payload
    assert "sourceText" not in payload


def test_shadow_rejects_without_affecting_any_active_result(monkeypatch):
    monkeypatch.setenv("PDF_TO_DOCX_SERVICE_TOKEN", "shadow-token")
    response = TestClient(main.app).post(
        "/shadow/reconstruct",
        headers={"Authorization": "Bearer shadow-token"},
        files={"document": ("fixture.pdf", b"not-a-pdf", "application/pdf")},
    )
    assert response.status_code == 415
