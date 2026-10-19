import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(path.join(process.env.PG_CLIENT_DIR, "node_modules", "pg"));
const kbId = process.env.TM_KNOWLEDGE_BASE_ID ?? "1f4282d9-0468-487e-bf56-685ab1f507b3";
const pooler = new URL((await readFile("supabase/.temp/pooler-url", "utf8")).trim());
const db = new Client({ host: pooler.hostname, port: Number(pooler.port), database: pooler.pathname.slice(1), user: decodeURIComponent(pooler.username), password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  const total = (await db.query(`select count(*)::int as count, count(*) filter (where audit_status='valid')::int as retained, count(*) filter (where audit_status='quarantined')::int as quarantined, count(*) filter (where status='approved')::int as approved, count(*) filter (where provenance ? 'supporting_tm_unit_ids')::int as provenance_preserved from public.terminology_entries where knowledge_base_id=$1 and source_type='corpus_supported'`, [kbId])).rows[0];
  const trusted = (await db.query(`select count(*)::int as count from public.terminology_entries where knowledge_base_id=$1 and source_type='corpus_supported' and audit_status='valid'`, [kbId])).rows[0];
  const tm = (await db.query(`select count(*)::int as count, count(*) filter (where audit_status='valid')::int as valid, count(*) filter (where audit_status='corrupt')::int as corrupt, count(*) filter (where audit_status='uncertain')::int as uncertain from public.approved_translation_memory_units where knowledge_base_id=$1`, [kbId])).rows[0];
  console.log(JSON.stringify({ terminology: total, trusted_retrieval_evidence_rows: Number(trusted.count), tm: tm, quarantined_excluded_from_trusted_query: Number(total.quarantined) > 0 && Number(trusted.count) === Number(total.retained) }, null, 2));
} finally { await db.end(); }
