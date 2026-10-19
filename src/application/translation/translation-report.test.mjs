import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { analyzeTerminologyWithGpt56 } from "./semantic-terminology-analysis.ts";
import { buildTranslationReport, renderTranslationReportDocx, verifySemanticCandidates } from "./translation-report.ts";

const metadata = { document: "Test", celex: "32000L0001", sourceLanguage: "en", targetLanguage: "mk", model: "gpt-5.6", promptVersion: "v1", startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:01:00Z", inputTokens: 10, outputTokens: 5, translationPages: 1 };
const segments = [
  { id: "550e8400-e29b-41d4-a716-446655440000", index: 0, translationVersionId: "v1", sourceText: "The competent authority shall issue an animal health certificate.", targetText: "Надлежниот орган издава сертификат за здравствената состојба на животните." },
  { id: "b", index: 1, translationVersionId: "v2", sourceText: "The competent authority shall verify the animal health certificate.", targetText: "Надлежниот орган го проверува сертификатот за здравствената состојба на животните." },
];
const analysis = { model: "gpt-5.6", promptVersion: "translation-report-terminology-v2", candidates: [
  { kind: "term", en: "competent authority", variants: [{ mk: "надлежниот орган", segmentIndexes: [0, 1] }] },
  { kind: "term", en: "competent authority", variants: [{ mk: "орган", segmentIndexes: [0, 1] }] },
  { kind: "repeated_phrase", en: "animal health certificate", variants: [{ mk: "сертификат за здравствената состојба на животните", segmentIndexes: [0] }, { mk: "сертификатот за здравствената состојба на животните", segmentIndexes: [1] }] },
] };

test("verifies complete bilingual phrases against the same cited segment", () => {
  const verified = verifySemanticCandidates(analysis, segments);
  assert.ok(verified.some((item) => item.en === "competent authority" && item.mk.includes("надлежниот орган")));
  assert.ok(!verified.some((item) => item.mk.includes("орган")));
  assert.equal(verified.find((item) => item.en === "animal health certificate")?.frequency, 2);
});

test("rejects repeated phrases without two verified aligned occurrences", () => {
  const result = verifySemanticCandidates({ ...analysis, candidates: [{ kind: "repeated_phrase", en: "animal health certificate", variants: [{ mk: "сертификат за здравствената состојба на животните", segmentIndexes: [0] }] }] }, segments);
  assert.equal(result.length, 0);
});

test("uses GPT-5.6 structured semantic analysis", async () => {
  let requestBody;
  const fetcher = async (_url, init) => { requestBody = JSON.parse(init.body); return new Response(JSON.stringify({ output_text: JSON.stringify({ candidates: analysis.candidates }), usage: { input_tokens: 100, output_tokens: 20 } }), { status: 200 }); };
  const result = await analyzeTerminologyWithGpt56(segments, fetcher, "test-key");
  assert.equal(requestBody.model, "gpt-5.6"); assert.equal(requestBody.text.format.type, "json_schema"); assert.equal(result.usage.inputTokens, 100);
});

test("renders concise tables without visible UUIDs", async () => {
  const report = buildTranslationReport(metadata, segments, analysis); const bytes = await renderTranslationReportDocx(report); const zip = await JSZip.loadAsync(bytes); const xml = await zip.file("word/document.xml").async("string");
  assert.match(xml, /Translation &amp; Terminology Report/); assert.match(xml, /EN term\/phrase/); assert.doesNotMatch(xml, /550e8400-e29b-41d4-a716-446655440000/);
});
