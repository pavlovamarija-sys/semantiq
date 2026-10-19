import assert from "node:assert/strict";
import test from "node:test";
import { translateSegmentWithMk1 } from "./mk1-translation-service.ts";

const input = { knowledgeBaseId: "kb", sourceLanguage: "en", targetLanguage: "mk", sourceText: "  The authority shall notify the Commission.  ", previousSourceText: "Previous sentence.", nextSourceText: "Next sentence." };
const exact = [{ source_text: "The authority shall notify the Commission.", target_text: "Органот ја известува Комисијата.", celex: "C", provenance: { file: "x.tmx" }, source_kind: "legacy_import", alignment_confidence: 1, original_tmx_tu_id: "C:1" }];
const fuzzy = [{ sourceText: "The authority shall notify the Council.", targetText: "Органот го известува Советот.", celex: "F", provenance: { file: "f.tmx" }, sourceKind: "legacy_import", alignmentConfidence: 0.98, originalTmxTuId: "F:2", similarity: 0.82 }];
function exactReader() { return { from() { return { select() { return this; }, eq() { return this; }, in() { return this; }, then(resolve) { return Promise.resolve(resolve({ data: exact, error: null })); } }; } }; }
function emptyReader() { return { from() { return { select() { return this; }, eq() { return this; }, in() { return this; }, then(resolve) { return Promise.resolve(resolve({ data: [], error: null })); } }; } }; }
const rpc = { rpc() { return Promise.resolve({ data: fuzzy, error: null }); } };
function provider(captured) { return { async generate(args) { captured.push(args); return { mk1: "Превод", tokens: { total_tokens: 3 }, latencyMs: 12 }; } }; }

test("uses exact dual-valid TM and does not call fuzzy retrieval", async () => {
  const calls = [], result = await translateSegmentWithMk1(exactReader(), { rpc() { throw new Error("fuzzy must not run"); } }, provider(calls), input);
  assert.equal(result.mk1, "Превод");
  assert.equal(result.evidence.exactApprovedTm.length, 1);
  assert.deepEqual(result.evidence.strongFuzzyApprovedTm, []);
  assert.equal(result.qa.status, "PASS");
  assert.equal(calls[0].evidence.sourceDocumentContext.currentEn, "The authority shall notify the Commission.");
});

test("falls back to fuzzy TM only when exact has no match", async () => {
  const calls = [], result = await translateSegmentWithMk1(emptyReader(), rpc, provider(calls), input);
  assert.deepEqual(result.evidence.exactApprovedTm, []);
  assert.equal(result.evidence.strongFuzzyApprovedTm[0].similarity, 0.82);
  assert.equal(calls.length, 1);
});

test("does not expose hidden targets or unsupported evidence", async () => {
  const calls = [];
  await translateSegmentWithMk1(emptyReader(), rpc, provider(calls), input);
  const serialized = JSON.stringify(calls[0]);
  assert.equal(serialized.includes("professional_mk2"), false);
  assert.equal(serialized.includes("terminology"), false);
  assert.equal(serialized.includes("Reference Corpus"), false);
});

test("rejects an empty source segment", async () => {
  await assert.rejects(() => translateSegmentWithMk1(emptyReader(), rpc, provider([]), { ...input, sourceText: "   " }), /non-empty source/);
});
