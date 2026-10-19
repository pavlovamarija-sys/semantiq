import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(path.join(process.env.PG_CLIENT_DIR, "node_modules", "pg"));

const kbId = process.env.TM_KNOWLEDGE_BASE_ID ?? "1f4282d9-0468-487e-bf56-685ab1f507b3";
const root = path.resolve("scripts/output/final-clean-en-mk2-corpus/documents");
const cache = new Map();
function xmlText(value) { return value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
async function sourceTu(sourceDocument, tuId) {
  if (!cache.has(sourceDocument)) {
    const file = path.join(root, path.basename(sourceDocument));
    const xml = await readFile(file, "utf8");
    const tus = [...xml.matchAll(/<tu\b[^>]*>.*?<\/tu>/gs)].map((match) => match[0]);
    cache.set(sourceDocument, tus.map((tu, index) => {
      const values = {};
      for (const tuv of tu.matchAll(/<tuv\b[^>]*xml:lang=["']([^"']+)["'][^>]*>.*?<seg\b[^>]*>(.*?)<\/seg>/gs)) values[tuv[1].slice(0, 2).toLowerCase()] = xmlText(tuv[2]);
      const id = tu.match(/\btuid=["']([^"']+)["']/)?.[1] ?? null;
      return { index, id, ...values };
    }));
  }
  const tus = cache.get(sourceDocument);
  const index = tus.findIndex((tu) => tu.id === tuId);
  return { current: index >= 0 ? tus[index] : null, previous: index > 0 ? tus[index - 1] : null, next: index >= 0 ? tus[index + 1] ?? null : null };
}

const db = new Client({ host: new URL((await readFile("supabase/.temp/pooler-url", "utf8")).trim()).hostname, port: Number(new URL((await readFile("supabase/.temp/pooler-url", "utf8")).trim()).port), database: new URL((await readFile("supabase/.temp/pooler-url", "utf8")).trim()).pathname.slice(1), user: decodeURIComponent(new URL((await readFile("supabase/.temp/pooler-url", "utf8")).trim()).username), password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  const result = await db.query(`select id,celex,source_document,source_text,target_text,original_tmx_tu_id from public.approved_translation_memory_units where knowledge_base_id=$1 and source_kind='legacy_import' and trust_status='approved'`, [kbId]);
  const rows = result.rows;
  const suffix = /^[а-яѓќљњџѕјчшж]{2,}[.,;:]/u;
  const strongSuffix = /^[а-яѓќљњџѕјчшж]{2,12}[.,;:]\s*(?:[▼►◄]|[0-9]|[А-ЯЃЌЉЊЏЅЈЧШЖ])/u;
  const joined = /[а-яѓќљњџѕјчшж][А-ЯЃЌЉЊЏЅЈЧШЖ]/u;
  const marker = /[▼►◄].{0,4}(?:[0-9А-ЯЃЌЉЊЏЅЈЧШЖ])/u;
  const counts = { valid: 0, corrupt: 0, uncertain: 0 };
  const affectedDocuments = new Set();
  const updates = [];
  await db.query("begin");
  for (const row of rows) {
    const reasons = [];
    if (["02003R1560:30", "02003R1560:109"].includes(row.original_tmx_tu_id)) reasons.push("known_reported_corrupted_legacy_tu");
    if (joined.test(row.target_text)) reasons.push("joined_lower_upper_word_or_revision_artifact");
    if (strongSuffix.test(row.target_text)) reasons.push("truncated_or_stray_suffix_at_mk_beginning");
    else if (suffix.test(row.target_text)) reasons.push("possible_truncated_or_stray_suffix_at_mk_beginning");
    if (marker.test(row.target_text)) reasons.push("consolidation_marker_mixed_with_translation");
    const context = await sourceTu(row.source_document, row.original_tmx_tu_id);
    const status = reasons.length ? (reasons.includes("possible_truncated_or_stray_suffix_at_mk_beginning") && reasons.length === 1 ? "uncertain" : "corrupt") : "valid";
    counts[status]++;
    if (status !== "valid") affectedDocuments.add(row.celex);
    const evidence = { original_tmx_tu_id: row.original_tmx_tu_id, source_document: row.source_document, source_text: row.source_text, target_text: row.target_text, neighboring_tus: { previous: context.previous ? { id: context.previous.id, en: context.previous.en ?? null, mk: context.previous.mk ?? null } : null, current: context.current ? { id: context.current.id, en: context.current.en ?? null, mk: context.current.mk ?? null } : null, next: context.next ? { id: context.next.id, en: context.next.en ?? null, mk: context.next.mk ?? null } : null } };
    updates.push({ id: row.id, status, reasons, evidence });
  }
  for (let start = 0; start < updates.length; start += 250) {
    await db.query(`update public.approved_translation_memory_units tm set audit_status=x.status,audit_reasons=x.reasons,audit_evidence=x.evidence,audited_at=now() from jsonb_to_recordset($1::jsonb) as x(id uuid,status text,reasons jsonb,evidence jsonb) where tm.id=x.id`, [JSON.stringify(updates.slice(start, start + 250).map((update) => ({ id: update.id, status: update.status, reasons: update.reasons, evidence: update.evidence })))]);
  }
  await db.query("commit");
  console.log(JSON.stringify({ knowledge_base_id: kbId, audited: rows.length, ...counts, affected_documents: affectedDocuments.size }, null, 2));
} catch (error) { await db.query("rollback"); throw error; } finally { await db.end(); }
