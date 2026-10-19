"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { segmentLegalDocument } from "@/application/legacy-corpus/segment-legal-document";
import { orchestrateWholeDocumentMk1 } from "@/application/translation/whole-document-mk1-orchestrator";
import {
  createOpenAiMk1Client,
  translateAndPersistSegmentWithMk1,
  type TranslationMemoryReader,
  type TranslationMemoryRpcClient,
} from "@/application/translation/mk1-translation-service";
import type { Mk1PersistenceClient } from "@/application/translation/mk1-persistence";
import { extractDocxLegalText } from "@/infrastructure/document-analysis/extract-docx-legal-text";
import { reconstructMk1Docx } from "@/infrastructure/document-output/reconstruct-mk1-docx";
import { buildTranslationReport, computeReportContentHash, renderTranslationReportDocx } from "@/application/translation/translation-report";
import { analyzeTerminologyWithGpt56 } from "@/application/translation/semantic-terminology-analysis";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";
import type { DocumentActionState } from "./document-actions";

const uuid = z.uuid();
const SOURCE_BUCKET = "source-documents";

export async function translateCompleteDocument(_state: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const user = await getAuthenticatedUser();
  if (!user) return { status: "error", message: "Your session has expired. Sign in and try again." };
  const projectId = uuid.safeParse(formData.get("projectId"));
  const documentId = uuid.safeParse(formData.get("documentId"));
  if (!projectId.success || !documentId.success) return { status: "error", message: "Unable to identify this working document." };
  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase.from("projects").select("id,source_language,target_language").eq("id", projectId.data).maybeSingle();
  const { data: document } = await supabase.from("documents")
    .select("id,title,document_type,celex_number,transformation_status,derived_from_document_id")
    .eq("id", documentId.data).eq("project_id", projectId.data).maybeSingle();
  if (!project || !document || document.document_type?.toLowerCase() !== "docx" || !document.derived_from_document_id || document.transformation_status !== "ready") {
    return { status: "error", message: "Only a ready converted DOCX can be translated." };
  }
  const { data: versions } = await supabase.from("document_versions")
    .select("id,version_number,source_storage_bucket,source_storage_path,source_filename")
    .eq("document_id", document.id).order("version_number", { ascending: false });
  const version = versions?.find((item) => item.source_storage_bucket === SOURCE_BUCKET && item.source_storage_path);
  if (!version?.source_storage_path) return { status: "error", message: "The converted DOCX is not available in private storage." };
  const { data: knowledgeBase } = await supabase.from("translation_knowledge_bases").select("id").eq("owner_id", user.id).maybeSingle();
  if (!knowledgeBase) return { status: "error", message: "Your Translation Knowledge Base is not available." };

  const { data: run, error: runError } = await supabase.from("document_translation_runs").insert({
    document_version_id: version.id, status: "segmenting", created_by: user.id,
  }).select("id").single();
  if (runError || !run) {
    const active = runError?.code === "23505";
    return { status: "error", message: active ? "This DOCX already has an active translation run." : "Unable to start document translation." };
  }

  let translatedCount = 0;
  try {
    let { data: segments, error: segmentLoadError } = await supabase.from("document_segments")
      .select("id,segment_index,source_text").eq("document_version_id", version.id).order("segment_index");
    if (segmentLoadError) throw new Error(`Unable to load document segments: ${segmentLoadError.message}`);
    if (!segments?.length) {
      const { data: storedFile, error: downloadError } = await supabase.storage.from(SOURCE_BUCKET).download(version.source_storage_path);
      if (downloadError || !storedFile) throw new Error(`Unable to read converted DOCX: ${downloadError?.message ?? "empty download"}`);
      const exactText = await extractDocxLegalText(new Uint8Array(await storedFile.arrayBuffer()));
      const proposed = segmentLegalDocument({
        documentId: document.id, documentVersionId: version.id, language: project.source_language,
        role: "source", exactText, celexNumber: document.celex_number ?? undefined,
        provenance: { document_id: document.id, document_version_id: version.id, source_filename: version.source_filename },
      });
      if (!proposed.length) throw new Error("The converted DOCX contains no translatable text.");
      const { data: inserted, error: insertError } = await supabase.from("document_segments").insert(proposed.map((item) => ({
        document_version_id: version.id, segment_index: item.index, segment_type: item.type,
        source_text: item.exactText, chapter_number: item.structuralPath.chapter ?? null,
        article_number: item.structuralPath.article ?? null, paragraph_number: item.structuralPath.paragraph ?? null,
        point_number: item.structuralPath.point ?? null,
      }))).select("id,segment_index,source_text");
      if (insertError || !inserted) throw new Error(`Unable to persist internal document segments: ${insertError?.message ?? "no rows returned"}`);
      segments = inserted.sort((a, b) => a.segment_index - b.segment_index);
      const { error: extractionUpdateError } = await supabase.from("document_versions").update({ raw_text: exactText, extraction_status: "completed" }).eq("id", version.id);
      if (extractionUpdateError) throw new Error(`Unable to record DOCX extraction: ${extractionUpdateError.message}`);
    }
    const { error: translatingError } = await supabase.from("document_translation_runs").update({ status: "translating", total_segments: segments.length }).eq("id", run.id);
    if (translatingError) throw new Error(`Unable to initialize translation progress: ${translatingError.message}`);

    const output = await orchestrateWholeDocumentMk1({
      segments: segments.map((item) => ({ id: item.id, index: item.segment_index, sourceText: item.source_text })),
      translateSegment: async (segment, context) => {
        const generated = await translateAndPersistSegmentWithMk1(
          supabase as unknown as TranslationMemoryReader,
          supabase as unknown as TranslationMemoryRpcClient,
          createOpenAiMk1Client(),
          supabase as unknown as Mk1PersistenceClient,
          segment.id,
          {
            knowledgeBaseId: knowledgeBase.id, sourceLanguage: project.source_language, targetLanguage: project.target_language,
            sourceText: segment.sourceText, previousSourceText: context.previousSourceText, nextSourceText: context.nextSourceText,
            documentTitle: document.title, documentType: document.document_type, celex: document.celex_number,
          },
        );
        return { result: generated, translationVersionId: generated.persistence.translationVersionId };
      },
      onProgress: async (progress, result) => {
        if (result) {
          const { error } = await supabase.from("document_translation_run_segments").insert({
            run_id: run.id, segment_id: result.segmentId, translation_version_id: result.translationVersionId,
            segment_index: result.segmentIndex, qa_status: result.qaStatus,
          });
          if (error) throw new Error(`Unable to record translated segment progress: ${error.message}`);
          translatedCount = progress.translatedSegments;
        }
        const { error } = await supabase.from("document_translation_runs").update({
          translated_segments: progress.translatedSegments, current_segment_index: progress.currentSegmentIndex,
        }).eq("id", run.id);
        if (error) throw new Error(`Unable to update translation progress: ${error.message}`);
      },
    });
    const { error: qaStageError } = await supabase.from("document_translation_runs").update({ status: "document_qa" }).eq("id", run.id);
    if (qaStageError) throw new Error(`Unable to start document QA: ${qaStageError.message}`);
    const { error: completedError } = await supabase.from("document_translation_runs").update({
      status: "completed", translated_segments: output.segments.length, current_segment_index: null,
      document_qa: output.qa, completed_at: new Date().toISOString(), error_message: null,
    }).eq("id", run.id);
    if (completedError) throw new Error(`Unable to finalize document translation: ${completedError.message}`);
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1_500);
    console.error("Whole-document MK1 translation failed.", { projectId: project.id, documentId: document.id, versionId: version.id, runId: run.id, error });
    await supabase.from("document_translation_runs").update({ status: "failed", translated_segments: translatedCount, current_segment_index: null, error_message: message, completed_at: new Date().toISOString() }).eq("id", run.id);
    revalidatePath(`/app/projects/${project.id}`);
    return { status: "error", message: `Document translation stopped after ${translatedCount} segments. Progress and completed drafts were preserved.`, refresh: true };
  }
  revalidatePath(`/app/projects/${project.id}`);
  return { status: "success", message: "Complete DOCX translated to MK1 and document QA finished.", refresh: true };
}

export async function reconstructCompletedMk1Docx(_state: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const user = await getAuthenticatedUser();
  if (!user) return { status: "error", message: "Your session has expired. Sign in and try again." };
  const projectId = uuid.safeParse(formData.get("projectId"));
  const documentId = uuid.safeParse(formData.get("documentId"));
  if (!projectId.success || !documentId.success) return { status: "error", message: "Unable to identify this working document." };
  const supabase = await createSupabaseServerClient();
  const { data: document } = await supabase.from("documents").select("id,project_id,document_type,transformation_status").eq("id", documentId.data).eq("project_id", projectId.data).maybeSingle();
  if (!document || document.document_type?.toLowerCase() !== "docx" || document.transformation_status !== "ready") return { status: "error", message: "Only a ready converted DOCX can produce MK1." };
  const { data: versions } = await supabase.from("document_versions").select("id,source_storage_bucket,source_storage_path,source_filename").eq("document_id", document.id).order("version_number", { ascending: false });
  const version = versions?.find((item) => item.source_storage_bucket === SOURCE_BUCKET && item.source_storage_path);
  if (!version?.source_storage_path) return { status: "error", message: "The converted DOCX is not available in private storage." };
  const { data: run } = await supabase.from("document_translation_runs").select("id,status,total_segments,translated_segments").eq("document_version_id", version.id).eq("status", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle();
  if (!run || run.total_segments !== run.translated_segments) return { status: "error", message: "A complete MK1 translation is required before reconstruction." };
  const { data: existing } = await supabase.from("document_translation_artifacts").select("id,storage_path").eq("run_id", run.id).eq("artifact_type", "mk1_docx").maybeSingle();
  if (existing?.storage_path) return { status: "success", message: "MK1 DOCX is already available.", refresh: true };
  const { data: storedFile, error: downloadError } = await supabase.storage.from(SOURCE_BUCKET).download(version.source_storage_path);
  if (downloadError || !storedFile) return { status: "error", message: `Unable to read converted DOCX: ${downloadError?.message ?? "empty download"}` };
  const { data: runSegments, error: runSegmentsError } = await supabase.from("document_translation_run_segments").select("segment_index,segment_id,translation_version_id").eq("run_id", run.id).order("segment_index");
  if (runSegmentsError || !runSegments?.length) return { status: "error", message: "Unable to load persisted MK1 segment mappings." };
  const segmentIds = runSegments.map((item) => item.segment_id);
  const versionIds = runSegments.map((item) => item.translation_version_id);
  const [{ data: sourceSegments }, { data: targetVersions }] = await Promise.all([
    supabase.from("document_segments").select("id,source_text").in("id", segmentIds),
    supabase.from("translation_versions").select("id,target_text").in("id", versionIds),
  ]);
  const sourceById = new Map((sourceSegments ?? []).map((item) => [item.id, item.source_text]));
  const targetById = new Map((targetVersions ?? []).map((item) => [item.id, item.target_text]));
  if (sourceById.size !== segmentIds.length || targetById.size !== versionIds.length) return { status: "error", message: "MK1 reconstruction mappings are incomplete." };
  let output: Awaited<ReturnType<typeof reconstructMk1Docx>>;
  try {
    output = await reconstructMk1Docx(new Uint8Array(await storedFile.arrayBuffer()), runSegments.map((item) => ({ id: item.segment_id, index: item.segment_index, sourceText: sourceById.get(item.segment_id)!, targetText: targetById.get(item.translation_version_id)! })));
  } catch (error) {
    return { status: "error", message: `MK1 DOCX reconstruction failed safely: ${error instanceof Error ? error.message : String(error)}` };
  }
  const sourceName = version.source_filename ?? "document.docx";
  const filename = sourceName.replace(/\.docx$/i, "") + "_MK1.docx";
  const storagePath = `${user.id}/${projectId.data}/${document.id}/${version.id}/${run.id}/${filename}`;
  const { error: uploadError } = await supabase.storage.from(SOURCE_BUCKET).upload(storagePath, output.bytes, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", upsert: false });
  if (uploadError) return { status: "error", message: `Unable to save MK1 DOCX: ${uploadError.message}` };
  const { error: artifactError } = await supabase.from("document_translation_artifacts").insert({ run_id: run.id, document_version_id: version.id, artifact_type: "mk1_docx", status: "completed", storage_bucket: SOURCE_BUCKET, storage_path: storagePath, filename, segment_count: output.mappedSegmentIds.length, created_by: user.id });
  if (artifactError) { await supabase.storage.from(SOURCE_BUCKET).remove([storagePath]); return { status: "error", message: `Unable to record MK1 DOCX artifact: ${artifactError.message}` }; }
  revalidatePath(`/app/projects/${projectId.data}`);
  return { status: "success", message: "MK1 DOCX reconstructed and saved.", refresh: true };
}

export async function generateTranslationReport(_state: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const user = await getAuthenticatedUser();
  if (!user) return { status: "error", message: "Your session has expired. Sign in and try again." };
  const projectId = uuid.safeParse(formData.get("projectId")); const documentId = uuid.safeParse(formData.get("documentId"));
  if (!projectId.success || !documentId.success) return { status: "error", message: "Unable to identify this working document." };
  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase.from("projects").select("id,source_language,target_language").eq("id", projectId.data).maybeSingle();
  const { data: document } = await supabase.from("documents").select("id,title,celex_number").eq("id", documentId.data).eq("project_id", projectId.data).maybeSingle();
  if (!project || !document) return { status: "error", message: "Document not found or access denied." };
  const { data: version } = await supabase.from("document_versions").select("id,source_filename,characters_without_spaces").eq("document_id", document.id).order("version_number", { ascending: false }).limit(1).maybeSingle();
  if (!version) return { status: "error", message: "Document version not found." };
  const { data: run } = await supabase.from("document_translation_runs").select("id,status,total_segments,translated_segments,started_at,completed_at").eq("document_version_id", version.id).eq("status", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle();
  if (!run || !run.completed_at || run.total_segments !== run.translated_segments) return { status: "error", message: "A completed MK1 run is required." };
  const { data: mappings } = await supabase.from("document_translation_run_segments").select("segment_id,segment_index,translation_version_id").eq("run_id", run.id).order("segment_index");
  if (!mappings?.length || mappings.length !== run.total_segments) return { status: "error", message: "Persisted MK1 mappings are incomplete." };
  const [{ data: sources }, { data: targets }] = await Promise.all([
    supabase.from("document_segments").select("id,source_text").in("id", mappings.map((item) => item.segment_id)),
    supabase.from("translation_versions").select("id,target_text,model_name,prompt_version").in("id", mappings.map((item) => item.translation_version_id)),
  ]);
  const sourceById = new Map((sources ?? []).map((item) => [item.id, item.source_text])); const targetById = new Map((targets ?? []).map((item) => [item.id, item]));
  if (sourceById.size !== mappings.length || targetById.size !== mappings.length) return { status: "error", message: "Report inputs are incomplete." };
  const { data: evidence } = await supabase.from("translation_evidence").select("translation_version_id,metadata").in("translation_version_id", mappings.map((item) => item.translation_version_id)).eq("evidence_type", "generation_metadata");
  let inputTokens = 0; let outputTokens = 0;
  for (const item of evidence ?? []) { const usage = (item.metadata as { token_usage?: { prompt_tokens?: number; completion_tokens?: number } } | null)?.token_usage; inputTokens += usage?.prompt_tokens ?? 0; outputTokens += usage?.completion_tokens ?? 0; }
  const reportSegments = mappings.map((item) => ({ id: item.segment_id, index: item.segment_index, sourceText: sourceById.get(item.segment_id)!, targetText: targetById.get(item.translation_version_id)!.target_text, translationVersionId: item.translation_version_id }));
  const expectedContentHash = computeReportContentHash(reportSegments);
  const { data: existing } = await supabase.from("document_translation_artifacts").select("id,storage_bucket,storage_path,content_hash").eq("run_id", run.id).eq("artifact_type", "translation_report_docx").maybeSingle();
  if (existing?.content_hash === expectedContentHash) return { status: "success", message: "Translation report is already current.", refresh: true };
  let semanticAnalysis;
  try { semanticAnalysis = await analyzeTerminologyWithGpt56(reportSegments); }
  catch (error) { return { status: "error", message: `Terminology analysis failed safely: ${error instanceof Error ? error.message : String(error)}` }; }
  const report = buildTranslationReport({ document: version.source_filename ?? document.title, celex: document.celex_number, sourceLanguage: project.source_language, targetLanguage: project.target_language, model: targets?.[0]?.model_name ?? "unknown", promptVersion: targets?.[0]?.prompt_version ?? "unknown", startedAt: run.started_at, completedAt: run.completed_at, inputTokens, outputTokens, translationPages: Number(version.characters_without_spaces ?? 0) / 1500 }, reportSegments, semanticAnalysis);
  const bytes = await renderTranslationReportDocx(report); const base = (version.source_filename ?? document.title).replace(/\.docx$/i, ""); const filename = `${base}_Translation_Terminology_Report.docx`;
  const storagePath = `${user.id}/${project.id}/${document.id}/${version.id}/${run.id}/reports/${report.contentHash.slice(0, 16)}-${filename}`;
  const { error: uploadError } = await supabase.storage.from(SOURCE_BUCKET).upload(storagePath, bytes, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", upsert: false });
  if (uploadError) return { status: "error", message: `Unable to save report: ${uploadError.message}` };
  const values = { run_id: run.id, document_version_id: version.id, artifact_type: "translation_report_docx", status: "completed", storage_bucket: SOURCE_BUCKET, storage_path: storagePath, filename, segment_count: mappings.length, created_by: user.id, content_hash: report.contentHash };
  const { error: saveError } = existing ? await supabase.from("document_translation_artifacts").update(values).eq("id", existing.id) : await supabase.from("document_translation_artifacts").insert(values);
  if (saveError) { await supabase.storage.from(SOURCE_BUCKET).remove([storagePath]); return { status: "error", message: `Unable to record report artifact: ${saveError.message}` }; }
  if (existing?.storage_path && existing.storage_path !== storagePath) await supabase.storage.from(existing.storage_bucket).remove([existing.storage_path]);
  revalidatePath(`/app/projects/${project.id}`); return { status: "success", message: "Translation & Terminology Report generated.", refresh: true };
}
