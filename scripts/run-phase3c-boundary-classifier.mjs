import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error("OPENAI_API_KEY is required.");
const model = process.env.OPENAI_PHASE3C_MODEL ?? "gpt-5.6";
const path = "artifacts/pdf-phase3c/ambiguity-evaluation-set.json";
const evaluation = JSON.parse(await readFile(path, "utf8"));
const schema = {
  type: "object", additionalProperties: false,
  properties: {
    decision: { type: "string", enum: ["MERGE", "KEEP_BOUNDARY", "ABSTAIN"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason_codes: { type: "array", items: { type: "string" } },
    explanation: { type: "string" },
  },
  required: ["decision", "confidence", "reason_codes", "explanation"],
};
const system = `Classify exactly one existing PDF text boundary. Decide only MERGE, KEEP_BOUNDARY, or ABSTAIN.
MERGE means the exact left and right fragments belong to one logical paragraph. KEEP_BOUNDARY means they are separate structures. ABSTAIN when evidence is insufficient.
Never rewrite, correct, translate, add, remove, or reorder text. Prefer ABSTAIN over a risky merge. Use only supplied text, provenance, geometry, style, and node-type evidence. A running header/footer must not be merged with body text. Confidence is the probability your decision is correct.`;
const results = [];
let usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
for (const item of evaluation.cases) {
  const classifierInput = {
    ambiguityId: item.ambiguityId,
    left: { exactText: item.left.exactText, nodeType: item.left.nodeType, sourceProvenance: item.left.sourceProvenance },
    right: { exactText: item.right.exactText, nodeType: item.right.nodeType, sourceProvenance: item.right.sourceProvenance },
    precedingContext: item.precedingContext.map(({ exactText, nodeType, page, readingOrder, region }) => ({ exactText, nodeType, page, readingOrder, region })),
    followingContext: item.followingContext.map(({ exactText, nodeType, page, readingOrder, region }) => ({ exactText, nodeType, page, readingOrder, region })),
    styleEvidence: item.styleEvidence,
    layoutEvidence: item.layoutEvidence,
  };
  const started = performance.now();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: [
      { role: "system", content: [{ type: "input_text", text: system }] },
      { role: "user", content: [{ type: "input_text", text: JSON.stringify(classifierInput) }] },
    ], text: { format: { type: "json_schema", name: "pdf_boundary_decision", strict: true, schema } } }),
  });
  if (!response.ok) throw new Error(`OpenAI boundary classification failed (${response.status}): ${await response.text()}`);
  const body = await response.json();
  const outputText = body.output_text ?? body.output?.flatMap(x => x.content ?? []).find(x => x.type === "output_text")?.text;
  if (!outputText) throw new Error(`No structured output for ${item.ambiguityId}`);
  const parsed = JSON.parse(outputText);
  if (!["MERGE", "KEEP_BOUNDARY", "ABSTAIN"].includes(parsed.decision) || typeof parsed.confidence !== "number" || !Array.isArray(parsed.reason_codes) || typeof parsed.explanation !== "string") throw new Error(`Invalid classifier contract for ${item.ambiguityId}`);
  results.push({ ambiguityId: item.ambiguityId, ...parsed, latencyMs: Number((performance.now() - started).toFixed(1)), responseId: body.id });
  usage.input_tokens += body.usage?.input_tokens ?? 0;
  usage.output_tokens += body.usage?.output_tokens ?? 0;
  usage.total_tokens += body.usage?.total_tokens ?? 0;
}
await writeFile("artifacts/pdf-phase3c/ai-classifier-results.json", JSON.stringify({
  experiment: "phase3c-isolated-boundary-classifier", model, endpoint: "POST https://api.openai.com/v1/responses",
  structuredOutput: true, referenceLabelsExposed: false, evaluationCasesSha256: evaluation.evaluationCasesSha256,
  usage, results,
}, null, 2) + "\n");
const decisions = results.reduce((counts, item) => ({ ...counts, [item.decision]: (counts[item.decision] ?? 0) + 1 }), {});
console.log(JSON.stringify({ model, cases: results.length, decisions, usage }, null, 2));
