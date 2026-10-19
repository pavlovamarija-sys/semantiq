"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appendHumanEditedDraft, type HumanDraftPersistenceClient } from "@/application/translation/mk1-human-draft";
import { approveTranslatorDraft, type ApprovalPersistenceClient } from "@/application/translation/approve-translator-draft";
import {
  createOpenAiMk1Client,
  translateAndPersistSegmentWithMk1,
  type TranslationMemoryReader,
  type TranslationMemoryRpcClient,
} from "@/application/translation/mk1-translation-service";
import type { Mk1PersistenceClient } from "@/application/translation/mk1-persistence";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";

export type TranslatorActionState = { status: "idle" | "success" | "error"; message?: string };
const idSchema = z.uuid();
const targetSchema = z.string().trim().min(1, "Enter a Macedonian draft before saving.").max(100_000, "The draft is too large to save as one segment.");

async function loadOwnedSegment(projectId: string, segmentId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: segment } = await supabase.from("document_segments")
    .select("id,document_version_id,segment_index,source_text")
    .eq("id", segmentId).maybeSingle();
  if (!segment) return null;
  const { data: version } = await supabase.from("document_versions").select("id,document_id").eq("id", segment.document_version_id).maybeSingle();
  if (!version) return null;
  const { data: document } = await supabase.from("documents").select("id,project_id").eq("id", version.document_id).eq("project_id", projectId).maybeSingle();
  if (!document) return null;
  const { data: project } = await supabase.from("projects").select("id,source_language,target_language").eq("id", projectId).maybeSingle();
  if (!project) return null;
  const { data: neighbors } = await supabase.from("document_segments").select("segment_index,source_text")
    .eq("document_version_id", segment.document_version_id)
    .in("segment_index", [segment.segment_index - 1, segment.segment_index + 1]);
  return {
    supabase, segment, project,
    previousSourceText: neighbors?.find((row) => row.segment_index === segment.segment_index - 1)?.source_text ?? null,
    nextSourceText: neighbors?.find((row) => row.segment_index === segment.segment_index + 1)?.source_text ?? null,
  };
}

function parseIds(formData: FormData) {
  const projectId = idSchema.safeParse(formData.get("projectId"));
  const segmentId = idSchema.safeParse(formData.get("segmentId"));
  return projectId.success && segmentId.success ? { projectId: projectId.data, segmentId: segmentId.data } : null;
}

export async function generateMk1Action(_state: TranslatorActionState, formData: FormData): Promise<TranslatorActionState> {
  const user = await getAuthenticatedUser();
  if (!user) return { status: "error", message: "Your session has expired. Sign in and try again." };
  const ids = parseIds(formData);
  if (!ids) return { status: "error", message: "Unable to identify this translation segment." };
  const owned = await loadOwnedSegment(ids.projectId, ids.segmentId);
  if (!owned) return { status: "error", message: "Segment not found or you do not have access to it." };
  const { data: knowledgeBase } = await owned.supabase.from("translation_knowledge_bases").select("id").eq("owner_id", user.id).maybeSingle();
  if (!knowledgeBase) return { status: "error", message: "Your Translation Knowledge Base is not available." };
  try {
    await translateAndPersistSegmentWithMk1(
      owned.supabase as unknown as TranslationMemoryReader,
      owned.supabase as unknown as TranslationMemoryRpcClient,
      createOpenAiMk1Client(),
      owned.supabase as unknown as Mk1PersistenceClient,
      owned.segment.id,
      {
        knowledgeBaseId: knowledgeBase.id,
        sourceLanguage: owned.project.source_language,
        targetLanguage: owned.project.target_language,
        sourceText: owned.segment.source_text,
        previousSourceText: owned.previousSourceText,
        nextSourceText: owned.nextSourceText,
      },
    );
  } catch (error) {
    console.error("MK1 segment generation failed.", { projectId: ids.projectId, segmentId: ids.segmentId, error });
    return { status: "error", message: "MK1 generation failed. No draft was saved." };
  }
  revalidatePath(`/app/projects/${ids.projectId}/segments/${ids.segmentId}`);
  return { status: "success", message: "A new unreviewed MK1 version was generated." };
}

export async function saveEditedDraftAction(_state: TranslatorActionState, formData: FormData): Promise<TranslatorActionState> {
  const user = await getAuthenticatedUser();
  if (!user) return { status: "error", message: "Your session has expired. Sign in and try again." };
  const ids = parseIds(formData);
  const targetText = targetSchema.safeParse(formData.get("targetText"));
  if (!ids) return { status: "error", message: "Unable to identify this translation segment." };
  if (!targetText.success) return { status: "error", message: targetText.error.issues[0]?.message ?? "Enter a valid draft." };
  const owned = await loadOwnedSegment(ids.projectId, ids.segmentId);
  if (!owned) return { status: "error", message: "Segment not found or you do not have access to it." };
  try {
    await appendHumanEditedDraft(owned.supabase as unknown as HumanDraftPersistenceClient, {
      segmentId: owned.segment.id,
      sourceText: owned.segment.source_text,
      targetLanguage: owned.project.target_language,
      targetText: targetText.data,
    });
  } catch (error) {
    console.error("Human translation draft save failed.", { projectId: ids.projectId, segmentId: ids.segmentId, error });
    return { status: "error", message: "The edited draft could not be saved. No version was added." };
  }
  revalidatePath(`/app/projects/${ids.projectId}/segments/${ids.segmentId}`);
  return { status: "success", message: "Edited draft saved as a new human version." };
}

export async function approveTranslatorDraftAction(_state: TranslatorActionState, formData: FormData): Promise<TranslatorActionState> {
  const user = await getAuthenticatedUser();
  if (!user) return { status: "error", message: "Your session has expired. Sign in and try again." };
  const ids = parseIds(formData);
  const versionId = idSchema.safeParse(formData.get("translationVersionId"));
  if (!ids || !versionId.success) return { status: "error", message: "Select a specific translator draft version to approve." };
  const owned = await loadOwnedSegment(ids.projectId, ids.segmentId);
  if (!owned) return { status: "error", message: "Segment not found or you do not have access to it." };
  try {
    await approveTranslatorDraft(owned.supabase as unknown as ApprovalPersistenceClient, versionId.data);
  } catch (error) {
    console.error("Translator draft approval failed.", { projectId: ids.projectId, segmentId: ids.segmentId, versionId: versionId.data, error });
    const message = error instanceof Error && error.message.includes("Deterministic QA")
      ? "Approval blocked: resolve all deterministic QA errors and save a new translator draft."
      : "This version could not be approved. It may not be an unreviewed translator draft, or it may already be approved.";
    return { status: "error", message };
  }
  revalidatePath(`/app/projects/${ids.projectId}/segments/${ids.segmentId}`);
  return { status: "success", message: "Translator draft approved and added to human-approved Translation Memory." };
}
