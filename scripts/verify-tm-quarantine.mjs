import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const { Client } = require(path.join(process.env.PG_CLIENT_DIR, "node_modules", "pg"));
const u = new URL((await readFile("supabase/.temp/pooler-url", "utf8")).trim());
const db = new Client({ host: u.hostname, port: Number(u.port), database: u.pathname.slice(1), user: decodeURIComponent(u.username), password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  const result = await db.query(`select count(*)::int as total,count(*) filter (where audit_status='valid')::int as valid,count(*) filter (where audit_status='corrupt')::int as corrupt,count(*) filter (where audit_status='uncertain')::int as uncertain,count(*) filter (where audit_status <> 'valid' and trust_status='approved')::int as quarantined,count(distinct celex) filter (where audit_status <> 'valid')::int as affected_documents,count(*) filter (where audit_status <> 'valid' and audit_evidence ? 'neighboring_tus')::int as evidence_rows from public.approved_translation_memory_units where knowledge_base_id=$1 and source_kind='legacy_import'`, [process.env.TM_KNOWLEDGE_BASE_ID ?? "1f4282d9-0468-487e-bf56-685ab1f507b3"]);
  const known = await db.query(`select original_tmx_tu_id,audit_status,audit_reasons from public.approved_translation_memory_units where knowledge_base_id=$1 and original_tmx_tu_id in ('02003R1560:30','02003R1560:109') order by original_tmx_tu_id`, [process.env.TM_KNOWLEDGE_BASE_ID ?? "1f4282d9-0468-487e-bf56-685ab1f507b3"]);
  const retrieval = await db.query(`select count(*)::int as quarantined_returned from public.approved_translation_memory_units where knowledge_base_id=$1 and source_kind='legacy_import' and trust_status='approved' and audit_status='valid' and original_tmx_tu_id in ('02003R1560:30','02003R1560:109')`, [process.env.TM_KNOWLEDGE_BASE_ID ?? "1f4282d9-0468-487e-bf56-685ab1f507b3"]);
  console.log(JSON.stringify({ ...result.rows[0], known_units: known.rows, retrieval_gate_check: retrieval.rows[0] }, null, 2));
} finally { await db.end(); }
