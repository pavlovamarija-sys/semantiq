import type { Timestamp, Uuid } from "./records.ts";

export const ARTIFACT_TYPES = [
  "SOURCE_PDF", "RECONSTRUCTION_MODEL", "VALIDATED_DOCX", "CANONICAL_SNAPSHOT",
  "STUDIO_SDLXLIFF_SOURCE", "STUDIO_SDLXLIFF_MK1", "STUDIO_SDLXLIFF_REVIEWED",
  "TARGET_DOCX", "QA_REPORT", "RECONCILIATION_REPORT", "EXPORT_PACKAGE",
] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const ARTIFACT_STATES = ["reserved", "uploading", "available", "failed", "quarantined"] as const;
export type ArtifactState = (typeof ARTIFACT_STATES)[number];

export const GENERATION_KINDS = [
  "source_registration", "pdf_reconstruction", "validated_docx_render", "canonical_extraction", "cat_projection",
  "mk1_injection", "cat_review_import", "mk2_reconciliation", "target_render", "qa", "export_package",
] as const;
export type GenerationKind = (typeof GENERATION_KINDS)[number];

export const GENERATION_STATES = [
  "pending", "running", "validating", "completed", "failed", "failed_validation", "abandoned",
] as const;
export type GenerationState = (typeof GENERATION_STATES)[number];

export const ARTIFACT_RELATIONSHIP_TYPES = [
  "derived_from", "rendered_from", "extracted_from", "projected_from", "injected_from",
  "reviewed_from", "reconciled_from", "packaged_from", "supersedes",
] as const;
export type ArtifactRelationshipType = (typeof ARTIFACT_RELATIONSHIP_TYPES)[number];

export interface DocumentArtifact {
  id: Uuid;
  projectId: Uuid;
  documentId: Uuid;
  documentVersionId: Uuid;
  processingGenerationId: Uuid | null;
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
  failureCode: string | null;
  createdBy: Uuid | null;
  createdAt: Timestamp;
  availableAt: Timestamp | null;
}

export interface ProcessingGeneration {
  id: Uuid;
  projectId: Uuid;
  documentId: Uuid;
  documentVersionId: Uuid;
  generationKind: GenerationKind;
  generationNumber: number;
  idempotencyKey: string;
  inputFingerprintSha256: string;
  status: GenerationState;
  producerKind: string;
  producerVersion: string;
  algorithmVersion: string | null;
  configSha256: string | null;
}

export interface ArtifactRelationship {
  projectId: Uuid;
  parentArtifactId: Uuid;
  childArtifactId: Uuid;
  relationshipType: ArtifactRelationshipType;
  inputRole: string;
  inputOrdinal: number;
  createdAt: Timestamp;
}
