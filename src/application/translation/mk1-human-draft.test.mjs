import assert from "node:assert/strict";
import test from "node:test";
import { appendHumanEditedDraft } from "./mk1-human-draft.ts";

const input = { segmentId: "segment", targetLanguage: "mk", sourceText: "Article 4 applies in Ireland.", targetText: "Член 4 се применува во Ирска." };

test("appends a human draft with deterministic QA", async () => {
  let call;
  const saved = await appendHumanEditedDraft({ rpc(name, args) { call = { name, args }; return Promise.resolve({ data: [{ translation_id: "translation", translation_version_id: "human-v2", saved_at: "now" }], error: null }); } }, input);
  assert.equal(call.name, "persist_human_translation_draft");
  assert.equal(call.args.edited_target_text, input.targetText);
  assert.equal(call.args.qa_result.status, "PASS");
  assert.equal(saved.translationVersionId, "human-v2");
});

test("changed anchors are saved as advisory QA, not blocked", async () => {
  let calls = 0;
  const saved = await appendHumanEditedDraft({ rpc() { calls++; return Promise.resolve({ data: [{ translation_id: "translation", translation_version_id: "human-v3", saved_at: "now" }], error: null }); } }, { ...input, targetText: "Член 5 се применува во Данска." });
  assert.equal(calls, 1);
  assert.equal(saved.qa.status, "ERROR");
});

test("empty edits never call persistence", async () => {
  let calls = 0;
  await assert.rejects(() => appendHumanEditedDraft({ rpc() { calls++; return Promise.resolve({ data: [], error: null }); } }, { ...input, targetText: "  " }), /required/);
  assert.equal(calls, 0);
});
