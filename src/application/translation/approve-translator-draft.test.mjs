import assert from "node:assert/strict";
import test from "node:test";
import { approveTranslatorDraft } from "./approve-translator-draft.ts";

test("approves one explicit translation version through the atomic RPC", async () => {
  let call;
  const result = await approveTranslatorDraft({ rpc(name, args) { call = { name, args }; return Promise.resolve({ data: [{ translation_id: "translation", translation_version_id: "human-v2", approved_tm_unit_id: "tm", approved_at: "2026-10-18T12:00:00Z" }], error: null }); } }, "human-v2");
  assert.deepEqual(call, { name: "approve_translator_draft", args: { requested_translation_version_id: "human-v2" } });
  assert.equal(result.approvedTmUnitId, "tm");
});

test("requires an explicit version without calling persistence", async () => {
  let calls = 0;
  await assert.rejects(() => approveTranslatorDraft({ rpc() { calls++; return Promise.resolve({ data: [], error: null }); } }, ""), /explicit/);
  assert.equal(calls, 0);
});

test("surfaces database approval gates", async () => {
  await assert.rejects(() => approveTranslatorDraft({ rpc() { return Promise.resolve({ data: null, error: { message: "Only an explicit translator_draft version may be approved" } }); } }, "ai-v1"), /translator_draft/);
});
