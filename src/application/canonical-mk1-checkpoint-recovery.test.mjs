import test from "node:test";
import assert from "node:assert/strict";
import { generateCanonicalMk1, hashText } from "./translation/canonical-mk1.ts";

const unit = (ordinal) => ({ id: `tu-${ordinal}`, ordinal, sourceText: `Source ${ordinal}`, sourceHash: hashText(`Source ${ordinal}`), protectedCodes: [] });
const provider = { async translate(group) { return { responseId: `response-${group[0].ordinal}`, targets: group.map((u) => ({ id: u.id, ordinal: u.ordinal, targetText: `MK ${u.ordinal}` })), usage: { inputTokens: 10, outputTokens: 5 } }; } };

test("interrupted checkpoint recovery skips completed batches", async () => {
  const units = Array.from({ length: 265 }, (_, i) => unit(i));
  const saved = new Map();
  await assert.rejects(() => generateCanonicalMk1(units, provider, "32006L0114", async (checkpoint) => { saved.set(checkpoint.batchOrdinal, checkpoint); if (saved.size === 5) throw Error("synthetic interruption"); }), /synthetic interruption/);
  let calls = 0;
  const resumed = await generateCanonicalMk1(units, { async translate(group, context) { calls++; return provider.translate(group, context); } }, "32006L0114", async (checkpoint) => saved.set(checkpoint.batchOrdinal, checkpoint), saved);
  assert.equal(saved.size, 27);
  assert.equal(calls, 22);
  assert.deepEqual(resumed.targets.map((target) => target.ordinal), Array.from({ length: 265 }, (_, i) => i));
});

test("all 27 completed checkpoints recover without a provider call", async () => {
  const units = Array.from({ length: 265 }, (_, i) => unit(i));
  const saved = new Map();
  const initial = await generateCanonicalMk1(units, provider, "32006L0114", async (checkpoint) => saved.set(checkpoint.batchOrdinal, checkpoint));
  let calls = 0;
  const recovered = await generateCanonicalMk1(units, { async translate() { calls++; throw Error("provider must not be called"); } }, "32006L0114", undefined, saved);
  assert.equal(saved.size, 27);
  assert.equal(calls, 0);
  assert.deepEqual(recovered.targets, initial.targets);
});
