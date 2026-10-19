import { createHash, timingSafeEqual } from "node:crypto";

import type { ArtifactType } from "../../domain/document-artifacts.ts";

export const DOCUMENT_ARTIFACT_BUCKET = "document-artifacts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;

const MIME_BY_TYPE: Readonly<Record<ArtifactType, readonly string[]>> = {
  SOURCE_PDF: ["application/pdf"],
  RECONSTRUCTION_MODEL: ["application/json"],
  VALIDATED_DOCX: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  CANONICAL_SNAPSHOT: ["application/json"],
  STUDIO_SDLXLIFF_SOURCE: ["application/xml", "text/xml", "application/x-xliff+xml", "application/x-sdlxliff"],
  STUDIO_SDLXLIFF_MK1: ["application/xml", "text/xml", "application/x-xliff+xml", "application/x-sdlxliff"],
  STUDIO_SDLXLIFF_REVIEWED: ["application/xml", "text/xml", "application/x-xliff+xml", "application/x-sdlxliff"],
  TARGET_DOCX: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  QA_REPORT: ["application/json"],
  RECONCILIATION_REPORT: ["application/json"],
  EXPORT_PACKAGE: ["application/zip"],
};

export interface ArtifactScope {
  ownerId: string;
  projectId: string;
  documentId: string;
  documentVersionId: string;
  artifactId: string;
}

export interface ByteIntegrity {
  sha256: string;
  byteSize: number;
}

function requireUuid(label: string, value: string): void {
  if (!UUID.test(value)) throw new Error(`${label} must be a UUID`);
}

export function sanitizeArtifactFilename(filename: string): string {
  const trimmed = filename.trim();
  let decoded = trimmed;
  try { decoded = decodeURIComponent(trimmed); } catch { throw new Error("filename contains invalid percent encoding"); }
  if (!trimmed || trimmed === "." || trimmed === ".." || /[\\/\0-\x1f\x7f]/.test(trimmed)
      || /[\\/]/.test(decoded) || decoded === "." || decoded === "..") {
    throw new Error("filename contains a path traversal or separator");
  }
  const safe = trimmed.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\s+/g, "-");
  if (!safe || safe.length > 180) throw new Error("filename is empty or too long after sanitization");
  return safe;
}

export function buildImmutableArtifactPath(scope: ArtifactScope, filename: string): string {
  requireUuid("ownerId", scope.ownerId);
  requireUuid("projectId", scope.projectId);
  requireUuid("documentId", scope.documentId);
  requireUuid("documentVersionId", scope.documentVersionId);
  requireUuid("artifactId", scope.artifactId);
  return [scope.ownerId, scope.projectId, scope.documentId, scope.documentVersionId,
    "artifacts", scope.artifactId, sanitizeArtifactFilename(filename)].join("/");
}

export function calculateByteIntegrity(bytes: Uint8Array): ByteIntegrity {
  if (bytes.byteLength === 0) throw new Error("artifact bytes must not be empty");
  return { sha256: createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.byteLength };
}

export function validateArtifactMimeType(artifactType: ArtifactType, mimeType: string): void {
  if (!MIME_BY_TYPE[artifactType].includes(mimeType.toLowerCase())) {
    throw new Error(`MIME type ${mimeType} is not valid for ${artifactType}`);
  }
}

export function verifyByteIntegrity(bytes: Uint8Array, expected: ByteIntegrity): ByteIntegrity {
  if (!SHA256.test(expected.sha256) || expected.byteSize <= 0) throw new Error("persisted integrity metadata is invalid");
  const actual = calculateByteIntegrity(bytes);
  const equalHash = timingSafeEqual(Buffer.from(actual.sha256, "hex"), Buffer.from(expected.sha256, "hex"));
  if (!equalHash || actual.byteSize !== expected.byteSize) {
    throw new Error(`artifact integrity mismatch: expected ${expected.sha256}/${expected.byteSize}, got ${actual.sha256}/${actual.byteSize}`);
  }
  return actual;
}
