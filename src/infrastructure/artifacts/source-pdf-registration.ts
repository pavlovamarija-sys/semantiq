import type { SupabaseClient } from "@supabase/supabase-js";

import { calculateByteIntegrity } from "./artifact-integrity.ts";

export interface SourcePdfRegistrationInput {
  projectId: string;
  documentId: string;
  documentVersionId: string;
  userId: string;
  storageBucket: string;
  storagePath: string;
  originalFilename: string;
  expectedByteSize: number;
  producerKind: "celex_import" | "corrigendum_import";
}

export interface SourcePdfRegistrationResult {
  artifactId: string;
  generationId: string;
  sha256: string;
  byteSize: number;
  alreadyRegistered: boolean;
}

type ArtifactRow = {
  id: string;
  processing_generation_id: string;
  sha256: string;
  byte_size: number;
  storage_bucket: string;
  storage_path: string;
  status: string;
};

function assertPdf(bytes: Uint8Array): void {
  if (bytes.byteLength < 5 || new TextDecoder("ascii").decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw new Error("Persisted source object is not a PDF.");
  }
}

function verifyExisting(row: ArtifactRow, input: SourcePdfRegistrationInput, sha256: string, byteSize: number): SourcePdfRegistrationResult {
  if (row.status !== "available" || row.sha256 !== sha256 || Number(row.byte_size) !== byteSize
      || row.storage_bucket !== input.storageBucket || row.storage_path !== input.storagePath) {
    throw new Error("Existing SOURCE_PDF artifact does not match the current persisted bytes and storage identity.");
  }
  return { artifactId: row.id, generationId: row.processing_generation_id, sha256, byteSize, alreadyRegistered: true };
}

export async function registerPersistedSourcePdf(
  supabase: SupabaseClient,
  input: SourcePdfRegistrationInput,
): Promise<SourcePdfRegistrationResult> {
  const { data: stored, error: downloadError } = await supabase.storage.from(input.storageBucket).download(input.storagePath);
  if (downloadError || !stored) throw new Error(`Persisted source PDF is unavailable: ${downloadError?.message ?? "missing object"}`);
  const bytes = new Uint8Array(await stored.arrayBuffer());
  assertPdf(bytes);
  const { sha256, byteSize } = calculateByteIntegrity(bytes);
  if (byteSize !== input.expectedByteSize) {
    throw new Error(`Persisted source byte size mismatch: expected ${input.expectedByteSize}, received ${byteSize}.`);
  }

  const existingQuery = () => supabase.from("document_artifacts")
    .select("id,processing_generation_id,sha256,byte_size,storage_bucket,storage_path,status")
    .eq("document_version_id", input.documentVersionId).eq("artifact_type", "SOURCE_PDF").maybeSingle();
  const { data: existing, error: existingError } = await existingQuery();
  if (existingError) throw new Error(`SOURCE_PDF lookup failed: ${existingError.message}`);
  if (existing) return verifyExisting(existing as ArtifactRow, input, sha256, byteSize);

  const generationId = crypto.randomUUID();
  const artifactId = crypto.randomUUID();
  const idempotencyKey = `source-pdf:${input.documentVersionId}:${sha256}`;
  const now = new Date().toISOString();
  const { error: generationError } = await supabase.from("processing_generations").insert({
    id: generationId, project_id: input.projectId, document_id: input.documentId,
    document_version_id: input.documentVersionId, generation_kind: "source_registration", generation_number: 1,
    idempotency_key: idempotencyKey, input_fingerprint_sha256: sha256, status: "completed",
    producer_kind: input.producerKind, producer_version: "phase6c2", algorithm_version: "1",
    validation_status: "PASS", source_coverage_status: "PASS", ordered_token_status: "PASS",
    started_at: now, completed_at: now, created_by: input.userId,
  });
  let effectiveGenerationId = generationId;
  if (generationError) {
    const { data: generation, error: recoveryError } = await supabase.from("processing_generations")
      .select("id,input_fingerprint_sha256,status").eq("project_id", input.projectId)
      .eq("generation_kind", "source_registration").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (recoveryError || !generation || generation.input_fingerprint_sha256 !== sha256 || generation.status !== "completed") {
      throw new Error(`SOURCE_PDF generation registration failed: ${generationError.message}`);
    }
    effectiveGenerationId = generation.id;
  }

  const { error: artifactError } = await supabase.from("document_artifacts").insert({
    id: artifactId, project_id: input.projectId, document_id: input.documentId,
    document_version_id: input.documentVersionId, processing_generation_id: effectiveGenerationId,
    artifact_type: "SOURCE_PDF", artifact_generation: 1, status: "available",
    storage_bucket: input.storageBucket, storage_path: input.storagePath, original_filename: input.originalFilename,
    sha256, byte_size: byteSize, mime_type: "application/pdf", producer_kind: input.producerKind,
    producer_version: "phase6c2", created_by: input.userId, available_at: now,
  });
  if (artifactError) {
    const { data: raced, error: racedError } = await existingQuery();
    if (racedError || !raced) throw new Error(`SOURCE_PDF artifact registration failed: ${artifactError.message}`);
    return verifyExisting(raced as ArtifactRow, input, sha256, byteSize);
  }
  return { artifactId, generationId: effectiveGenerationId, sha256, byteSize, alreadyRegistered: false };
}
