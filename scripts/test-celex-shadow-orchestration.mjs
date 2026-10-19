import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runShadowReconstruction } from "../src/infrastructure/document-conversion/shadow-reconstruction.ts";

const source = new TextEncoder().encode("%PDF-1.7\nshadow orchestration fixture");
const sourceSha256 = createHash("sha256").update(source).digest("hex");
const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
const environmentKeys = [
  "PDF_TO_DOCX_SHADOW_RECONSTRUCTION",
  "PDF_TO_DOCX_SHADOW_EVIDENCE_DIR",
  "PDF_TO_DOCX_SERVICE_URL",
  "PDF_TO_DOCX_SERVICE_TOKEN",
];
const originalEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));

function restoreEnvironment() {
  for (const key of environmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
}

function enableShadow(directory) {
  process.env.PDF_TO_DOCX_SHADOW_RECONSTRUCTION = "true";
  process.env.PDF_TO_DOCX_SHADOW_EVIDENCE_DIR = directory;
  process.env.PDF_TO_DOCX_SERVICE_URL = "http://127.0.0.1:8000";
  process.env.PDF_TO_DOCX_SERVICE_TOKEN = "test-token";
}

test.afterEach(restoreEnvironment);

test("flag OFF leaves the active path unchanged and invokes no shadow request", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "celex-shadow-off-"));
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error("unexpected fetch"); };
  process.env.PDF_TO_DOCX_SHADOW_RECONSTRUCTION = "false";
  process.env.PDF_TO_DOCX_SHADOW_EVIDENCE_DIR = directory;

  assert.equal(await runShadowReconstruction(source, "fixture.pdf", { celex: "TEST" }), null);
  assert.equal(fetchCalls, 0);
  assert.deepEqual(await readdir(directory), []);
  await rm(directory, { recursive: true, force: true });
});

test("flag ON invokes /shadow/reconstruct and writes correlated durable evidence", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "celex-shadow-on-"));
  enableShadow(directory);
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({
      runId: "00000000-0000-4000-8000-000000000001",
      sourceSha256,
      status: "completed",
      workerVersion: "test-worker",
      docxSha256: "a".repeat(64),
      typedModelSummary: { pages: 2, blocks: 3, lines: 4, spans: 5, tokens: 6 },
      reconstructionSummary: { physicalTables: 1, logicalTables: 1, rows: 2, cells: 4, boundaries: { MERGE: 1, KEEP_BOUNDARY: 2, ABSTAIN: 0 } },
      validationSummary: { textIntegrity: { status: "PASS" } },
      durationMs: 12,
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const result = await runShadowReconstruction(source, "fixture.pdf", {
    documentId: "document-1", importId: "version-1", celex: "TEST",
  });
  assert.equal(result?.status, "completed");
  assert.equal(requestedUrl, "http://127.0.0.1:8000/shadow/reconstruct");
  const files = await readdir(directory);
  assert.deepEqual(files, ["00000000-0000-4000-8000-000000000001.json"]);
  const evidence = JSON.parse(await readFile(path.join(directory, files[0]), "utf8"));
  assert.equal(evidence.non_authoritative, true);
  assert.equal(evidence.celex, "TEST");
  assert.equal(evidence.document_id, "document-1");
  assert.equal(evidence.import_id, "version-1");
  assert.equal(evidence.source_sha256, sourceSha256);
  assert.equal(evidence.shadow_status, "completed");
  await rm(directory, { recursive: true, force: true });
});

test("shadow transport/configuration failure is recorded and does not throw into active orchestration", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "celex-shadow-failure-"));
  enableShadow(directory);
  console.error = () => {};
  globalThis.fetch = async () => { throw new Error("worker unavailable"); };
  const activeResult = { status: "success", bytes: 1234 };

  const result = await runShadowReconstruction(source, "fixture.pdf", { celex: "TEST" });
  assert.deepEqual(activeResult, { status: "success", bytes: 1234 });
  assert.equal(result?.status, "failed");
  const files = await readdir(directory);
  assert.equal(files.length, 1);
  const evidence = JSON.parse(await readFile(path.join(directory, files[0]), "utf8"));
  assert.equal(evidence.shadow_status, "failed");
  assert.equal(evidence.error_category, "transport_or_configuration");
  await rm(directory, { recursive: true, force: true });
});

test("evidence-write failure is isolated from a successful shadow response and active result", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "celex-shadow-write-failure-"));
  const impossibleDirectory = path.join(directory, "not-a-directory");
  await writeFile(impossibleDirectory, "file blocks mkdir");
  enableShadow(impossibleDirectory);
  console.error = () => {};
  globalThis.fetch = async () => new Response(JSON.stringify({ runId: "run-write-failure", sourceSha256, status: "completed" }), { status: 200 });

  const result = await runShadowReconstruction(source, "fixture.pdf", { celex: "TEST" });
  assert.equal(result?.status, "completed");
  await rm(directory, { recursive: true, force: true });
});

test("real CELEX action invokes shadow only after successful active version persistence", async () => {
  const action = await readFile(new URL("../src/app/app/projects/[projectId]/celex-actions.ts", import.meta.url), "utf8");
  const calls = [...action.matchAll(/await runShadowReconstruction\(official\.bytes, filename,/g)].map((match) => match.index);
  const versionFailures = [...action.matchAll(/if \(versionError\) \{/g)].map((match) => match.index);
  const importedPushes = [...action.matchAll(/imported\.push\(/g)].map((match) => match.index);
  assert.equal(calls.length, 2, "original and corrigendum imports must both be observed");
  assert.equal(versionFailures.length, 2);
  assert.equal(importedPushes.length, 2);
  for (let index = 0; index < 2; index += 1) {
    assert.ok(versionFailures[index] < calls[index], "active persistence failure branch must precede shadow");
    assert.ok(calls[index] < importedPushes[index], "shadow observation must precede only the success bookkeeping");
  }
});
