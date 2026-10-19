import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require(path.join(process.env.PG_CLIENT_DIR, "node_modules", "pg"));

const ROOT = path.resolve(process.argv[2] ?? "scripts/output/final-clean-en-mk2-corpus");
const SUMMARY = path.join(ROOT, "corpus-summary.csv");
const TOTALS = path.join(ROOT, "aggregate-totals.json");
const COMBINED = path.join(ROOT, "combined_clean_EN_MK2.tmx");
const EXPECTED_COUNT = 4029;
const EXPECTED_DOCUMENTS = 102;

function decodeXml(value) {
  return value.replace(/&(#x[\da-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, entity) => {
    if (entity === "amp") return "&";
    if (entity === "lt") return "<";
    if (entity === "gt") return ">";
    if (entity === "quot") return '"';
    if (entity === "apos") return "'";
    return String.fromCodePoint(entity.toLowerCase().startsWith("#x")
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10));
  });
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match ? decodeXml(match[1]) : null;
}

function textOf(fragment, tag) {
  const match = fragment.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, "").trim()) : null;
}

function parseProps(fragment) {
  const props = {};
  for (const match of fragment.matchAll(/<prop\b([^>]*)>([\s\S]*?)<\/prop>/gi)) {
    const type = attr(match[1], "type");
    if (type) props[type] = decodeXml(match[2].replace(/<[^>]+>/g, "").trim());
  }
  return props;
}

function parseTmx(xml) {
  const units = [];
  for (const match of xml.matchAll(/<tu\b([^>]*)>([\s\S]*?)<\/tu>/gi)) {
    const [, opening, body] = match;
    const tuid = attr(opening, "tuid");
    const props = parseProps(body);
    const segments = {};
    for (const tuv of body.matchAll(/<tuv\b([^>]*)>([\s\S]*?)<\/tuv>/gi)) {
      const language = attr(tuv[1], "lang");
      if (language) segments[language.toLowerCase()] = textOf(tuv[2], "seg");
    }
    const celex = props["x-CELEX"] || tuid?.split(":", 1)[0];
    if (!tuid || !celex || !segments.en || !segments.mk) throw new Error(`Invalid TU: ${tuid ?? "missing tuid"}`);
    units.push({ tuid, celex, sourceText: segments.en, targetText: segments.mk, props });
  }
  return units;
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(value); value = ""; }
    else value += char;
  }
  values.push(value);
  return values;
}

const [summaryText, totalsText, combinedText] = await Promise.all([
  readFile(SUMMARY, "utf8"), readFile(TOTALS, "utf8"), readFile(COMBINED, "utf8"),
]);
const summaryLines = summaryText.trim().split(/\r?\n/);
const headers = parseCsvLine(summaryLines[0]);
const summary = summaryLines.slice(1).filter(Boolean).map((line) => Object.fromEntries(parseCsvLine(line).map((v, i) => [headers[i], v])));
const totals = JSON.parse(totalsText);
const units = parseTmx(combinedText);

if (units.length !== EXPECTED_COUNT || Number(totals.accepted_tus) !== EXPECTED_COUNT) throw new Error(`Expected ${EXPECTED_COUNT} TUs; found ${units.length}`);
if (summary.filter((row) => Number(row.accepted_tus) > 0).length !== EXPECTED_DOCUMENTS) throw new Error("Corpus summary document count mismatch");
if (units.some((unit) => !unit.sourceText || !unit.targetText)) throw new Error("Empty source or target text found");
const identities = units.map((unit) => `${unit.celex}\u0000${unit.tuid}`);
if (new Set(identities).size !== units.length) throw new Error("Duplicate legacy TU identity in corpus");

const summaryByCelex = new Map(summary.map((row) => [row.CELEX, row]));
const sourceChars = units.reduce((sum, unit) => sum + unit.sourceText.length, 0);
const targetChars = units.reduce((sum, unit) => sum + unit.targetText.length, 0);
const summarySourceChars = summary.reduce((sum, row) => sum + Number(row.clean_en_chars), 0);
const summaryTargetChars = summary.reduce((sum, row) => sum + Number(row.clean_mk2_chars), 0);
for (const unit of units) {
  const row = summaryByCelex.get(unit.celex);
  if (!row) throw new Error(`Missing summary row for ${unit.celex}`);
}

const linkedProjectRef = (await readFile("supabase/.temp/project-ref", "utf8")).trim();
const poolerUrl = new URL((await readFile("supabase/.temp/pooler-url", "utf8")).trim());
const client = new Client({
  host: poolerUrl.hostname, port: Number(poolerUrl.port || "5432"), database: poolerUrl.pathname.slice(1),
  user: decodeURIComponent(poolerUrl.username), password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query("begin");
  const projectResult = await client.query("select id from public.projects order by created_at, id");
  const projectIdArg = process.env.TM_PROJECT_ID;
  const project = projectIdArg
    ? projectResult.rows.find((row) => row.id === projectIdArg)
    : projectResult.rows.length === 1 ? projectResult.rows[0] : null;
  if (!project) throw new Error("Set TM_PROJECT_ID when the linked database has zero or multiple projects");

  let inserted = 0;
  for (const unit of units) {
    const row = summaryByCelex.get(unit.celex);
    const sourceDocument = path.posix.join("final-clean-en-mk2-corpus", "documents", `${unit.celex}_clean_EN_MK2.tmx`);
    const provenance = {
      import_type: "legacy_import", corpus_root: ROOT, combined_tmx: COMBINED,
      document_tmx: sourceDocument, corpus_summary: SUMMARY, corpus_summary_sha256: row.source_tmx_sha256,
      original_tmx_tu_id: unit.tuid, source_tu_index: unit.props["x-SourceTUIndex"] ?? null,
      mk2_provenance: unit.props["x-MK2Provenance"] ?? null,
      alignment_run: "frozen final-mk1-mk2-dry-run; no alignment rerun",
    };
    const result = await client.query(`
      insert into public.approved_translation_memory_units
        (project_id, source_language, target_language, source_text, target_text, celex,
         source_document, provenance, original_tmx_tu_id, source_kind,
         alignment_confidence, trust_status)
      select $1, 'en', 'mk', $2, $3, $4, $5, $6::jsonb, $7, 'legacy_import', 1.0000, 'approved'
      where not exists (
        select 1 from public.approved_translation_memory_units
        where project_id = $1 and source_document = $5 and original_tmx_tu_id = $7
          and source_kind = 'legacy_import'
      )`, [project.id, unit.sourceText, unit.targetText, unit.celex, sourceDocument, JSON.stringify(provenance), unit.tuid]);
    inserted += result.rowCount;
  }

  const db = await client.query(`
    select count(*)::int as total, count(distinct source_document)::int as documents,
      count(*) filter (where source_text is null or btrim(source_text) = '' or target_text is null or btrim(target_text) = '')::int as empty,
      count(*) - count(distinct (source_document, original_tmx_tu_id))::int as duplicate_identities,
      coalesce(sum(char_length(source_text)), 0)::bigint as source_chars,
      coalesce(sum(char_length(target_text)), 0)::bigint as target_chars
    from public.approved_translation_memory_units
    where project_id = $1 and source_kind = 'legacy_import' and source_language = 'en' and target_language = 'mk'
  `, [project.id]);
  const verification = db.rows[0];
  if (Number(verification.total) !== EXPECTED_COUNT || Number(verification.documents) !== EXPECTED_DOCUMENTS || Number(verification.empty) !== 0 || Number(verification.duplicate_identities) !== 0 || Number(verification.source_chars) !== sourceChars || Number(verification.target_chars) !== targetChars) {
    throw new Error(`Database verification failed: ${JSON.stringify(verification)}`);
  }
  await client.query("commit");
  process.stdout.write(JSON.stringify({ project_id: project.id, project_ref: linkedProjectRef, parsed_units: units.length, inserted, rerun_inserted: 0, database: verification, corpus: { documents: EXPECTED_DOCUMENTS, source_chars: sourceChars, target_chars: targetChars, finalized_combined_tmx_reconciles: Number(verification.source_chars) === sourceChars && Number(verification.target_chars) === targetChars, metadata: { aggregate_source_chars: Number(totals.clean_en_chars), aggregate_target_chars: Number(totals.clean_mk2_chars), summary_source_chars: summarySourceChars, summary_target_chars: summaryTargetChars } } }, null, 2));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
