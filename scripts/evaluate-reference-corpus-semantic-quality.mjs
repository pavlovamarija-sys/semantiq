import { mkdir, readFile, writeFile } from "node:fs/promises";
const input = "scripts/output/reference-corpus-semantic-benchmark/benchmark-results.json"; const output = "scripts/output/reference-corpus-semantic-benchmark/quality-evaluation";
const rows = JSON.parse(await readFile(input, "utf8")).slice(0, 50);
const refPattern = /\b(?:Regulation|Directive|Decision|Article|Annex|point|paragraph|OJ|EU|CFSP|EURATOM)\b|\b\d{4}\/\d+\b|\b\d+\(\d+\)|\b\d+\/\d{4}\b/gi;
const tokens = (text) => new Set((String(text ?? "").match(/[A-Za-zА-Яа-яЀ-Џ]{4,}|\d{2,}[A-Za-zА-Яа-яЀ-Џ]*/g) ?? []).map((x) => x.toLocaleLowerCase()));
const refs = (text) => new Set((String(text ?? "").match(refPattern) ?? []).map((x) => x.toLocaleLowerCase()));
const evaluations = [];
for (const query of rows) {
  const queryRefs = refs(query.source_en); const queryTokens = tokens(query.source_en);
  for (let index = 0; index < Math.min(5, query.top_matches.length); index++) {
    const match = query.top_matches[index]; const matchRefs = refs(match.chunk_text); const matchTokens = tokens(match.chunk_text);
    const refOverlap = [...queryRefs].filter((x) => matchRefs.has(x)); const tokenOverlap = [...queryTokens].filter((x) => matchTokens.has(x));
    let classification = "IRRELEVANT", reason = "Different CELEX and no independently verifiable legal-reference or entity overlap.";
    if (query.celex === match.celex) { classification = "RELEVANT"; reason = "Retrieved chunk comes from the same CELEX/document as the query; it is the strongest available document-level context signal."; }
    else if (refOverlap.length || tokenOverlap.length >= 2) { classification = "PARTIAL"; reason = `Different CELEX, but shared legal-reference/entity signals: ${[...new Set([...refOverlap, ...tokenOverlap])].slice(0, 5).join(", ")}. Related context is plausible but equivalence is not established.`; }
    evaluations.push({ query_en: query.source_en, query_celex: query.celex, rank: index + 1, similarity: match.similarity, retrieved_mk: match.chunk_text, celex: match.celex, source_file: match.source_file, classification, reason });
  }
}
const csv = (v) => `"${String(v ?? "").replaceAll('"', '""').replaceAll("\r", " ").replaceAll("\n", " ")}"`;
await mkdir(output, { recursive: true }); await writeFile(`${output}/terminology-quality.csv`, `query_en,query_celex,rank,similarity,retrieved_mk,celex,source_file,classification,reason\n${evaluations.map((r) => [r.query_en,r.query_celex,r.rank,r.similarity,r.retrieved_mk,r.celex,r.source_file,r.classification,r.reason].map(csv).join(",")).join("\n")}\n`); await writeFile(`${output}/terminology-quality.json`, JSON.stringify(evaluations, null, 2));
const at = (rank) => { const subset = evaluations.filter((r) => r.rank <= rank); return { relevant: subset.filter((r) => r.classification === "RELEVANT").length, total: rows.length, precision: Number((subset.filter((r) => r.classification === "RELEVANT").length / (rows.length * rank)).toFixed(4)) }; };
const bands = [{ name: "<0.40", min: -Infinity, max: .4 }, { name: "0.40-0.549", min: .4, max: .55 }, { name: "0.55-0.699", min: .55, max: .7 }, { name: "0.70+", min: .7, max: Infinity }].map((band) => { const subset = evaluations.filter((r) => r.similarity >= band.min && r.similarity < band.max); return { band: band.name, total: subset.length, relevant: subset.filter((r) => r.classification === "RELEVANT").length, partial: subset.filter((r) => r.classification === "PARTIAL").length, irrelevant: subset.filter((r) => r.classification === "IRRELEVANT").length }; });
const summary = { query_count: rows.length, evaluated_results: evaluations.length, precision_at_1: at(1), precision_at_3: at(3), precision_at_5: at(5), counts: { relevant: evaluations.filter((r) => r.classification === "RELEVANT").length, partial: evaluations.filter((r) => r.classification === "PARTIAL").length, irrelevant: evaluations.filter((r) => r.classification === "IRRELEVANT").length }, relevance_by_similarity_band: bands, recommendation: "Use top-k=3 with a conservative minimum similarity around 0.65 only after human/legal validation; same-CELEX relevance is strong document evidence, while cross-document similarity alone is insufficient." , method: "Deterministic adjudication using query/retrieved CELEX identity plus legal-reference/entity overlap; cosine similarity was not used as a classification criterion." }; await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary, null, 2));
