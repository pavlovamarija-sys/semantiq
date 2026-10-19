import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(path.join(process.env.PG_CLIENT_DIR, "node_modules", "pg"));

const kbId = process.env.TM_KNOWLEDGE_BASE_ID ?? "1f4282d9-0468-487e-bf56-685ab1f507b3";
const pooler = new URL((await readFile("supabase/.temp/pooler-url", "utf8")).trim());
const db = new Client({ host: pooler.hostname, port: Number(pooler.port), database: pooler.pathname.slice(1), user: decodeURIComponent(pooler.username), password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
const normal = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("mk");
const provenance = (row) => row.provenance && typeof row.provenance === "object" ? row.provenance : {};

await db.connect();
try {
  const terms = (await db.query(`select id, source_term, target_term, provenance, audit_status from public.terminology_entries where knowledge_base_id=$1 and source_type='corpus_supported' order by source_term, id`, [kbId])).rows;
  const ids = [...new Set(terms.flatMap((row) => Array.isArray(provenance(row).supporting_tm_unit_ids) ? provenance(row).supporting_tm_unit_ids : []))];
  const tm = ids.length ? (await db.query(`select id, audit_status, celex, target_text from public.approved_translation_memory_units where knowledge_base_id=$1 and id=any($2::uuid[])`, [kbId, ids])).rows : [];
  const byId = new Map(tm.map((row) => [row.id, row]));
  const reasonCounts = new Map();
  const updates = [];
  const totals = { retained: 0, quarantined: 0, missing_support: 0, valid: 0, corrupt: 0, uncertain: 0, conflicting_valid: 0 };
  for (const term of terms) {
    const supportIds = Array.isArray(provenance(term).supporting_tm_unit_ids) ? provenance(term).supporting_tm_unit_ids : [];
    const supports = supportIds.map((id) => byId.get(id)).filter(Boolean);
    const counts = { valid: 0, corrupt: 0, uncertain: 0, missing: supportIds.length - supports.length };
    const validRows = [];
    for (const row of supports) {
      const status = row.audit_status ?? "valid";
      if (status === "corrupt") counts.corrupt++;
      else if (status === "uncertain") counts.uncertain++;
      else { counts.valid++; validRows.push(row); }
    }
    const variants = new Map();
    for (const row of validRows) { const key = normal(row.target_text); variants.set(key, (variants.get(key) ?? 0) + 1); }
    const ranked = [...variants.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const validFrequency = validRows.length;
    const validDocuments = new Set(validRows.map((row) => row.celex).filter(Boolean)).size;
    const dominance = validFrequency && ranked.length ? (ranked[0][1] / validFrequency) * 100 : 0;
    const reasons = [];
    if (!supportIds.length) reasons.push("no_supporting_tm_unit_ids");
    if (!validFrequency) reasons.push("no_valid_supporting_tm_units");
    if (validFrequency < 2) reasons.push("insufficient_valid_frequency");
    if (validDocuments < 2) reasons.push("insufficient_valid_document_coverage");
    if (ranked.length > 1) { totals.conflicting_valid++; reasons.push("valid_evidence_has_target_variants"); if (dominance < 70) reasons.push("conflicting_valid_evidence"); }
    if (counts.corrupt || counts.uncertain || counts.missing) reasons.push("some_original_supporting_units_quarantined_or_missing");
    const quarantine = reasons.includes("no_valid_supporting_tm_units") || reasons.includes("insufficient_valid_frequency") || reasons.includes("insufficient_valid_document_coverage") || reasons.includes("conflicting_valid_evidence");
    const classification = quarantine ? "quarantined" : "retained";
    totals[classification]++;
    totals.valid += counts.valid; totals.corrupt += counts.corrupt; totals.uncertain += counts.uncertain;
    if (!supportIds.length) totals.missing_support++;
    for (const reason of reasons) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    updates.push({ id: term.id, status: quarantine ? "quarantined" : "valid", reasons, evidence: { audit_method: "supporting_tm_units_after_tm_quarantine", supporting_unit_counts: counts, valid_frequency: validFrequency, valid_document_count: validDocuments, valid_dominance_percent: Number(dominance.toFixed(6)), valid_target_variants: ranked.map(([target, count]) => ({ target, count, dominance_percent: Number((count / (validFrequency || 1) * 100).toFixed(6)) })), original_candidate_classification: provenance(term).classification ?? null } });
  }
  await db.query("begin");
  for (let i = 0; i < updates.length; i += 250) await db.query(`update public.terminology_entries t set audit_status=x.status,audit_reasons=x.reasons,audit_evidence=x.evidence,audited_at=now() from jsonb_to_recordset($1::jsonb) as x(id uuid,status text,reasons jsonb,evidence jsonb) where t.id=x.id`, [JSON.stringify(updates.slice(i, i + 250))]);
  await db.query("commit");
  console.log(JSON.stringify({ knowledge_base_id: kbId, terminology_entries: terms.length, supporting_tm_ids: ids.length, ...totals, reason_counts: Object.fromEntries(reasonCounts) }, null, 2));
} catch (error) { await db.query("rollback"); throw error; } finally { await db.end(); }
