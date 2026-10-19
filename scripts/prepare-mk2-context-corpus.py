"""Prepare deduplicated, provenance-rich MK2 context chunks from the trusted sure-set.

Read-only with respect to the corpus. Reuses batch_mk2_corpus.extract_mk2 for DOC/DOCX.
"""
from __future__ import annotations

import csv
import hashlib
import json
import os
import re
from collections import Counter, OrderedDict
from pathlib import Path

from batch_mk2_corpus import extract_mk2

ROOT = Path(r"D:\Преводи\EU_Acquis_Corpus")
SUMMARY = Path(__file__).resolve().parent / "output" / "final-mk1-mk2-dry-run" / "final-summary.json"
OUT = Path(os.environ.get("MK2_CONTEXT_OUT", Path(__file__).resolve().parent / "output" / "mk2-context-corpus"))
META = ROOT / "_metadata" / "sure_set.csv"

ARTICLE = re.compile(r"^ARTICLE\s+\d+[A-Z]?(?:\s*[-–—:].*)?$", re.I)
CHAPTER = re.compile(r"^(?:CHAPTER|SECTION)\s+(?:[IVXLCDM]+|\d+|[A-Z])(?:\b.*)?$", re.I)
ANNEX = re.compile(r"^ANNEX(?:\s+(?:[IVXLCDM]+|\d+|[A-Z]))?(?:\s*[-–—:.)].*)?$", re.I)
TITLE = re.compile(r"^(?:(?:THE\s+)?(?:COUNCIL|COMMISSION|EUROPEAN\s+PARLIAMENT)\b|(?:DIRECTIVE|REGULATION|DECISION)\b)", re.I)
METADATA = re.compile(r"^(?:CELEX|SOURCE|TARGET|TMX|MK1|MK2|PAGE|DOCUMENT\s+ID)\s*[:=]", re.I)


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\u00a0", " ")).strip()


def structural(text: str) -> bool:
    return bool(CHAPTER.match(text) or ARTICLE.match(text) or ANNEX.match(text) or TITLE.match(text))


def valid_body(text: str) -> bool:
    if not text or METADATA.match(text) or len(text) < 40:
        return False
    if re.fullmatch(r"[\W\d_]+", text) or re.fullmatch(r"(?:[A-Z]\s*){1,8}", text):
        return False
    return any(character.isalpha() for character in text) and (text.endswith((".", ";", ":", ")")) or len(text) >= 80)


def chunk_document(celex: str, source_path: Path, atoms: list[str], diagnostics: dict[str, object]) -> list[dict[str, object]]:
    context = {"chapter": None, "section": None, "article": None, "annex": None}
    chunks: list[dict[str, object]] = []
    order = 0
    for paragraph_index, raw in enumerate(atoms, 1):
        text = norm(raw)
        if not text:
            continue
        if CHAPTER.match(text):
            context["chapter"] = text; context["section"] = None; context["article"] = None; context["annex"] = None; continue
        if ANNEX.match(text):
            context["annex"] = text; context["chapter"] = None; context["section"] = None; context["article"] = None; continue
        if ARTICLE.match(text):
            context["article"] = text; continue
        if TITLE.match(text) and len(text) < 180:
            continue
        if not valid_body(text):
            continue
        order += 1
        chunks.append({"celex": celex, "text": text, "normalized_text": norm(text).casefold(), "paragraph_order": order, "source_paragraph_index": paragraph_index, "context": dict(context), "source_file": str(source_path), "source_format": source_path.suffix.lower().lstrip("."), "extraction_method": diagnostics.get("extraction method", diagnostics.get("extraction_method", "working extraction pipeline")), "characters": len(text)})
    return chunks


def main() -> None:
    final = json.loads(SUMMARY.read_text(encoding="utf-8"))
    final_by_celex = {row["CELEX"]: row for row in final["documents"]}
    sure_rows = {row["DocumentID"]: row for row in csv.DictReader(META.open(encoding="utf-8-sig", newline="")) if row.get("Sure_Set", "").lower() == "true"}
    chunks: OrderedDict[str, dict[str, object]] = OrderedDict()
    failures: list[dict[str, str]] = []
    processed = []
    skipped = []
    raw_characters = 0
    for celex in sorted(sure_rows):
        final_row = final_by_celex.get(celex, {})
        if final_row.get("status") != "DRY_RUN" or int(final_row.get("accepted_clean_tus", 0)) <= 0:
            skipped.append({"celex": celex, "reason": "not in finalized trusted sure-set with accepted clean TUs"})
            continue
        path = Path(sure_rows[celex].get("MK2_File", ""))
        if not path.is_file():
            skipped.append({"celex": celex, "reason": "declared MK2 file missing"}); continue
        try:
            atoms, diagnostics = extract_mk2(path)
            raw_characters += int(diagnostics.get("characters", 0))
            document_chunks = chunk_document(celex, path, atoms, diagnostics)
            before = len(chunks)
            for chunk in document_chunks:
                key = hashlib.sha256(chunk["normalized_text"].encode("utf-8")).hexdigest()
                if key not in chunks:
                    chunk["chunk_id"] = key
                    chunk["duplicate_sources"] = []
                    chunks[key] = chunk
                else:
                    chunks[key]["duplicate_sources"].append({"celex": celex, "source_file": str(path), "source_paragraph_index": chunk["source_paragraph_index"]})
            processed.append({"celex": celex, "source_file": str(path), "source_format": path.suffix.lower().lstrip("."), "extracted_characters": int(diagnostics.get("characters", 0)), "revision_affected_paragraphs": int(diagnostics.get("revision-affected paragraphs", 0)), "chunks_before_deduplication": len(document_chunks), "chunks_after_deduplication": len(chunks) - before, "extraction_method": diagnostics.get("extraction method", "working extraction pipeline")})
        except Exception as exc:
            failures.append({"celex": celex, "source_file": str(path), "error": f"{type(exc).__name__}: {exc}"})
    rows = list(chunks.values())
    for index, chunk in enumerate(rows, 1): chunk["global_chunk_order"] = index
    distribution = Counter("<200" if row["characters"] < 200 else "200-499" if row["characters"] < 500 else "500-999" if row["characters"] < 1000 else "1000+" for row in rows)
    summary = {"source": str(ROOT), "selection": "Sure_Set=true and finalized dry-run status DRY_RUN with accepted_clean_tus > 0", "documents_processed": len(processed), "documents_skipped": len(skipped), "physical_source_document_count": len(processed), "total_extracted_mk2_characters": raw_characters, "total_revision_affected_paragraphs": sum(int(row.get("revision_affected_paragraphs", 0)) for row in processed), "total_chunks": len(rows), "duplicate_chunks_removed": sum(len(row["duplicate_sources"]) for row in rows), "chunk_size_distribution": dict(sorted(distribution.items())), "chunks_by_celex": dict(sorted(Counter(row["celex"] for row in rows).items())), "extraction_failures": failures, "skipped": skipped, "context_corpus_only": True, "tm_units_created": 0}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "summary.json").write_text(json.dumps({"summary": summary, "documents": processed, "skipped": skipped, "failures": failures}, ensure_ascii=False, indent=2), encoding="utf-8")
    fields = ["chunk_id", "celex", "text", "characters", "global_chunk_order", "paragraph_order", "source_paragraph_index", "context", "source_file", "source_format", "extraction_method", "duplicate_sources"]
    with (OUT / "mk2-context-chunks.jsonl").open("w", encoding="utf-8") as handle:
        for row in rows: handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    with (OUT / "mk2-context-chunks.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields); writer.writeheader()
        for row in rows: writer.writerow({field: json.dumps(row[field], ensure_ascii=False) if isinstance(row[field], (dict, list)) else row[field] for field in fields})
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__": main()
