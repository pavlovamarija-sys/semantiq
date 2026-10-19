import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { calculateByteIntegrity, verifyByteIntegrity } from "./artifact-integrity.ts";
import {
  uploadAndVerifyReservedArtifact, type ArtifactRepository, type ArtifactReservation, type ArtifactStorage,
} from "./immutable-artifact-service.ts";

export const RECONSTRUCTION_ALGORITHM_VERSION = "typed-reconstruction-phase6a-inactive";
export const RECONSTRUCTION_MODEL_SCHEMA_VERSION = "eu-acquis.reconstruction-model.v1";

export interface ReconstructionGenerationRequest {
  projectId: string; documentId: string; documentVersionId: string;
  sourceArtifactId: string; userId: string; requestKey: string;
  config?: Readonly<Record<string, unknown>>;
}

export interface ReconstructionGenerationResult {
  generationId: string; modelArtifactId: string; sourceArtifactId: string;
  modelSha256: string; modelByteSize: number; alreadyCompleted: boolean;
  metrics: ReconstructionMetrics;
}

export interface ReconstructionMetrics {
  pages: number; blocks: number; lines: number; spans: number; normalizedTokens: number;
  nodes: number; physicalTables: number; logicalTables: number; rows: number; cells: number;
  merge: number; keepBoundary: number; abstain: number; diagnostics: number;
}

type SourceArtifact = {
  id: string; project_id: string; document_id: string; document_version_id: string;
  storage_bucket: string; storage_path: string; sha256: string; byte_size: number;
  status: string; artifact_type: string;
};

type GenerationRow = { id: string; status: string };

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]));
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function reconstructionConfigIdentity(config: Readonly<Record<string, unknown>>): string {
  return createHash("sha256").update(stableJson(config)).digest("hex");
}

export function reconstructionRequestIdentity(input: {
  projectId: string; sourceArtifactId: string; sourceSha256: string;
  algorithmVersion: string; configSha256: string; requestKey: string;
}): { idempotencyKey: string; inputFingerprintSha256: string } {
  if (!input.requestKey.trim()) throw new Error("reconstruction requestKey is required");
  const fingerprint = createHash("sha256").update(stableJson({ sourceArtifactId: input.sourceArtifactId,
    sourceSha256: input.sourceSha256, algorithmVersion: input.algorithmVersion,
    configSha256: input.configSha256 })).digest("hex");
  const logical = createHash("sha256").update(stableJson({ projectId: input.projectId,
    fingerprint, requestKey: input.requestKey })).digest("hex");
  return { idempotencyKey: `pdf-reconstruction:${logical}`, inputFingerprintSha256: fingerprint };
}

function assertPdf(bytes: Uint8Array): void {
  if (bytes.byteLength < 5 || new TextDecoder("ascii").decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw new Error("registered source object is not a PDF");
  }
}

function requiredWorkerEnvironment(name: "PDF_TO_DOCX_SERVICE_URL" | "PDF_TO_DOCX_SERVICE_TOKEN"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for reconstruction persistence`);
  return value;
}

async function invokeWorker(bytes: Uint8Array, input: {
  generationId: string; sourceArtifactId: string; sourceSha256: string; configSha256: string;
}): Promise<{ bytes: Uint8Array; metrics: ReconstructionMetrics }> {
  const form = new FormData();
  form.set("document", new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" }), "source.pdf");
  form.set("generation_id", input.generationId); form.set("source_artifact_id", input.sourceArtifactId);
  form.set("source_sha256", input.sourceSha256); form.set("config_sha256", input.configSha256);
  const response = await fetch(`${requiredWorkerEnvironment("PDF_TO_DOCX_SERVICE_URL").replace(/\/$/, "")}/reconstruct/model`, {
    method: "POST", headers: { Authorization: `Bearer ${requiredWorkerEnvironment("PDF_TO_DOCX_SERVICE_TOKEN")}` }, body: form,
  });
  if (!response.ok) throw new Error(`reconstruction worker failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const modelBytes = new Uint8Array(await response.arrayBuffer());
  const parsed = JSON.parse(new TextDecoder().decode(modelBytes)) as Record<string, unknown>;
  if (parsed.schemaVersion !== RECONSTRUCTION_MODEL_SCHEMA_VERSION || parsed.generationId !== input.generationId
      || parsed.configurationSha256 !== input.configSha256 || parsed.algorithmVersion !== RECONSTRUCTION_ALGORITHM_VERSION) {
    throw new Error("reconstruction worker returned a mismatched model identity");
  }
  const source = parsed.sourceArtifact as Record<string, unknown> | undefined;
  if (source?.artifactId !== input.sourceArtifactId || source.sha256 !== input.sourceSha256
      || (parsed.validation as Record<string, unknown> | undefined)?.status !== "PASS") {
    throw new Error("reconstruction model failed source or validation identity checks");
  }
  return { bytes: modelBytes, metrics: parsed.metrics as unknown as ReconstructionMetrics };
}

class SupabaseArtifactRepository implements ArtifactRepository {
  private readonly supabase: SupabaseClient;
  constructor(supabase: SupabaseClient) { this.supabase = supabase; }
  async reserve(a: ArtifactReservation) {
    const row = toArtifactRow(a); const { error } = await this.supabase.from("document_artifacts").insert(row);
    if (!error) return a;
    const { data, error: lookupError } = await this.supabase.from("document_artifacts").select("*").eq("id", a.id).maybeSingle();
    if (lookupError || !data) throw new Error(`model artifact reservation failed: ${error.message}`);
    return fromArtifactRow(data);
  }
  async markUploading(id: string) { const { error } = await this.supabase.from("document_artifacts").update({ status: "uploading" }).eq("id", id).eq("status", "reserved"); if (error) throw new Error(error.message); }
  async finalize(_artifactId: string, _expectedSha256: string, _expectedByteSize: number): Promise<ArtifactReservation> {
    throw new Error("reconstruction artifacts finalize only through the atomic completion RPC");
  }
  async markFailed(id: string, code: string) { const { error } = await this.supabase.from("document_artifacts").update({ status: "failed", failure_code: code }).eq("id", id).in("status", ["reserved", "uploading"]); if (error) throw new Error(error.message); }
  async find(id: string) { const { data, error } = await this.supabase.from("document_artifacts").select("*").eq("id", id).maybeSingle(); if (error) throw new Error(error.message); return data ? fromArtifactRow(data) : null; }
}

class SupabaseArtifactStorage implements ArtifactStorage {
  private readonly supabase: SupabaseClient;
  constructor(supabase: SupabaseClient) { this.supabase = supabase; }
  async upload(bucket: string, path: string, bytes: Uint8Array, options: { contentType: string; upsert: false }) { const { error } = await this.supabase.storage.from(bucket).upload(path, bytes, options); if (error) throw new Error(error.message); }
  async download(bucket: string, path: string) { const { data, error } = await this.supabase.storage.from(bucket).download(path); if (error || !data) return null; return new Uint8Array(await data.arrayBuffer()); }
}

function toArtifactRow(a: ArtifactReservation) { return { id:a.id,project_id:a.projectId,document_id:a.documentId,document_version_id:a.documentVersionId,processing_generation_id:a.processingGenerationId,artifact_type:a.artifactType,artifact_generation:a.artifactGeneration,status:a.status,storage_bucket:a.storageBucket,storage_path:a.storagePath,original_filename:a.originalFilename,sha256:a.sha256,byte_size:a.byteSize,mime_type:a.mimeType,producer_kind:a.producerKind,producer_version:a.producerVersion,created_by:a.ownerId }; }
function fromArtifactRow(a: Record<string, unknown>): ArtifactReservation { return { id:String(a.id),ownerId:String(a.created_by),projectId:String(a.project_id),documentId:String(a.document_id),documentVersionId:String(a.document_version_id),processingGenerationId:a.processing_generation_id ? String(a.processing_generation_id) : null,artifactType:a.artifact_type as ArtifactReservation["artifactType"],artifactGeneration:Number(a.artifact_generation),status:a.status as ArtifactReservation["status"],storageBucket:String(a.storage_bucket),storagePath:String(a.storage_path),originalFilename:String(a.original_filename),sha256:String(a.sha256),byteSize:Number(a.byte_size),mimeType:String(a.mime_type),producerKind:String(a.producer_kind),producerVersion:String(a.producer_version) }; }

export async function runReconstructionGeneration(
  supabase: SupabaseClient, request: ReconstructionGenerationRequest,
  worker: typeof invokeWorker = invokeWorker,
): Promise<ReconstructionGenerationResult> {
  const { data: source, error: sourceError } = await supabase.from("document_artifacts").select("*")
    .eq("id", request.sourceArtifactId).eq("project_id", request.projectId).eq("document_id", request.documentId)
    .eq("document_version_id", request.documentVersionId).eq("artifact_type", "SOURCE_PDF").eq("status", "available").maybeSingle();
  if (sourceError || !source) throw new Error("exact registered SOURCE_PDF is unavailable or outside the requested scope");
  const sourceArtifact = source as SourceArtifact;
  const config = stableValue(request.config ?? {}) as Record<string, unknown>;
  const configSha256 = reconstructionConfigIdentity(config);
  const identity = reconstructionRequestIdentity({ projectId:request.projectId,sourceArtifactId:sourceArtifact.id,
    sourceSha256:sourceArtifact.sha256,algorithmVersion:RECONSTRUCTION_ALGORITHM_VERSION,configSha256,requestKey:request.requestKey });
  const { data: prior } = await supabase.from("processing_generations").select("id,status")
    .eq("project_id", request.projectId).eq("generation_kind", "pdf_reconstruction")
    .eq("idempotency_key", identity.idempotencyKey).maybeSingle();
  if (prior?.status === "completed") return await completedResult(supabase, prior.id, sourceArtifact.id, true);
  if (prior && ["pending","running","validating"].includes(prior.status)) throw new Error("matching reconstruction generation is already active");
  const generationId = randomUUID();
  const { data: latest } = await supabase.from("processing_generations").select("generation_number")
    .eq("document_version_id", request.documentVersionId).eq("generation_kind", "pdf_reconstruction")
    .order("generation_number", { ascending:false }).limit(1).maybeSingle();
  const generationNumber = Number(latest?.generation_number ?? 0) + 1;
  const { error: generationError } = await supabase.from("processing_generations").insert({ id:generationId,
    project_id:request.projectId,document_id:request.documentId,document_version_id:request.documentVersionId,
    generation_kind:"pdf_reconstruction",generation_number:generationNumber,idempotency_key:identity.idempotencyKey,
    input_fingerprint_sha256:identity.inputFingerprintSha256,status:"pending",producer_kind:"pdf_to_docx_worker",
    producer_version:"1.0.0",algorithm_version:RECONSTRUCTION_ALGORITHM_VERSION,config_sha256:configSha256,
    config,created_by:request.userId });
  if (generationError) {
    const { data: raced } = await supabase.from("processing_generations").select("id,status")
      .eq("project_id",request.projectId).eq("generation_kind","pdf_reconstruction").eq("idempotency_key",identity.idempotencyKey).maybeSingle();
    if (raced?.status === "completed") return await completedResult(supabase,raced.id,sourceArtifact.id,true);
    throw new Error(`reconstruction generation reservation failed: ${generationError.message}`);
  }
  try {
    const { error: inputError } = await supabase.from("processing_generation_inputs").insert({ generation_id:generationId,
      project_id:request.projectId,artifact_id:sourceArtifact.id,input_role:"source_pdf",input_ordinal:0,expected_sha256:sourceArtifact.sha256 });
    if (inputError) throw new Error(`generation input binding failed: ${inputError.message}`);
    await transition(supabase,generationId,"pending",{status:"running",started_at:new Date().toISOString()});
    const sourceBytes = await new SupabaseArtifactStorage(supabase).download(sourceArtifact.storage_bucket,sourceArtifact.storage_path);
    if (!sourceBytes) throw new Error("registered SOURCE_PDF storage object is missing");
    assertPdf(sourceBytes); verifyByteIntegrity(sourceBytes,{sha256:sourceArtifact.sha256,byteSize:Number(sourceArtifact.byte_size)});
    const reconstructed = await worker(sourceBytes,{generationId,sourceArtifactId:sourceArtifact.id,sourceSha256:sourceArtifact.sha256,configSha256});
    await transition(supabase,generationId,"running",{status:"validating"});
    const freshBytes = await new SupabaseArtifactStorage(supabase).download(sourceArtifact.storage_bucket,sourceArtifact.storage_path);
    if (!freshBytes) throw new Error("SOURCE_PDF disappeared before model finalization");
    verifyByteIntegrity(freshBytes,{sha256:sourceArtifact.sha256,byteSize:Number(sourceArtifact.byte_size)});
    const modelArtifactId=randomUUID();
    const { data: latestArtifact }=await supabase.from("document_artifacts").select("artifact_generation")
      .eq("document_version_id",request.documentVersionId).eq("artifact_type","RECONSTRUCTION_MODEL")
      .order("artifact_generation",{ascending:false}).limit(1).maybeSingle();
    const repository=new SupabaseArtifactRepository(supabase), storage=new SupabaseArtifactStorage(supabase);
    const uploaded=await uploadAndVerifyReservedArtifact(repository,storage,{id:modelArtifactId,ownerId:request.userId,
      projectId:request.projectId,documentId:request.documentId,documentVersionId:request.documentVersionId,
      processingGenerationId:generationId,artifactType:"RECONSTRUCTION_MODEL",artifactGeneration:Number(latestArtifact?.artifact_generation??0)+1,
      originalFilename:"reconstruction-model.json",mimeType:"application/json",producerKind:"pdf_to_docx_worker",
      producerVersion:"1.0.0",bytes:reconstructed.bytes});
    const { error: completeError }=await supabase.rpc("complete_reconstruction_generation",{p_generation_id:generationId,
      p_source_artifact_id:sourceArtifact.id,p_model_artifact_id:uploaded.id,p_expected_sha256:uploaded.sha256,
      p_expected_byte_size:uploaded.byteSize,p_metrics:reconstructed.metrics});
    if(completeError) throw new Error(`atomic reconstruction completion failed: ${completeError.message}`);
    return {generationId,modelArtifactId:uploaded.id,sourceArtifactId:sourceArtifact.id,modelSha256:uploaded.sha256,
      modelByteSize:uploaded.byteSize,alreadyCompleted:false,metrics:reconstructed.metrics};
  } catch(error) {
    await supabase.from("processing_generations").update({status:"failed",error_code:"reconstruction_failed",
      error_summary:error instanceof Error?error.message.slice(0,500):"unknown reconstruction failure",completed_at:new Date().toISOString()})
      .eq("id",generationId).in("status",["pending","running","validating"]);
    throw error;
  }
}

async function transition(supabase:SupabaseClient,id:string,expected:string,changes:Record<string,unknown>){const {error}=await supabase.from("processing_generations").update(changes).eq("id",id).eq("status",expected);if(error)throw new Error(error.message);}
async function completedResult(supabase:SupabaseClient,generationId:string,sourceArtifactId:string,alreadyCompleted:boolean):Promise<ReconstructionGenerationResult>{const {data,error}=await supabase.from("document_artifacts").select("id,sha256,byte_size").eq("processing_generation_id",generationId).eq("artifact_type","RECONSTRUCTION_MODEL").eq("status","available").single();if(error||!data)throw new Error("completed reconstruction generation has no available model");const {data:g,error:ge}=await supabase.from("processing_generations").select("*").eq("id",generationId).single();if(ge||!g)throw new Error("completed reconstruction generation is unavailable");return{generationId,modelArtifactId:data.id,sourceArtifactId,modelSha256:data.sha256,modelByteSize:Number(data.byte_size),alreadyCompleted,metrics:{pages:g.page_count,blocks:g.block_count,lines:g.line_count,spans:g.span_count,normalizedTokens:g.normalized_token_count,nodes:0,physicalTables:g.physical_table_count,logicalTables:g.logical_table_count,rows:g.row_count,cells:g.cell_count,merge:g.merge_count,keepBoundary:g.keep_boundary_count,abstain:g.abstain_count,diagnostics:0}};}
