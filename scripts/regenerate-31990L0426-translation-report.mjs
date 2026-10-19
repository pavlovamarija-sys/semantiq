import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { analyzeTerminologyWithGpt56 } from "../src/application/translation/semantic-terminology-analysis.ts";
import { buildTranslationReport, renderTranslationReportDocx } from "../src/application/translation/translation-report.ts";

const require = createRequire(import.meta.url);
const { Client } = require(path.join(process.env.PG_CLIENT_DIR, "node_modules", "pg"));
const runId = "b807fa2d-ccb2-4e1d-87f9-dc24e1295434";
const pooler = new URL((await readFile("supabase/.temp/pooler-url", "utf8")).trim());
const db = new Client({ host: pooler.hostname, port: Number(pooler.port), database: pooler.pathname.slice(1), user: decodeURIComponent(pooler.username), password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  const run = (await db.query(`select r.started_at,r.completed_at,d.title,d.celex_number,dv.source_filename,dv.characters_without_spaces,p.source_language,p.target_language
    from public.document_translation_runs r join public.document_versions dv on dv.id=r.document_version_id join public.documents d on d.id=dv.document_id join public.projects p on p.id=d.project_id where r.id=$1`, [runId])).rows[0];
  const rows = (await db.query(`select rs.segment_index,ds.id,ds.source_text,tv.id translation_version_id,tv.target_text,tv.model_name,tv.prompt_version
    from public.document_translation_run_segments rs join public.document_segments ds on ds.id=rs.segment_id join public.translation_versions tv on tv.id=rs.translation_version_id where rs.run_id=$1 order by rs.segment_index`, [runId])).rows;
  const usage = (await db.query(`select coalesce(sum((te.metadata->'token_usage'->>'prompt_tokens')::int),0)::int input_tokens,coalesce(sum((te.metadata->'token_usage'->>'completion_tokens')::int),0)::int output_tokens from public.translation_evidence te join public.document_translation_run_segments rs on rs.translation_version_id=te.translation_version_id where rs.run_id=$1 and te.evidence_type='generation_metadata'`, [runId])).rows[0];
  const segments = rows.map((row) => ({ id: row.id, index: row.segment_index, sourceText: row.source_text, targetText: row.target_text, translationVersionId: row.translation_version_id }));
  const analysis = await analyzeTerminologyWithGpt56(segments);
  const report = buildTranslationReport({ document: run.source_filename ?? run.title, celex: run.celex_number, sourceLanguage: run.source_language, targetLanguage: run.target_language, model: rows[0]?.model_name ?? "unknown", promptVersion: rows[0]?.prompt_version ?? "unknown", startedAt: run.started_at.toISOString(), completedAt: run.completed_at.toISOString(), inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, translationPages: Number(run.characters_without_spaces ?? 0) / 1500 }, segments, analysis);
  const outputDir = "scripts/output/translation-reports/31990L0426"; await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "31990L0426_EN_Translation_Terminology_Report.docx"), await renderTranslationReportDocx(report));
  await writeFile(path.join(outputDir, "terminology-analysis.json"), JSON.stringify({ generatedAt: new Date().toISOString(), runId, analysis, verified: { terminology: report.terminology, repeatedPhrases: report.repeatedPhrases, inconsistencies: report.inconsistencies }, qaTotals: report.qaTotals, contentHash: report.contentHash }, null, 2));
  console.log(JSON.stringify({ segments: segments.length, terms: report.terminology.length, repeatedPhrases: report.repeatedPhrases.length, inconsistencies: report.inconsistencies.length, qaTotals: report.qaTotals, analysisUsage: analysis.usage, contentHash: report.contentHash, outputDir }, null, 2));
} finally { await db.end(); }
