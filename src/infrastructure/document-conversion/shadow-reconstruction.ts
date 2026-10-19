import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type ShadowReconstructionResult = {
  runId: string;
  status: "completed" | "failed";
  sourceSha256: string;
  [key: string]: unknown;
};

export type ShadowEvidenceContext = {
  documentId?: string;
  importId?: string;
  celex?: string;
  activeDocxSha256?: string;
};

function workerRoot() {
  const value = process.env.PDF_TO_DOCX_SERVICE_URL?.trim();
  if (!value) throw new Error("PDF_TO_DOCX_SERVICE_URL is required for shadow reconstruction.");
  const configured = value.replace(/\/$/, "");
  return configured.endsWith("/convert/pdf-to-docx") ? configured.slice(0, -"/convert/pdf-to-docx".length)
    : configured.endsWith("/analyze/pdf") ? configured.slice(0, -"/analyze/pdf".length) : configured;
}

async function writeShadowEvidence(record: Record<string, unknown>) {
  try {
    const directory = process.env.PDF_TO_DOCX_SHADOW_EVIDENCE_DIR?.trim() || path.join(process.cwd(), "artifacts", "shadow-runs");
    await mkdir(directory, { recursive: true });
    const runId = typeof record.shadow_run_id === "string" ? record.shadow_run_id : randomUUID();
    const finalPath = path.join(directory, `${runId}.json`);
    const temporaryPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify({ schema_version: 1, non_authoritative: true, ...record }, null, 2), { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, finalPath);
  } catch (error) {
    console.error("Shadow evidence write failed; active import/conversion is unaffected.", { error: error instanceof Error ? error.message : String(error) });
  }
}

export async function runShadowReconstruction(
  source: Uint8Array,
  filename = "source.pdf",
  context: ShadowEvidenceContext = {},
): Promise<ShadowReconstructionResult | null> {
  if (process.env.PDF_TO_DOCX_SHADOW_RECONSTRUCTION !== "true") return null;

  const startedAt = new Date().toISOString();
  const localRunId = randomUUID();
  const sourceSha256 = createHash("sha256").update(source).digest("hex");
  let serviceUrl: string | undefined;
  try {
    serviceUrl = `${workerRoot()}/shadow/reconstruct`;
    const token = process.env.PDF_TO_DOCX_SERVICE_TOKEN?.trim();
    if (!token) throw new Error("PDF_TO_DOCX_SERVICE_TOKEN is required for shadow reconstruction.");
    const request = new FormData();
    request.set("document", new Blob([Uint8Array.from(source).buffer], { type: "application/pdf" }), filename);
    const response = await fetch(serviceUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      body: request,
      cache: "no-store",
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    const payload = await response.json().catch(() => ({ status: "failed", error: { category: "invalid_response" } }));
    const runId = typeof payload.runId === "string" ? payload.runId : localRunId;
    await writeShadowEvidence({
      shadow_run_id: runId,
      timestamp_started: startedAt,
      timestamp_completed: new Date().toISOString(),
      document_id: context.documentId,
      import_id: context.importId,
      celex: context.celex,
      source_sha256: payload.sourceSha256 || sourceSha256,
      active_docx_sha256: context.activeDocxSha256,
      shadow_docx_sha256: payload.docxSha256,
      shadow_status: response.ok ? payload.status : "failed",
      shadow_validation_status: payload.validationSummary?.textIntegrity?.status ?? payload.validationSummary?.sourceCoverage?.status,
      page_count: payload.typedModelSummary?.pages,
      block_count: payload.typedModelSummary?.blocks,
      line_count: payload.typedModelSummary?.lines,
      span_count: payload.typedModelSummary?.spans,
      normalized_token_count: payload.typedModelSummary?.tokens,
      physical_table_count: payload.reconstructionSummary?.physicalTables,
      logical_table_count: payload.reconstructionSummary?.logicalTables,
      row_count: payload.reconstructionSummary?.rows,
      cell_count: payload.reconstructionSummary?.cells,
      merge_count: payload.reconstructionSummary?.boundaries?.MERGE,
      keep_boundary_count: payload.reconstructionSummary?.boundaries?.KEEP_BOUNDARY,
      abstain_count: payload.reconstructionSummary?.boundaries?.ABSTAIN,
      worker_version: payload.workerVersion,
      reconstruction_version: payload.reconstructionVersion,
      duration_ms: payload.durationMs,
      error_category: payload.error?.category,
    });
    console.info("PDF reconstruction shadow result.", { serviceUrl, status: response.ok ? payload.status : "failed", runId, sourceSha256: payload.sourceSha256, shadowError: payload.error });
    return payload as ShadowReconstructionResult;
  } catch (error) {
    console.error("PDF reconstruction shadow execution failed; active import/conversion is unaffected.", { serviceUrl, error: error instanceof Error ? error.message : String(error) });
    await writeShadowEvidence({
      shadow_run_id: localRunId,
      timestamp_started: startedAt,
      timestamp_completed: new Date().toISOString(),
      document_id: context.documentId,
      import_id: context.importId,
      celex: context.celex,
      source_sha256: sourceSha256,
      active_docx_sha256: context.activeDocxSha256,
      shadow_status: "failed",
      error_category: "transport_or_configuration",
      error_summary: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    });
    return { runId: localRunId, status: "failed", sourceSha256, error: { category: "transport_or_configuration" } };
  }
}
