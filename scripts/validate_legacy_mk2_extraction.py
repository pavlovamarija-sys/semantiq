"""Resumable extraction-only validation for trusted legacy MK2 DOC files."""
from __future__ import annotations

import argparse
import contextlib
import csv
import io
import json
import time
from pathlib import Path

from batch_mk2_corpus import extract_mk2


FIELDS = ["CELEX", "path", "conversion", "paragraphs", "table cells", "characters", "error"]


def celex_for(path: Path, corpus: Path) -> str:
    try:
        relative = path.relative_to(corpus)
        if relative.parts and relative.parts[0] == "Documents":
            return relative.parts[1]
    except (ValueError, IndexError):
        pass
    return ""


def load_checkpoint(path: Path) -> dict[str, dict[str, str]]:
    if not path.is_file():
        return {}
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return {row["path"]: row for row in csv.DictReader(handle) if row.get("path")}


def save_checkpoint(path: Path, rows: dict[str, dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows.values())
        handle.flush()
    temporary.replace(path)


def aggregate(rows: list[dict[str, str]]) -> dict[str, object]:
    failures = [row for row in rows if row["conversion"] == "failure"]
    reasons: dict[str, int] = {}
    for row in failures:
        reasons[row["error"]] = reasons.get(row["error"], 0) + 1
    return {
        "total DOC files": len(rows),
        "successful conversions": sum(row["conversion"] == "success" for row in rows),
        "failed conversions": len(failures),
        "total extracted characters": sum(int(row["characters"]) for row in rows),
        "zero-text conversions": sum(row["conversion"] == "success" and int(row["characters"]) == 0 for row in rows),
        "failure reasons": reasons,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", type=Path, default=Path(r"D:\Преводи\EU_Acquis_Corpus"))
    parser.add_argument("--checkpoint", type=Path, default=Path("scripts/output/legacy_mk2_extraction.csv"))
    parser.add_argument("--aggregate", type=Path, default=Path("scripts/output/legacy_mk2_extraction.aggregate.json"))
    args = parser.parse_args()

    files = sorted(args.corpus.rglob("*.doc"))
    rows = load_checkpoint(args.checkpoint)
    started = time.perf_counter()
    total = len(files)
    for index, path in enumerate(files, 1):
        key = str(path)
        existing = rows.get(key)
        if existing and existing.get("conversion") == "success":
            elapsed = time.perf_counter() - started
            print(f"[{index}/{total}] {existing['CELEX']} - success - {existing['characters']} - {elapsed:.1f}s (checkpoint)", flush=True)
            continue

        row = {field: "" for field in FIELDS}
        row.update({"CELEX": celex_for(path, args.corpus), "path": key, "conversion": "failure", "paragraphs": "0", "table cells": "0", "characters": "0", "error": ""})
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                atoms, diagnostics = extract_mk2(path)
            row.update({"conversion": "success", "paragraphs": str(diagnostics["paragraphs"]), "table cells": str(diagnostics["table cells"]), "characters": str(diagnostics["characters"])})
        except Exception as exc:  # Per-file isolation is intentional.
            row["error"] = str(exc)
        rows[key] = row
        save_checkpoint(args.checkpoint, rows)
        elapsed = time.perf_counter() - started
        print(f"[{index}/{total}] {row['CELEX']} - {row['conversion']} - {row['characters']} - {elapsed:.1f}s", flush=True)

    result = aggregate(list(rows.values()))
    args.aggregate.parent.mkdir(parents=True, exist_ok=True)
    args.aggregate.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
