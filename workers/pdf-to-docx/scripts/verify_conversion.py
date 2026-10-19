import argparse
import json
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.profile import ConversionProfile  # noqa: E402
from app.validate import validate_docx  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--url", required=True)
    parser.add_argument("--token", required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    profile = ConversionProfile(preserve=["legal-structure", "tables", "footnotes"])
    with args.pdf.open("rb") as stream:
        response = httpx.post(args.url, headers={"Authorization": f"Bearer {args.token}"}, files={"document": (args.pdf.name, stream, "application/pdf")}, data={"profile": profile.model_dump_json(by_alias=True)}, timeout=600)
    response.raise_for_status()
    if response.headers.get("x-ooxml-validated") != "true":
        raise RuntimeError("Worker did not attest to OOXML validation")
    output = args.output or args.pdf.with_suffix(".converted.docx")
    output.write_bytes(response.content)
    print(json.dumps({"output": str(output), "engine": response.headers.get("x-converter-engine"), **validate_docx(output)}, indent=2))


if __name__ == "__main__":
    main()
