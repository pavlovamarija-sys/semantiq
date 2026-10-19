import type { SupabaseClient } from "@supabase/supabase-js";

import type { ArtifactRepository, ArtifactReservation, ArtifactStorage } from "./immutable-artifact-service.ts";
import { readVerifiedArtifact } from "./immutable-artifact-service.ts";

export class ExactArtifactReadError extends Error {
  readonly code: "not_found" | "unavailable" | "integrity_failure";
  constructor(code: "not_found" | "unavailable" | "integrity_failure", message: string) {
    super(message); this.code=code; this.name = "ExactArtifactReadError";
  }
}

export interface ExactArtifactRepository extends ArtifactRepository {
  findScoped(projectId: string, artifactId: string): Promise<ArtifactReservation | null>;
}

export interface ExactArtifactReadResult {
  artifact: ArtifactReservation;
  bytes: Uint8Array;
}

export async function readExactArtifact(
  repository: ExactArtifactRepository, storage: ArtifactStorage,
  projectId: string, artifactId: string,
): Promise<ExactArtifactReadResult> {
  const artifact = await repository.findScoped(projectId, artifactId);
  if (!artifact) throw new ExactArtifactReadError("not_found", "Artifact not found or access denied.");
  if (artifact.projectId !== projectId || artifact.id !== artifactId) {
    throw new ExactArtifactReadError("not_found", "Artifact not found or access denied.");
  }
  if (artifact.status !== "available") {
    throw new ExactArtifactReadError("unavailable", "Artifact is not available for readback.");
  }
  try {
    return { artifact, bytes: await readVerifiedArtifact(repository, storage, artifactId) };
  } catch (error) {
    throw new ExactArtifactReadError("integrity_failure",
      error instanceof Error ? error.message : "Artifact integrity verification failed.");
  }
}

export function safeArtifactDownloadName(artifact: ArtifactReservation): string {
  const fallback = `${artifact.artifactType.toLowerCase().replace(/_/g, "-")}-${artifact.id}`;
  const candidate = artifact.originalFilename.trim() || fallback;
  const safe = candidate.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/[\r\n"]/g, "_").slice(0, 180);
  return safe || `${fallback}.bin`;
}

type ArtifactRow = Record<string, unknown>;
function fromRow(row: ArtifactRow): ArtifactReservation {
  return {
    id:String(row.id), ownerId:String(row.created_by), projectId:String(row.project_id),
    documentId:String(row.document_id), documentVersionId:String(row.document_version_id),
    processingGenerationId:row.processing_generation_id ? String(row.processing_generation_id) : null,
    artifactType:row.artifact_type as ArtifactReservation["artifactType"],
    artifactGeneration:Number(row.artifact_generation), status:row.status as ArtifactReservation["status"],
    storageBucket:String(row.storage_bucket), storagePath:String(row.storage_path),
    originalFilename:String(row.original_filename), sha256:String(row.sha256), byteSize:Number(row.byte_size),
    mimeType:String(row.mime_type), producerKind:String(row.producer_kind), producerVersion:String(row.producer_version),
  };
}

class SupabaseExactArtifactRepository implements ExactArtifactRepository {
  private readonly client:SupabaseClient;
  constructor(client: SupabaseClient) { this.client=client; }
  async findScoped(projectId:string,id:string) { const {data,error}=await this.client.from("document_artifacts").select("*").eq("id",id).eq("project_id",projectId).maybeSingle(); if(error)throw new Error(error.message); return data?fromRow(data):null; }
  async find(id:string) { const {data,error}=await this.client.from("document_artifacts").select("*").eq("id",id).maybeSingle(); if(error)throw new Error(error.message); return data?fromRow(data):null; }
  async reserve(_artifact:ArtifactReservation):Promise<ArtifactReservation>{throw new Error("read-only repository");}
  async markUploading(_artifactId:string):Promise<void>{throw new Error("read-only repository");}
  async finalize(_artifactId:string,_sha256:string,_byteSize:number):Promise<ArtifactReservation>{throw new Error("read-only repository");}
  async markFailed(_artifactId:string,_code:string):Promise<void>{throw new Error("read-only repository");}
}

class SupabaseExactArtifactStorage implements ArtifactStorage {
  private readonly client:SupabaseClient;
  constructor(client:SupabaseClient) { this.client=client; }
  async download(bucket:string,path:string){const {data,error}=await this.client.storage.from(bucket).download(path);if(error||!data)return null;return new Uint8Array(await data.arrayBuffer());}
  async upload(_bucket:string,_path:string,_bytes:Uint8Array,_options:{contentType:string;upsert:false}):Promise<void>{throw new Error("read-only storage");}
}

export function createSupabaseExactArtifactAccess(client:SupabaseClient): {
  repository: ExactArtifactRepository; storage: ArtifactStorage;
} {
  return {repository:new SupabaseExactArtifactRepository(client),storage:new SupabaseExactArtifactStorage(client)};
}
