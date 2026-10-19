import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildImmutableArtifactPath, calculateByteIntegrity, verifyByteIntegrity,
} from "./artifact-integrity.ts";
import {
  ArtifactFinalizationError, createImmutableArtifact, prepareArtifactMetadata,
  readVerifiedArtifact, reserveProcessingGeneration,
} from "./immutable-artifact-service.ts";

const ids = { ownerId: randomUUID(), projectId: randomUUID(), documentId: randomUUID(), documentVersionId: randomUUID(), artifactId: randomUUID() };
const bytes = new TextEncoder().encode("immutable artifact bytes");
const base = (overrides = {}) => ({
  ...ids, id: ids.artifactId, processingGenerationId: randomUUID(), artifactType: "SOURCE_PDF",
  artifactGeneration: 1, originalFilename: "legal act.pdf", mimeType: "application/pdf",
  producerKind: "test", producerVersion: "1", bytes, ...overrides,
});

class MemoryRepository {
  rows = new Map();
  failFinalize = false;
  async reserve(row) { const old = this.rows.get(row.id); if (old) return { ...old }; this.rows.set(row.id, { ...row }); return { ...row }; }
  async markUploading(id) { const row = this.rows.get(id); assert.equal(row.status, "reserved"); row.status = "uploading"; }
  async finalize(id, sha256, byteSize) {
    if (this.failFinalize) throw new Error("database unavailable");
    const row = this.rows.get(id); assert.equal(row.status, "uploading"); assert.equal(row.sha256, sha256); assert.equal(row.byteSize, byteSize);
    row.status = "available"; return { ...row };
  }
  async markFailed(id, failureCode) { Object.assign(this.rows.get(id), { status: "failed", failureCode }); }
  async find(id) { const row = this.rows.get(id); return row ? { ...row } : null; }
}

class MemoryStorage {
  objects = new Map();
  failUpload = false;
  corruptUpload = false;
  async upload(bucket, path, value, options) {
    assert.equal(options.upsert, false);
    if (this.failUpload) throw new Error("upload failed");
    const key = `${bucket}/${path}`;
    if (this.objects.has(key)) throw new Error("object exists");
    this.objects.set(key, this.corruptUpload ? new Uint8Array([1]) : value.slice());
  }
  async download(bucket, path) { return this.objects.get(`${bucket}/${path}`)?.slice() ?? null; }
}

test("deterministic immutable path construction", () => {
  const one = buildImmutableArtifactPath(ids, "legal act.pdf");
  assert.equal(one, buildImmutableArtifactPath(ids, "legal act.pdf"));
  assert.equal(one, `${ids.ownerId}/${ids.projectId}/${ids.documentId}/${ids.documentVersionId}/artifacts/${ids.artifactId}/legal-act.pdf`);
});

test("path traversal and encoded path separators are rejected", () => {
  for (const name of ["../x.pdf", "..\\x.pdf", "%2e%2e%2fx.pdf", "a/b.pdf", "a\\b.pdf"]) {
    assert.throws(() => buildImmutableArtifactPath(ids, name), /traversal|separator/);
  }
});

test("SHA-256 and byte size come from actual bytes", () => {
  assert.deepEqual(calculateByteIntegrity(bytes), {
    sha256: createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.byteLength,
  });
});

test("byte-size verification fails closed", () => {
  const integrity = calculateByteIntegrity(bytes);
  assert.throws(() => verifyByteIntegrity(bytes, { ...integrity, byteSize: integrity.byteSize + 1 }), /mismatch/);
});

test("prepared metadata fixes immutable identity before upload", () => {
  const prepared = prepareArtifactMetadata(base());
  assert.equal(prepared.status, "reserved"); assert.equal(prepared.storageBucket, "document-artifacts");
  assert.equal(prepared.sha256.length, 64); assert.equal(prepared.byteSize, bytes.length);
});

test("new bytes require a new artifact identity", async () => {
  const repo = new MemoryRepository(); const storage = new MemoryStorage();
  await createImmutableArtifact(repo, storage, base());
  await assert.rejects(createImmutableArtifact(repo, storage, base({ bytes: new TextEncoder().encode("changed") })), /collision/);
});

test("duplicate idempotency request returns one generation", async () => {
  const byKey = new Map();
  const repository = { async reserveIdempotent(input) { if (!byKey.has(input.idempotencyKey)) byKey.set(input.idempotencyKey, { id: randomUUID(), ...input }); return byKey.get(input.idempotencyKey); } };
  const input = { projectId: ids.projectId, documentId: ids.documentId, documentVersionId: ids.documentVersionId,
    generationKind: "pdf_reconstruction", idempotencyKey: "same", inputFingerprintSha256: "a".repeat(64) };
  assert.equal((await reserveProcessingGeneration(repository, input)).id, (await reserveProcessingGeneration(repository, input)).id);
});

test("concurrent duplicate generation requests converge", async () => {
  let value;
  const repository = { async reserveIdempotent(input) { await Promise.resolve(); value ??= { id: randomUUID(), ...input }; return value; } };
  const input = { projectId: ids.projectId, documentId: ids.documentId, documentVersionId: ids.documentVersionId,
    generationKind: "pdf_reconstruction", idempotencyKey: "concurrent", inputFingerprintSha256: "b".repeat(64) };
  const results = await Promise.all(Array.from({ length: 8 }, () => reserveProcessingGeneration(repository, input)));
  assert.equal(new Set(results.map((item) => item.id)).size, 1);
});

test("failed upload never creates an available artifact", async () => {
  const repo = new MemoryRepository(); const storage = new MemoryStorage(); storage.failUpload = true;
  await assert.rejects(createImmutableArtifact(repo, storage, base()), /upload failed/);
  assert.equal(repo.rows.get(ids.artifactId).status, "failed");
});

test("DB failure after upload preserves resumable uploading reservation", async () => {
  const repo = new MemoryRepository(); const storage = new MemoryStorage(); repo.failFinalize = true;
  await assert.rejects(createImmutableArtifact(repo, storage, base()), ArtifactFinalizationError);
  assert.equal(repo.rows.get(ids.artifactId).status, "uploading");
  repo.failFinalize = false;
  const resumed = await createImmutableArtifact(repo, storage, base());
  assert.equal(resumed.status, "available");
});

test("read-back hash mismatch fails and artifact is not available", async () => {
  const repo = new MemoryRepository(); const storage = new MemoryStorage(); storage.corruptUpload = true;
  await assert.rejects(createImmutableArtifact(repo, storage, base()), /mismatch/);
  assert.equal(repo.rows.get(ids.artifactId).status, "failed");
});

test("missing available object fails integrity verification", async () => {
  const repo = new MemoryRepository(); const storage = new MemoryStorage();
  const row = prepareArtifactMetadata(base()); repo.rows.set(row.id, { ...row, status: "available" });
  await assert.rejects(readVerifiedArtifact(repo, storage, row.id), /missing/);
});

test("existing path collision fails without overwrite", async () => {
  const repo = new MemoryRepository(); const storage = new MemoryStorage();
  const row = prepareArtifactMetadata(base()); storage.objects.set(`${row.storageBucket}/${row.storagePath}`, new Uint8Array([9]));
  await assert.rejects(createImmutableArtifact(repo, storage, base()), /object exists/);
  assert.deepEqual(storage.objects.get(`${row.storageBucket}/${row.storagePath}`), new Uint8Array([9]));
});

test("same bytes may have distinct artifact identities and generations", async () => {
  const repo = new MemoryRepository(); const storage = new MemoryStorage();
  const a = await createImmutableArtifact(repo, storage, base());
  const secondId = randomUUID();
  const b = await createImmutableArtifact(repo, storage, base({ id: secondId, artifactId: secondId, artifactGeneration: 2, processingGenerationId: randomUUID() }));
  assert.notEqual(a.id, b.id); assert.equal(a.sha256, b.sha256); assert.notEqual(a.storagePath, b.storagePath);
});

test("migration enforces immutable rows, relationship uniqueness, and project-scoped foreign keys", async () => {
  const sql = await readFile(new URL("../../../supabase/migrations/20261019000000_immutable_document_artifacts.sql", import.meta.url), "utf8");
  assert.match(sql, /document_artifacts_immutable/);
  assert.match(sql, /artifact_relationships_append_only/);
  assert.match(sql, /primary key \(child_artifact_id, relationship_type, input_role, input_ordinal\)/);
  assert.equal((sql.match(/foreign key \((?:parent|child)_artifact_id, project_id\)/g) ?? []).length, 2);
  assert.match(sql, /artifact relationship would create a cycle/);
});

test("production code does not import inactive artifact service", async () => {
  const celex = await readFile(new URL("../../app/app/projects/[projectId]/celex-actions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(celex, /immutable-artifact-service|document_artifacts|processing_generations/);
});
