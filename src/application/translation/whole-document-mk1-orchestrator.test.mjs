import assert from "node:assert/strict";
import test from "node:test";
import { orchestrateWholeDocumentMk1 } from "./whole-document-mk1-orchestrator.ts";

function generated(source, target, status = "PASS") { return { result: { mk1: target, evidence: { exactApprovedTm: [], strongFuzzyApprovedTm: [], sourceDocumentContext: { previousEn: null, currentEn: source, nextEn: null } }, metadata: { model: "gpt-5.6", promptVersion: "mk1-legal-benchmark-v1", tokens: null, latencyMs: 1 }, qa: { status, findings: [] } }, translationVersionId: `v-${target}` }; }

test("translates every segment in source order with neighboring context", async () => {
  const calls = [], progress = [];
  const segments = [{ id: "b", index: 1, sourceText: "Article 2" }, { id: "a", index: 0, sourceText: "Article 1" }, { id: "c", index: 2, sourceText: "Article 3" }];
  const output = await orchestrateWholeDocumentMk1({ segments, async translateSegment(segment, context) { calls.push({ id: segment.id, context }); return generated(segment.sourceText, `Член ${segment.index + 1}`); }, async onProgress(value) { progress.push(value); } });
  assert.deepEqual(calls.map((call) => call.id), ["a", "b", "c"]);
  assert.equal(calls[1].context.previousSourceText, "Article 1");
  assert.equal(calls[1].context.nextSourceText, "Article 3");
  assert.equal(output.qa.completeness.translatedSegments, 3);
  assert.equal(progress.at(-1).translatedSegments, 3);
});

test("aggregates segment and whole-document deterministic QA", async () => {
  const segments = [{ id: "a", index: 0, sourceText: "Article 1 applies." }, { id: "b", index: 1, sourceText: "Article 2 applies." }];
  const output = await orchestrateWholeDocumentMk1({ segments, async translateSegment(segment) { return generated(segment.sourceText, segment.id === "a" ? "Член 1 се применува." : "Член 3 се применува.", segment.id === "a" ? "PASS" : "ERROR"); } });
  assert.equal(output.qa.status, "ERROR");
  assert.equal(output.qa.segmentQa.error, 1);
  assert.equal(output.qa.legalAnchors.status, "ERROR");
});

test("fails before generation when there are no translatable segments", async () => {
  let calls = 0;
  await assert.rejects(() => orchestrateWholeDocumentMk1({ segments: [], async translateSegment() { calls++; throw new Error("unexpected"); } }), /no translatable segments/);
  assert.equal(calls, 0);
});
