import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { registerPersistedSourcePdf } from "./source-pdf-registration.ts";

const pdf = new TextEncoder().encode("%PDF-1.7\nsource fixture");
const ids = { projectId: randomUUID(), documentId: randomUUID(), documentVersionId: randomUUID(), userId: randomUUID() };
const input = (overrides = {}) => ({ ...ids, storageBucket: "source-documents",
  storagePath: `${ids.userId}/${ids.projectId}/${ids.documentId}/${ids.documentVersionId}.pdf`,
  originalFilename: "32008L0050_EN.pdf", expectedByteSize: pdf.byteLength, producerKind: "celex_import", ...overrides });

class Query {
  filters = {};
  constructor(client, table) { this.client = client; this.table = table; }
  select() { return this; }
  eq(key, value) { this.filters[key] = value; return this; }
  async maybeSingle() {
    const rows = this.client.rows[this.table].filter((row) => Object.entries(this.filters).every(([key, value]) => row[key] === value));
    return { data: rows[0] ?? null, error: null };
  }
  async insert(value) {
    if (this.client.failTable === this.table) return { error: { message: "forced insert failure" } };
    if (this.table === "processing_generations") {
      const duplicate = this.client.rows[this.table].find((row) => row.project_id === value.project_id
        && row.generation_kind === value.generation_kind && row.idempotency_key === value.idempotency_key);
      if (duplicate) return { error: { message: "duplicate generation" } };
    }
    if (this.table === "document_artifacts") {
      const duplicate = this.client.rows[this.table].find((row) => row.document_version_id === value.document_version_id
        && row.artifact_type === value.artifact_type && row.artifact_generation === value.artifact_generation);
      if (duplicate) return { error: { message: "duplicate artifact" } };
    }
    this.client.rows[this.table].push({ ...value }); return { error: null };
  }
}

class FakeClient {
  rows = { processing_generations: [], document_artifacts: [] };
  failTable = null;
  downloads = 0;
  uploads = 0;
  object = pdf;
  storage = { from: () => ({
    download: async () => { this.downloads += 1; return this.object === null
      ? { data: null, error: { message: "missing" } }
      : { data: new Blob([this.object]), error: null }; },
    upload: async () => { this.uploads += 1; throw new Error("registration must not upload"); },
  }) };
  from(table) { return new Query(this, table); }
}

test("existing persisted PDF registers as available SOURCE_PDF using actual-byte hash and size", async () => {
  const client = new FakeClient(); const result = await registerPersistedSourcePdf(client, input());
  assert.equal(result.sha256, createHash("sha256").update(pdf).digest("hex"));
  assert.equal(result.byteSize, pdf.byteLength);
  assert.equal(client.rows.document_artifacts[0].status, "available");
  assert.equal(client.rows.document_artifacts[0].artifact_type, "SOURCE_PDF");
});

test("invalid PDF is rejected", async () => {
  const client = new FakeClient(); client.object = new TextEncoder().encode("HTML error");
  await assert.rejects(registerPersistedSourcePdf(client, input({ expectedByteSize: client.object.byteLength })), /not a PDF/);
});

test("missing persisted object is rejected", async () => {
  const client = new FakeClient(); client.object = null;
  await assert.rejects(registerPersistedSourcePdf(client, input()), /unavailable/);
});

test("same source rerun is idempotent", async () => {
  const client = new FakeClient(); const first = await registerPersistedSourcePdf(client, input());
  const second = await registerPersistedSourcePdf(client, input());
  assert.equal(second.artifactId, first.artifactId); assert.equal(second.alreadyRegistered, true);
  assert.equal(client.rows.document_artifacts.length, 1); assert.equal(client.rows.processing_generations.length, 1);
});

test("different bytes cannot mutate an existing artifact", async () => {
  const client = new FakeClient(); await registerPersistedSourcePdf(client, input());
  client.object = new TextEncoder().encode("%PDF-1.7\nchanged authoritative bytes");
  await assert.rejects(registerPersistedSourcePdf(client, input({ expectedByteSize: client.object.byteLength })), /does not match/);
  assert.equal(client.rows.document_artifacts.length, 1);
});

test("existing artifact hash mismatch fails closed", async () => {
  const client = new FakeClient(); await registerPersistedSourcePdf(client, input());
  client.rows.document_artifacts[0].sha256 = "0".repeat(64);
  await assert.rejects(registerPersistedSourcePdf(client, input()), /does not match/);
});

test("registration failure does not upload, replace, or delete source bytes", async () => {
  const client = new FakeClient(); client.failTable = "processing_generations";
  await assert.rejects(registerPersistedSourcePdf(client, input()), /generation registration failed/);
  assert.equal(client.downloads, 1); assert.equal(client.uploads, 0); assert.deepEqual(client.object, pdf);
});

test("primary and corrigendum producer identities remain distinct", async () => {
  const primary = new FakeClient(); const corrigendum = new FakeClient();
  await registerPersistedSourcePdf(primary, input());
  await registerPersistedSourcePdf(corrigendum, input({ documentId: randomUUID(), documentVersionId: randomUUID(),
    storagePath: `${ids.userId}/${ids.projectId}/${randomUUID()}/${randomUUID()}.pdf`, producerKind: "corrigendum_import" }));
  assert.equal(primary.rows.document_artifacts[0].producer_kind, "celex_import");
  assert.equal(corrigendum.rows.document_artifacts[0].producer_kind, "corrigendum_import");
});

test("CELEX orchestration persists version before primary and corrigendum registration", async () => {
  const action = await readFile(new URL("../../app/app/projects/[projectId]/celex-actions.ts", import.meta.url), "utf8");
  const writes = [...action.matchAll(/if \(versionError\) \{/g)].map((match) => match.index);
  const registrations = [...action.matchAll(/await registerPersistedSourcePdf\(supabase,/g)].map((match) => match.index);
  assert.equal(writes.length, 2); assert.equal(registrations.length, 2);
  assert.ok(writes[0] < registrations[0]); assert.ok(writes[1] < registrations[1]);
});

test("registration failures are recoverable and do not mark successful persistence skipped", async () => {
  const action = await readFile(new URL("../../app/app/projects/[projectId]/celex-actions.ts", import.meta.url), "utf8");
  assert.equal((action.match(/source-artifact-registration-failed/g) ?? []).length, 2);
  assert.doesNotMatch(action, /source-artifact-registration-failed[\s\S]{0,300}skipped\.push/);
});

test("scope mismatch and cross-project lineage are database-enforced", async () => {
  const sql = await readFile(new URL("../../../supabase/migrations/20261019000000_immutable_document_artifacts.sql", import.meta.url), "utf8");
  assert.match(sql, /document artifact scope does not match document version/);
  assert.equal((sql.match(/foreign key \((?:parent|child)_artifact_id, project_id\)/g) ?? []).length, 2);
  assert.match(sql, /enable row level security/);
});

test("existing authenticated source download route remains based on document_versions", async () => {
  const route = await readFile(new URL("../../app/api/projects/[projectId]/documents/[documentId]/storage/[kind]/route.ts", import.meta.url), "utf8");
  assert.match(route, /document_versions/); assert.match(route, /source_storage_bucket/);
  assert.doesNotMatch(route, /document_artifacts/);
});

test("registration helper invokes neither reconstruction nor shadow", async () => {
  const source = await readFile(new URL("./source-pdf-registration.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /reconstruct|runShadow|analyzePdf/);
});

test("shadow remains exact-opt-in and registration occurs before optional shadow call", async () => {
  const shadow = await readFile(new URL("../document-conversion/shadow-reconstruction.ts", import.meta.url), "utf8");
  const action = await readFile(new URL("../../app/app/projects/[projectId]/celex-actions.ts", import.meta.url), "utf8");
  assert.match(shadow, /PDF_TO_DOCX_SHADOW_RECONSTRUCTION !== "true"/);
  assert.ok(action.indexOf("registerPersistedSourcePdf") < action.lastIndexOf("runShadowReconstruction"));
});

test("backfill uses advisory lock, immutable insert, and no storage mutation", async () => {
  const source = await readFile(new URL("../../../scripts/phase6c2-source-pdf-backfill.mjs", import.meta.url), "utf8");
  assert.match(source, /pg_advisory_xact_lock/); assert.match(source, /insert into public\.document_artifacts/);
  assert.doesNotMatch(source, /storage\.from|\.upload\(|\.remove\(/);
});

test("same URL with changed bytes requires new identity rather than mutation", async () => {
  const client = new FakeClient(); await registerPersistedSourcePdf(client, input());
  client.object = new TextEncoder().encode("%PDF-2.0\nnew revision");
  await assert.rejects(registerPersistedSourcePdf(client, input({ expectedByteSize: client.object.byteLength })), /does not match/);
});
