import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { Client } = require(path.join(process.env.PG_CLIENT_DIR, "node_modules", "pg"));
const kbId = process.env.TM_KNOWLEDGE_BASE_ID ?? "1f4282d9-0468-487e-bf56-685ab1f507b3";
const outputRoot = path.resolve("scripts/output/terminology-candidates");
const stopwords = new Set("a an and are as at be been being by can could for from has have in into is it its may more must no not of on or shall should that the their them there these they this to under was were which with without would any all also than then where when while each either such those other only own same some both between during further how if nor once per about after before below above against through over within upon".split(" "));
const structural = /^(article|chapter|section|annex|title|part|paragraph|point|recital|table|footnote|heading|whereas|preamble)$/i;
const legalMarkers = /\b(authorit|commission|member|state|regulation|directive|decision|agreement|procedure|obligation|right|measure|competent|competence|application|provision|requirement|certificate|licen[cs]|establish|implement|notification|information|personal|data|fund|economic|public|operator|market|undertaking|contract|document|authority|resource|shall|pursuant|accordance|conformity)\b/i;

function normalize(value) { return value.normalize("NFC").replace(/\r\n?/g, " ").replace(/\s+/g, " ").trim(); }
function tokens(value) { return normalize(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean); }
function validPhrase(words) {
  if (words.length < 2 || words.length > 5) return false;
  if (words.some((word) => /^\d+$/.test(word) || structural.test(word))) return false;
  if (words.every((word) => stopwords.has(word.toLowerCase()))) return false;
  if (words.filter((word) => !stopwords.has(word.toLowerCase())).length < 2) return false;
  return words.join(" ").length >= 8;
}
function phraseKey(value) { return normalize(value).toLocaleLowerCase("en-US"); }
function add(map, en, mk, unit) {
  if (!validPhrase(en.split(" ")) || !validPhrase(mk.split(" "))) return;
  const key = `${phraseKey(en)}\u0000${phraseKey(mk)}`;
  const current = map.get(key) ?? { enTerm: normalize(en), mkCandidate: normalize(mk), frequency: 0, documents: new Set(), unitIds: [], celex: new Set(), variants: new Set() };
  current.frequency += 1;
  current.documents.add(unit.celex);
  current.celex.add(unit.celex);
  current.unitIds.push(unit.id);
  map.set(key, current);
}

const pooler = new URL((await readFile("supabase/.temp/pooler-url", "utf8")).trim());
const db = new Client({ host: pooler.hostname, port: Number(pooler.port), database: pooler.pathname.slice(1), user: decodeURIComponent(pooler.username), password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  const result = await db.query(`select id, celex, source_text, target_text from public.approved_translation_memory_units where knowledge_base_id=$1 and source_kind='legacy_import' and trust_status='approved' and source_language='en' and target_language='mk' order by celex, id`, [kbId]);
  if (result.rowCount !== 4029) throw new Error(`Expected 4029 approved units, found ${result.rowCount}`);
  const candidates = new Map();
  for (const unit of result.rows) {
    const en = tokens(unit.source_text);
    const mk = tokens(unit.target_text);
    for (let length = 2; length <= 5; length += 1) for (let start = 0; start + length <= en.length; start += 1) {
      const enWords = en.slice(start, start + length);
      const mkStart = Math.floor((start / en.length) * mk.length);
      const mkEnd = Math.max(mkStart + 2, Math.ceil(((start + length) / en.length) * mk.length));
      const mkWords = mk.slice(mkStart, Math.min(mkEnd, mk.length));
      add(candidates, enWords.join(" "), mkWords.join(" "), unit);
    }
  }
  const byEn = new Map();
  for (const candidate of candidates.values()) { const key = phraseKey(candidate.enTerm); if (!byEn.has(key)) byEn.set(key, []); byEn.get(key).push(candidate); }
  const rows = [...candidates.values()].filter((candidate) => candidate.frequency >= 2).map((candidate) => {
    const variants = byEn.get(phraseKey(candidate.enTerm));
    return { en_term: candidate.enTerm, mk_candidate: candidate.mkCandidate, frequency: candidate.frequency, document_count: candidate.documents.size, variant_count: variants.length, has_one_to_many_variants: variants.length > 1, supporting_tm_unit_ids: candidate.unitIds, supporting_celex: [...candidate.celex].sort() };
  }).sort((a, b) => b.document_count - a.document_count || b.frequency - a.frequency || a.en_term.localeCompare(b.en_term) || a.mk_candidate.localeCompare(b.mk_candidate));
  const rowsByEn = new Map();
  for (const row of rows) { const key = phraseKey(row.en_term); if (!rowsByEn.has(key)) rowsByEn.set(key, []); rowsByEn.get(key).push(row); }
  for (const row of rows) row.variant_count = rowsByEn.get(phraseKey(row.en_term)).length, row.has_one_to_many_variants = row.variant_count > 1;
  const summary = { knowledge_base_id: kbId, source_unit_count: result.rowCount, candidate_count: rows.length, recurring_document_thresholds: { gte_2_documents: rows.filter((r) => r.document_count >= 2).length, gte_3_documents: rows.filter((r) => r.document_count >= 3).length, gte_5_documents: rows.filter((r) => r.document_count >= 5).length, gte_10_documents: rows.filter((r) => r.document_count >= 10).length }, variant_conflicts: { candidates_with_one_to_many_mk_variants: rows.filter((r) => r.has_one_to_many_variants).length, distinct_en_terms_with_variants: new Set(rows.filter((r) => r.has_one_to_many_variants).map((r) => r.en_term.toLocaleLowerCase("en-US"))).size }, top_100: rows.slice(0, 100), methodology: "Deterministic 2-5 token EN phrase extraction with proportional token-window MK candidate pairing; stopwords, numeric-only phrases, metadata and structural labels excluded. Candidates are not approved terminology." };
  await mkdir(outputRoot, { recursive: true });
  const columns = ["en_term", "mk_candidate", "frequency", "document_count", "variant_count", "has_one_to_many_variants", "supporting_tm_unit_ids", "supporting_celex"];
  const csv = (value) => { const text = Array.isArray(value) ? value.join("; ") : String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
  await writeFile(path.join(outputRoot, "terminology-candidates.csv"), `${columns.join(",")}\n${rows.map((row) => columns.map((column) => csv(row[column])).join(",")).join("\n")}\n`, "utf8");
  await writeFile(path.join(outputRoot, "terminology-candidates.json"), `${JSON.stringify({ summary, candidates: rows }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...summary, top_100: undefined }, null, 2));
} finally { await db.end(); }
