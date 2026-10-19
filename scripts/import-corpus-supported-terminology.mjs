import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const { Client } = require(path.join(process.env.PG_CLIENT_DIR, "node_modules", "pg"));
const root = path.resolve("scripts/output/terminology-candidates");
function parseLine(line) { const out = []; let value = ""; let quoted = false; for (let i = 0; i < line.length; i += 1) { const c = line[i]; if (c === '"' && line[i + 1] === '"') { value += '"'; i += 1; } else if (c === '"') quoted = !quoted; else if (c === "," && !quoted) { out.push(value); value = ""; } else value += c; } out.push(value); return out; }
const csv = (await readFile(path.join(root, "stable-terminology-candidates.csv"), "utf8")).trim().split(/\r?\n/);
const headers = parseLine(csv[0]);
const rows = csv.slice(1).filter(Boolean).map((line) => Object.fromEntries(parseLine(line).map((value, index) => [headers[index], value])));
const sourceJson = JSON.parse(await readFile(path.join(root, "terminology-candidates.json"), "utf8"));
const evidenceByTerm = new Map(sourceJson.candidates.map((row) => [row.en_term.normalize("NFC").toLocaleLowerCase("en-US"), row]));
if (rows.length !== 143) throw new Error(`Expected 143 stable candidates, found ${rows.length}`);
const pooler = new URL((await readFile("supabase/.temp/pooler-url", "utf8")).trim());
const db = new Client({ host: pooler.hostname, port: Number(pooler.port), database: pooler.pathname.slice(1), user: decodeURIComponent(pooler.username), password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  const kbId = process.env.TM_KNOWLEDGE_BASE_ID ?? "1f4282d9-0468-487e-bf56-685ab1f507b3";
  const inserted = [];
  await db.query("begin");
  for (const row of rows) {
    const evidence = evidenceByTerm.get(row.en_term.normalize("NFC").toLocaleLowerCase("en-US"));
    if (!evidence) throw new Error(`Missing JSON evidence for ${row.en_term}`);
    const provenance = { evidence_type: "approved_legacy_tm_corpus", source_candidate_file: path.join(root, "stable-terminology-candidates.csv"), frequency: Number(row.total_frequency), document_count: Number(row.document_count), dominance_percent: Number(row.dominance_percent), supporting_celex: evidence.supporting_celex, supporting_tm_unit_ids: evidence.supporting_tm_unit_ids, candidate_classification: "STABLE", approval_note: "Corpus-supported candidate; not officially approved terminology." };
    const result = await db.query(`insert into public.terminology_entries (knowledge_base_id,source_language,target_language,source_term,target_term,source_type,source_reference,status,provenance) select $1,'en','mk',$2,$3,'corpus_supported',$4,'pending',$5::jsonb where not exists (select 1 from public.terminology_entries where knowledge_base_id=$1 and source_language='en' and target_language='mk' and source_term=$2 and target_term=$3 and source_type='corpus_supported')`, [kbId, row.en_term, row.dominant_mk_variant, `legacy-approved-tm:${kbId}`, JSON.stringify(provenance)]);
    inserted.push(result.rowCount);
  }
  const verification = await db.query("select count(*)::int as total,count(*) filter (where source_type='corpus_supported')::int as corpus_supported,count(*) filter (where source_type='corpus_supported' and status='approved')::int as officially_approved,count(*)-count(distinct (knowledge_base_id,source_language,target_language,source_term,target_term))::int as duplicate_rows,count(*) filter (where provenance ? 'supporting_tm_unit_ids')::int as provenance_rows from public.terminology_entries where knowledge_base_id=$1", [kbId]);
  await db.query("commit");
  console.log(JSON.stringify({ knowledge_base_id: kbId, source_rows: rows.length, inserted: inserted.reduce((a, b) => a + b, 0), verification: verification.rows[0] }, null, 2));
} catch (error) { await db.query("rollback"); throw error; } finally { await db.end(); }
