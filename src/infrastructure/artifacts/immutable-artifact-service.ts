import type { ArtifactState, ArtifactType, GenerationKind } from "../../domain/document-artifacts.ts";
import {
  buildImmutableArtifactPath, calculateByteIntegrity, DOCUMENT_ARTIFACT_BUCKET,
  validateArtifactMimeType, verifyByteIntegrity,
} from "./artifact-integrity.ts";

export interface ArtifactReservation {
  id: string;
  ownerId: string;
  projectId: string;
  documentId: string;
  documentVersionId: string;
  processingGenerationId: string | null;
  artifactType: ArtifactType;
  artifactGeneration: number;
  status: ArtifactState;
  storageBucket: string;
  storagePath: string;
  originalFilename: string;
  sha256: string;
  byteSize: number;
  mimeType: string;
  producerKind: string;
  producerVersion: string;
}

export interface PrepareArtifactInput extends Omit<ArtifactReservation,
  "status" | "storageBucket" | "storagePath" | "sha256" | "byteSize"> {
  bytes: Uint8Array;
}

export interface ArtifactRepository {
  reserve(artifact: ArtifactReservation): Promise<ArtifactReservation>;
  markUploading(artifactId: string): Promise<void>;
  finalize(artifactId: string, expectedSha256: string, expectedByteSize: number): Promise<ArtifactReservation>;
  markFailed(artifactId: string, failureCode: string): Promise<void>;
  find(artifactId: string): Promise<ArtifactReservation | null>;
}

export interface ArtifactStorage {
  upload(bucket: string, path: string, bytes: Uint8Array, options: { contentType: string; upsert: false }): Promise<void>;
  download(bucket: string, path: string): Promise<Uint8Array | null>;
}

export class ArtifactFinalizationError extends Error {
  readonly recoveryRequired = true;
  readonly artifactId: string;
  constructor(message: string, artifactId: string, options?: ErrorOptions) {
    super(message, options);
    this.artifactId = artifactId;
    this.name = "ArtifactFinalizationError";
  }
}

export function prepareArtifactMetadata(input: PrepareArtifactInput): ArtifactReservation {
  validateArtifactMimeType(input.artifactType, input.mimeType);
  const integrity = calculateByteIntegrity(input.bytes);
  const { bytes: _bytes, ...identity } = input;
  return {
    ...identity,
    status: "reserved",
    storageBucket: DOCUMENT_ARTIFACT_BUCKET,
    storagePath: buildImmutableArtifactPath({
      ownerId: input.ownerId,
      projectId: input.projectId,
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      artifactId: input.id,
    }, input.originalFilename),
    ...integrity,
  };
}

export async function createImmutableArtifact(
  repository: ArtifactRepository,
  storage: ArtifactStorage,
  input: PrepareArtifactInput,
): Promise<ArtifactReservation> {
  const prepared = prepareArtifactMetadata(input);
  const reservation = await repository.reserve(prepared);
  if (reservation.sha256 !== prepared.sha256 || reservation.byteSize !== prepared.byteSize
      || reservation.storagePath !== prepared.storagePath) {
    throw new Error("artifact identity collision with different immutable metadata");
  }
  if (reservation.status === "available") {
    const existing = await storage.download(reservation.storageBucket, reservation.storagePath);
    if (!existing) throw new Error("available artifact storage object is missing");
    verifyByteIntegrity(existing, reservation);
    return reservation;
  }
  let uploaded = reservation.status === "uploading"
    ? await storage.download(reservation.storageBucket, reservation.storagePath)
    : null;
  if (!uploaded) {
    if (reservation.status !== "reserved" && reservation.status !== "uploading") {
      throw new Error(`artifact reservation is not resumable from state ${reservation.status}`);
    }
    if (reservation.status === "reserved") await repository.markUploading(reservation.id);
    try {
      await storage.upload(reservation.storageBucket, reservation.storagePath, input.bytes,
        { contentType: reservation.mimeType, upsert: false });
    } catch (error) {
      await repository.markFailed(reservation.id, "storage_upload_failed");
      throw error;
    }
    uploaded = await storage.download(reservation.storageBucket, reservation.storagePath);
  }
  if (!uploaded) {
    await repository.markFailed(reservation.id, "storage_readback_missing");
    throw new Error("uploaded artifact could not be read back");
  }
  try {
    verifyByteIntegrity(uploaded, reservation);
  } catch (error) {
    await repository.markFailed(reservation.id, "storage_integrity_mismatch");
    throw error;
  }
  try {
    return await repository.finalize(reservation.id, reservation.sha256, reservation.byteSize);
  } catch (error) {
    throw new ArtifactFinalizationError(
      "storage upload is verified but database finalization failed; retry the same reservation",
      reservation.id, { cause: error },
    );
  }
}

export async function uploadAndVerifyReservedArtifact(
  repository: ArtifactRepository,
  storage: ArtifactStorage,
  input: PrepareArtifactInput,
): Promise<ArtifactReservation> {
  const prepared = prepareArtifactMetadata(input);
  const reservation = await repository.reserve(prepared);
  if (reservation.sha256 !== prepared.sha256 || reservation.byteSize !== prepared.byteSize
      || reservation.storagePath !== prepared.storagePath) {
    throw new Error("artifact identity collision with different immutable metadata");
  }
  if (reservation.status === "available") {
    const existing = await storage.download(reservation.storageBucket, reservation.storagePath);
    if (!existing) throw new Error("available artifact storage object is missing");
    verifyByteIntegrity(existing, reservation);
    return reservation;
  }
  let uploaded = reservation.status === "uploading"
    ? await storage.download(reservation.storageBucket, reservation.storagePath) : null;
  if (!uploaded) {
    if (reservation.status !== "reserved" && reservation.status !== "uploading") {
      throw new Error(`artifact reservation is not resumable from state ${reservation.status}`);
    }
    if (reservation.status === "reserved") await repository.markUploading(reservation.id);
    try {
      await storage.upload(reservation.storageBucket, reservation.storagePath, input.bytes,
        { contentType: reservation.mimeType, upsert: false });
    } catch (error) {
      await repository.markFailed(reservation.id, "storage_upload_failed");
      throw error;
    }
    uploaded = await storage.download(reservation.storageBucket, reservation.storagePath);
  }
  if (!uploaded) {
    await repository.markFailed(reservation.id, "storage_readback_missing");
    throw new Error("uploaded artifact could not be read back");
  }
  try { verifyByteIntegrity(uploaded, reservation); }
  catch (error) {
    await repository.markFailed(reservation.id, "storage_integrity_mismatch");
    throw error;
  }
  return { ...reservation, status: "uploading" };
}

export async function readVerifiedArtifact(
  repository: ArtifactRepository,
  storage: ArtifactStorage,
  artifactId: string,
): Promise<Uint8Array> {
  const artifact = await repository.find(artifactId);
  if (!artifact || artifact.status !== "available") throw new Error("artifact is not available");
  const bytes = await storage.download(artifact.storageBucket, artifact.storagePath);
  if (!bytes) throw new Error("available artifact storage object is missing");
  verifyByteIntegrity(bytes, artifact);
  return bytes;
}

export interface GenerationReservationInput {
  projectId: string;
  documentId: string;
  documentVersionId: string;
  generationKind: GenerationKind;
  idempotencyKey: string;
  inputFingerprintSha256: string;
}

export interface GenerationRepository<T> {
  reserveIdempotent(input: GenerationReservationInput): Promise<T>;
}

export function reserveProcessingGeneration<T>(repository: GenerationRepository<T>, input: GenerationReservationInput): Promise<T> {
  if (!input.idempotencyKey.trim()) throw new Error("idempotency key is required");
  if (!/^[0-9a-f]{64}$/.test(input.inputFingerprintSha256)) throw new Error("input fingerprint must be SHA-256");
  return repository.reserveIdempotent(input);
}
