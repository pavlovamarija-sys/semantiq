import assert from "node:assert/strict";
import test from "node:test";
import { persistGeneratedMk1 } from "./mk1-persistence.ts";
import { translateAndPersistSegmentWithMk1 } from "./mk1-translation-service.ts";

const input = { knowledgeBaseId: "kb", sourceLanguage: "en", targetLanguage: "mk", sourceText: "Article 3 applies." };
const result = {
  mk1: "Член 3 се применува.",
  evidence: { exactApprovedTm: [], strongFuzzyApprovedTm: [], sourceDocumentContext: { previousEn: null, currentEn: input.sourceText, nextEn: null } },
  metadata: { model: "gpt-5.6", promptVersion: "mk1-legal-benchmark-v1", tokens: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, latencyMs: 125 },
  qa: { status: "PASS", findings: [{ status: "PASS", category: "ARTICLE_PARAGRAPH", sourceValue: "Article 3", targetValue: "Член 3", message: "Legal anchor preserved." }] },
};
const emptyReader = { from() { return { select() { return this; }, eq() { return this; }, in() { return this; }, then(resolve) { return Promise.resolve(resolve({ data: [], error: null })); } }; } };
const fuzzyClient = { rpc() { return Promise.resolve({ data: [], error: null }); } };

test("persists an AI draft with generation, TM and QA metadata", async () => {
  let call;
  const saved = await persistGeneratedMk1({ rpc(name, args) { call = { name, args }; return Promise.resolve({ data: [{ translation_id: "t", translation_version_id: "v", generated_at: "2026-10-18T00:00:00Z" }], error: null }); } }, "segment", input, result);
  assert.equal(call.name, "persist_generated_mk1");
  assert.equal(call.args.generated_target_text, result.mk1);
  assert.deepEqual(call.args.generation_token_usage, result.metadata.tokens);
  assert.deepEqual(call.args.qa_result, result.qa);
  assert.deepEqual(saved, { translationId: "t", translationVersionId: "v", generatedAt: "2026-10-18T00:00:00Z" });
});

test("generation failure creates no persistence call", async () => {
  let persistenceCalls = 0;
  await assert.rejects(() => translateAndPersistSegmentWithMk1(
    emptyReader, fuzzyClient,
    { generate() { throw new Error("provider failed"); } },
    { rpc() { persistenceCalls++; return Promise.resolve({ data: [], error: null }); } },
    "segment", input,
  ), /provider failed/);
  assert.equal(persistenceCalls, 0);
});

test("successful generation appends one persisted version", async () => {
  let persistenceCalls = 0;
  const output = await translateAndPersistSegmentWithMk1(
    emptyReader, fuzzyClient,
    { generate() { return Promise.resolve({ mk1: "Член 3 се применува.", tokens: null, latencyMs: 20 }); } },
    { rpc() { persistenceCalls++; return Promise.resolve({ data: [{ translation_id: "t", translation_version_id: "new-version", generated_at: "now" }], error: null }); } },
    "segment", input,
  );
  assert.equal(persistenceCalls, 1);
  assert.equal(output.persistence.translationVersionId, "new-version");
  assert.equal(output.qa.status, "PASS");
});
