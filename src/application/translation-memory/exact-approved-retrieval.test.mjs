import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { findExactApprovedTranslationMemory } from "./exact-approved-retrieval.ts";

const KB = "1f4282d9-0468-487e-bf56-685ab1f507b3";
const source = "COUNCIL FRAMEWORK DECISION";
function hash(value) { return createHash("md5").update(value, "utf8").digest("hex"); }
const row = {
  knowledge_base_id: KB,
  source_language: "en",
  target_language: "mk",
  trust_status: "approved",
  source_text: source,
  source_text_hash: hash(source),
  target_text: "МКОВНА ОДЛУКА НА СОВЕТОТ",
  celex: "02002F0465",
  provenance: { original_tmx_tu_id: "02002F0465:6" },
  source_kind: "legacy_import",
  alignment_confidence: "1.0000",
  original_tmx_tu_id: "02002F0465:6",
};

function reader(rows, { inaccessible = false } = {}) {
  const filters = [];
  const builder = {
    select() { return builder; },
    eq(column, value) { filters.push([column, value]); return builder; },
    in(column, values) { filters.push([column, values]); return builder; },
    then(resolve) {
      if (inaccessible) return Promise.resolve(resolve({ data: [], error: null }));
      const data = rows.filter((candidate) => filters.every(([column, value]) =>
        Array.isArray(value) ? value.includes(candidate[column]) : candidate[column] === value));
      return Promise.resolve(resolve({ data, error: null }));
    },
  };
  return { from() { return builder; } };
}

test("known exact match from imported legacy TM", async () => {
  const matches = await findExactApprovedTranslationMemory(reader([row]), {
    knowledgeBaseId: KB, sourceLanguage: "en", targetLanguage: "mk", sourceText: source,
  });
  assert.deepEqual(matches[0], {
    targetText: row.target_text, celex: row.celex, provenance: row.provenance,
    sourceKind: "legacy_import", alignmentConfidence: 1, originalTmxTuId: row.original_tmx_tu_id,
  });
});

test("nonexistent source returns no match", async () => {
  assert.deepEqual(await findExactApprovedTranslationMemory(reader([row]), {
    knowledgeBaseId: KB, sourceLanguage: "en", targetLanguage: "mk", sourceText: "not in the corpus",
  }), []);
});

test("whitespace-only formatting difference matches", async () => {
  assert.equal((await findExactApprovedTranslationMemory(reader([row]), {
    knowledgeBaseId: KB, sourceLanguage: "en", targetLanguage: "mk", sourceText: "  COUNCIL\nFRAMEWORK   DECISION  ",
  })).length, 1);
});

test("wrong language pair returns no match", async () => {
  assert.deepEqual(await findExactApprovedTranslationMemory(reader([row]), {
    knowledgeBaseId: KB, sourceLanguage: "fr", targetLanguage: "mk", sourceText: source,
  }), []);
});

test("inaccessible Knowledge Base returns no data", async () => {
  assert.deepEqual(await findExactApprovedTranslationMemory(reader([row], { inaccessible: true }), {
    knowledgeBaseId: "inaccessible-kb", sourceLanguage: "en", targetLanguage: "mk", sourceText: source,
  }), []);
});
