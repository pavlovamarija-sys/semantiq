import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import path from "node:path";

const require = createRequire(import.meta.url);
const { Client } = require(path.join(process.env.PG_CLIENT_DIR, "node_modules", "pg"));
const corpusRoot = path.resolve(process.argv[2] ?? "D:/Преводи/EU_Acquis_Corpus/Documents");
const outputRoot = path.resolve("scripts/output/tm-retrieval-benchmark");
const kbId = process.env.TM_KNOWLEDGE_BASE_ID ?? "1f4282d9-0468-487e-bf56-685ab1f507b3";
const minimumSimilarity = 0.70;

function normalize(value) { return value.normalize("NFC").replace(/\r\n?/g, "\n").replace(/\s+/g, " ").trim(); }
function md5(value) { return createHash("md5").update(value, "utf8").digest("hex"); }
function xml(value) { return value.replace(/&(#x[\da-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e) => e === "amp" ? "&" : e === "lt" ? "<" : e === "gt" ? ">" : e === "quot" ? '"' : e === "apos" ? "'" : String.fromCodePoint(e.toLowerCase().startsWith("#x") ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))); }
function attr(value, name) { const m = value.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i")); return m ? xml(m[1]) : null; }
function seg(value) { const m = value.match(/<seg\b[^>]*>([\s\S]*?)<\/seg>/i); return m ? xml(m[1].replace(/<[^>]+>/g, "").trim()) : null; }
function parseTmx(text, celex) {
  const records = [];
  for (const match of text.matchAll(/<tu\b([^>]*)>([\s\S]*?)<\/tu>/gi)) {
    const tuid = attr(match[1], "tuid") ?? `${celex}:${records.length}`;
    const body = match[2];
    let source = null;
    for (const tuv of body.matchAll(/<tuv\b([^>]*)>([\s\S]*?)<\/tuv>/gi)) if ((attr(tuv[1], "lang") ?? "").toLowerCase().startsWith("en")) source = seg(tuv[2]);
    if (source) records.push({ celex, tuid, sourceText: source });
  }
  return records;
}
function meaningful(value) {
  const text = normalize(value);
  return text.length >= 80 && text.length <= 900 && /[.!?;:]$/.test(text) && !/^(article|chapter|section|annex|part|title|whereas)\b/i.test(text) && /\b(the|shall|may|must|this|that|which|member|commission|authority|regulation|directive)\b/i.test(text);
}
function csv(value) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }

const pooler = new URL((await readFile("supabase/.temp/pooler-url", "utf8")).trim());
const db = new Client({ host: pooler.hostname, port: Number(pooler.port), database: pooler.pathname.slice(1), user: decodeURIComponent(pooler.username), password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  const imported = new Set((await db.query("select distinct celex from public.approved_translation_memory_units where knowledge_base_id=$1 and source_kind='legacy_import'", [kbId])).rows.map((row) => row.celex));
  const candidates = [];
  const documents = (await (await import("node:fs/promises")).readdir(corpusRoot, { withFileTypes: true }));
  for (const document of documents.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    if (imported.has(document.name)) continue;
    const files = [];
    async function collect(directory) { for (const entry of await (await import("node:fs/promises")).readdir(directory, { withFileTypes: true })) { const full = path.join(directory, entry.name); if (entry.isDirectory()) await collect(full); else if (entry.name.toLowerCase().endsWith(".tmx")) files.push(full); } }
    await collect(path.join(corpusRoot, document.name));
    for (const file of files.sort()) for (const record of parseTmx(await readFile(file, "utf8"), document.name)) if (meaningful(record.sourceText)) candidates.push({ ...record, sourceFile: file });
  }
  const unique = new Map();
  for (const candidate of candidates) unique.set(`${candidate.celex}\u0000${normalize(candidate.sourceText)}`, candidate);
  const grouped = new Map();
  for (const candidate of [...unique.values()].sort((a, b) => `${a.celex}:${a.tuid}`.localeCompare(`${b.celex}:${b.tuid}`))) {
    if (!grouped.has(candidate.celex)) grouped.set(candidate.celex, []);
    grouped.get(candidate.celex).push(candidate);
  }
  const queries = [];
  const groups = [...grouped.values()];
  for (let index = 0; queries.length < 100 && groups.some((group) => group.length > 0); index += 1) {
    for (const group of groups) if (group.length > 0 && queries.length < 100) queries.push(group.shift());
  }
  if (queries.length !== 100) throw new Error(`Only found ${queries.length} eligible unseen segments`);
  const results = [];
  for (const query of queries) {
    const normalized = normalize(query.sourceText);
    const hashes = [...new Set([md5(query.sourceText), md5(normalized)])];
    const start = performance.now();
    const exact = await db.query(`select source_text,target_text,celex,provenance,source_kind,alignment_confidence,original_tmx_tu_id from public.approved_translation_memory_units where knowledge_base_id=$1 and source_language='en' and target_language='mk' and source_kind='legacy_import' and trust_status='approved' and source_text_hash = any($2::text[]) and btrim(regexp_replace(source_text,'[[:space:]]+',' ','g')) = btrim(regexp_replace($3,'[[:space:]]+',' ','g')) limit 1`, [kbId, hashes, normalized]);
    let match = exact.rows[0] ? { type: "exact", similarity: 1, ...exact.rows[0] } : null;
    if (!match) {
      const fuzzy = await db.query("select * from public.search_approved_legacy_tm_fuzzy($1,'en','mk',$2,$3,5)", [kbId, normalized, minimumSimilarity]);
      if (fuzzy.rows[0]) match = { type: "fuzzy", ...fuzzy.rows[0] };
    }
    results.push({ query_celex: query.celex, query_tuid: query.tuid, query_source_file: query.sourceFile, query_en: query.sourceText, match_type: match?.type ?? "none", matched_en: match?.source_text ?? "", matched_mk2: match?.target_text ?? "", matched_celex: match?.celex ?? "", provenance: match?.provenance ?? null, confidence: match?.alignment_confidence ?? null, tmx_tu_id: match?.original_tmx_tu_id ?? "", similarity: match ? Number(match.similarity) : null, query_time_ms: Number((performance.now() - start).toFixed(2)) });
  }
  await mkdir(outputRoot, { recursive: true });
  const header = ["query_celex","query_tuid","query_source_file","query_en","match_type","matched_en","matched_mk2","matched_celex","provenance","confidence","tmx_tu_id","similarity","query_time_ms"];
  await writeFile(path.join(outputRoot, "benchmark-results.csv"), `${header.join(",")}\n${results.map((row) => header.map((key) => csv(typeof row[key] === "object" ? JSON.stringify(row[key]) : row[key])).join(",")).join("\n")}\n`, "utf8");
  await writeFile(path.join(outputRoot, "benchmark-evaluation-set.csv"), `celex,tuid,source_file,source_en\n${queries.map((q) => [q.celex,q.tuid,q.sourceFile,q.sourceText].map(csv).join(",")).join("\n")}\n`, "utf8");
  const matched = results.filter((row) => row.match_type !== "none");
  const summary = { query_count: results.length, unseen_documents: new Set(queries.map((q) => q.celex)).size, exact_match_count: results.filter((r) => r.match_type === "exact").length, fuzzy_match_count: results.filter((r) => r.match_type === "fuzzy").length, no_match_count: results.filter((r) => r.match_type === "none").length, similarity_distribution: { gte_0_95: matched.filter((r) => r.similarity >= .95).length, range_0_90_0_949: matched.filter((r) => r.similarity >= .90 && r.similarity < .95).length, range_0_80_0_899: matched.filter((r) => r.similarity >= .80 && r.similarity < .90).length, range_0_70_0_799: matched.filter((r) => r.similarity >= .70 && r.similarity < .80).length }, average_query_time_ms: Number((results.reduce((sum, r) => sum + r.query_time_ms, 0) / results.length).toFixed(2)), top_20_fuzzy: results.filter((r) => r.match_type === "fuzzy").sort((a, b) => b.similarity - a.similarity).slice(0, 20), borderline_around_0_70: results.filter((r) => r.match_type === "fuzzy").sort((a, b) => Math.abs(a.similarity - .70) - Math.abs(b.similarity - .70)).slice(0, 10), evaluation_set: "deterministic lexical filters, CELEX/TU ID ordering, source documents excluded from imported Knowledge Base CELEX set", knowledge_base_id: kbId, threshold: minimumSimilarity };
  await writeFile(path.join(outputRoot, "benchmark-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
} finally { await db.end(); }
