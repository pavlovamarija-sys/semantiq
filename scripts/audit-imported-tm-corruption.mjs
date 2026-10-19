import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const { Client } = require(path.join(process.env.PG_CLIENT_DIR, "node_modules", "pg"));
const pooler = new URL((await readFile("supabase/.temp/pooler-url", "utf8")).trim());
const db = new Client({ host: pooler.hostname, port: Number(pooler.port), database: pooler.pathname.slice(1), user: decodeURIComponent(pooler.username), password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  const result = await db.query(`select id,celex,source_document,source_text,target_text,original_tmx_tu_id from public.approved_translation_memory_units where knowledge_base_id=$1 and source_kind='legacy_import' and trust_status='approved' order by celex,id`, [process.env.TM_KNOWLEDGE_BASE_ID ?? "1f4282d9-0468-487e-bf56-685ab1f507b3"]);
  const rows = result.rows;
  const startsLower = /^[^.!?\d()]*[а-яѓќљњџѕјчшж]/u;
  const marker = /^.{0,30}(?:▼|►|◄|M\d+)/u;
  const suffixStart = /^[а-яѓќљњџѕјчшж]{2,}[.,;:]/u;
  const categories = {
    starts_with_lowercase_cyrillic: rows.filter((row) => /^[а-яѓќљњџѕјчшж]/u.test(row.target_text)),
    starts_with_short_fragment: rows.filter((row) => suffixStart.test(row.target_text)),
    inline_lower_upper_join: rows.filter((row) => /[а-яѓќљњџѕјчшж][А-ЯЃЌЉЊЏЅЈЧШЖ]/u.test(row.target_text)),
    consolidation_marker: rows.filter((row) => marker.test(row.target_text)),
  };
  const suspicious = [...new Set(Object.values(categories).flat())];
  const exact = rows.filter((row) => ["та помеѓу постапките", "атива.", "рРегулатива", "назадповторен"].some((value) => row.target_text.includes(value)));
  console.log(JSON.stringify({ total: rows.length, categories: Object.fromEntries(Object.entries(categories).map(([name, values]) => [name, { units: values.length, documents: new Set(values.map((row) => row.celex)).size, examples: values.slice(0, 5).map((row) => ({ celex: row.celex, tu: row.original_tmx_tu_id, source: row.source_text.slice(0, 180), target: row.target_text.slice(0, 220) })) }])), heuristic_units: suspicious.length, heuristic_documents: new Set(suspicious.map((row) => row.celex)).size, exact_examples: exact.map((row) => ({ ...row, target_text: row.target_text.slice(0, 700), source_text: row.source_text.slice(0, 700) })) }, null, 2));
} finally { await db.end(); }
