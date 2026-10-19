import sys
from pathlib import Path

from app.reconstruction.pipeline import reconstruct_pdf


def test_production_reconstruction_has_no_spike_runtime_dependency():
    reconstruct_pdf(Path("workers/pdf-to-docx/tests/fixtures/32006L0114.pdf"), document_key="test")
    production_modules = [module for name, module in sys.modules.items() if name.startswith("app.reconstruction")]
    assert production_modules
    assert all("spikes" not in str(getattr(module, "__file__", "")) for module in production_modules)
