import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("scripts/output/terminology-candidates");
const input = JSON.parse(await readFile(path.join(root, "terminology-candidates.json"), "utf8"));
const candidates = input.candidates.filter((row) => row.document_count >= 3);
const byEn = new Map();
for (const row of candidates) {
  const key = row.en_term.normalize("NFC").toLocaleLowerCase("en-US");
  if (!byEn.has(key)) byEn.set(key, []);
  byEn.get(key).push(row);
}

function csv(value) {
  const text = Array.isArray(value) ? value.join("; ") : typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const analyses = [];
for (const variants of byEn.values()) {
  variants.sort((a, b) => b.frequency - a.frequency || b.document_count - a.document_count || a.mk_candidate.localeCompare(b.mk_candidate));
  const totalFrequency = variants.reduce((sum, row) => sum + row.frequency, 0);
  const totalDocuments = Math.max(...variants.map((row) => row.document_count));
  const top = variants[0];
  const dominance = top.frequency / totalFrequency;
  let classification;
  if (totalFrequency < 5 || totalDocuments < 4) classification = "LOW_EVIDENCE";
  else if (variants.length === 1) classification = "STABLE";
  else if (dominance >= 0.75) classification = "VARIANT";
  else classification = "CONFLICT";
  analyses.push({
    en_term: top.en_term,
    classification,
    total_frequency: totalFrequency,
    document_count: totalDocuments,
    variant_count: variants.length,
    dominant_mk_variant: top.mk_candidate,
    dominance_percent: Number((dominance * 100).toFixed(2)),
    variants: variants.map((variant) => ({
      mk_variant: variant.mk_candidate,
      frequency: variant.frequency,
      document_count: variant.document_count,
      dominance_percent: Number((variant.frequency / totalFrequency * 100).toFixed(2)),
      supporting_celex: variant.supporting_celex,
      supporting_tm_unit_ids: variant.supporting_tm_unit_ids,
    })),
  });
}
analyses.sort((a, b) => b.document_count - a.document_count || b.total_frequency - a.total_frequency || a.en_term.localeCompare(b.en_term));

const variantRows = analyses.filter((row) => row.classification === "VARIANT");
const stableRows = analyses.filter((row) => row.classification === "STABLE");
const conflictRows = analyses.filter((row) => row.classification === "CONFLICT");
const qualityColumns = ["en_term", "classification", "total_frequency", "document_count", "variant_count", "dominant_mk_variant", "dominance_percent", "variants"];
const variantColumns = ["en_term", "mk_variant", "frequency", "document_count", "dominance_percent", "supporting_celex", "supporting_tm_unit_ids"];
const qualityCsv = `${qualityColumns.join(",")}\n${analyses.map((row) => qualityColumns.map((key) => csv(row[key])).join(",")).join("\n")}\n`;
const flatten = (rows) => rows.flatMap((row) => row.variants.map((variant) => ({ en_term: row.en_term, ...variant })));
const variantCsv = `${variantColumns.join(",")}\n${flatten(variantRows).map((row) => variantColumns.map((key) => csv(row[key])).join(",")).join("\n")}\n`;
const stableCsv = `${qualityColumns.join(",")}\n${stableRows.map((row) => qualityColumns.map((key) => csv(row[key])).join(",")).join("\n")}\n`;
const conflictCsv = `${variantColumns.join(",")}\n${flatten(conflictRows).map((row) => variantColumns.map((key) => csv(row[key])).join(",")).join("\n")}\n`;

const summary = {
  source: "terminology-candidates.json (existing output; extraction not rerun)",
  input_candidate_count: input.summary.candidate_count,
  analyzed_distinct_en_terms: analyses.length,
  classification_counts: { STABLE: stableRows.length, VARIANT: variantRows.length, CONFLICT: conflictRows.length, LOW_EVIDENCE: analyses.filter((row) => row.classification === "LOW_EVIDENCE").length },
  rules: {
    scope: "distinct EN terms occurring in at least 3 documents",
    stable: "one MK variant with at least 4 supporting documents and 5 total occurrences",
    variant: "multiple MK variants with dominant variant frequency at least 75%",
    conflict: "multiple MK variants with dominant variant frequency below 75%",
    low_evidence: "fewer than 5 total occurrences or fewer than 4 supporting documents",
  },
  top_30_stable: stableRows.slice(0, 30),
  top_30_conflict: conflictRows.slice(0, 30),
};
await mkdir(root, { recursive: true });
await writeFile(path.join(root, "terminology-quality-analysis.csv"), qualityCsv, "utf8");
await writeFile(path.join(root, "stable-terminology-candidates.csv"), stableCsv, "utf8");
await writeFile(path.join(root, "terminology-conflicts.csv"), conflictCsv, "utf8");
await writeFile(path.join(root, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...summary, top_30_stable: undefined, top_30_conflict: undefined }, null, 2));
