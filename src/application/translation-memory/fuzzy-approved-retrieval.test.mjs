import assert from "node:assert/strict";
import test from "node:test";
import { findFuzzyApprovedTranslationMemory } from "./fuzzy-approved-retrieval.ts";

const base = { knowledgeBaseId: "kb", sourceLanguage: "en", targetLanguage: "mk" };
const rows = [
  { source_text: "The competent authority shall notify the Commission within 30 days.", target_text: "A", celex: "A", provenance: {}, source_kind: "legacy_import", alignment_confidence: 1, original_tmx_tu_id: "A", similarity: 0.96 },
  { source_text: "The competent authority shall notify the Commission within 60 days.", target_text: "B", celex: "B", provenance: {}, source_kind: "legacy_import", alignment_confidence: 1, original_tmx_tu_id: "B", similarity: 0.88 },
  { source_text: "The authority may inform the Commission within thirty days.", target_text: "C", celex: "C", provenance: {}, source_kind: "legacy_import", alignment_confidence: 1, original_tmx_tu_id: "C", similarity: 0.74 },
];

function client(data = rows) {
  return { rpc(name, args) {
    assert.equal(name, "search_approved_legacy_tm_fuzzy");
    assert.equal(args.result_limit, 5);
    return Promise.resolve({ data: data.filter((row) => row.similarity >= args.minimum_similarity), error: null });
  } };
}

test("near-identical legal clause returns approved fuzzy matches", async () => {
  const result = await findFuzzyApprovedTranslationMemory(client(), { ...base, sourceText: "The competent authority shall notify the Commission within 30 days." });
  assert.equal(result[0].similarity, 0.96);
  assert.equal(result[0].targetText, "A");
});

test("changed number/date remains lexical and thresholded", async () => {
  const result = await findFuzzyApprovedTranslationMemory(client(rows.slice(1)), { ...base, sourceText: "The competent authority shall notify the Commission within 90 days.", minimumSimilarity: 0.8 });
  assert.deepEqual(result.map((match) => match.targetText), ["B"]);
});

test("moderately similar clause is returned at the default threshold", async () => {
  assert.equal((await findFuzzyApprovedTranslationMemory(client([rows[2]]), { ...base, sourceText: rows[2].source_text })).length, 1);
});

test("unrelated text is rejected by the database threshold", async () => {
  assert.deepEqual(await findFuzzyApprovedTranslationMemory(client([]), { ...base, sourceText: "Bananas are harvested in autumn." }), []);
});

test("results are ranked and capped at five", async () => {
  const result = await findFuzzyApprovedTranslationMemory(client(rows), { ...base, sourceText: rows[0].source_text });
  assert.deepEqual(result.map((match) => match.similarity), [0.96, 0.88, 0.74]);
});

test("wrong language pair is passed as a strict filter", async () => {
  const result = await findFuzzyApprovedTranslationMemory(client([]), { ...base, sourceLanguage: "fr", sourceText: rows[0].source_text });
  assert.deepEqual(result, []);
});

test("inaccessible Knowledge Base returns no data", async () => {
  assert.deepEqual(await findFuzzyApprovedTranslationMemory(client([]), { ...base, knowledgeBaseId: "inaccessible", sourceText: rows[0].source_text }), []);
});
