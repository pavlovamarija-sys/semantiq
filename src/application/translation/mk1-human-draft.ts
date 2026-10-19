import { runDeterministicLegalQa, type LegalQaResult } from "./deterministic-legal-qa.ts";

export type HumanDraftPersistenceClient = {
  rpc(name: "persist_human_translation_draft", args: Record<string, unknown>): Promise<{
    data: Array<{ translation_id: string; translation_version_id: string; saved_at: string }> | null;
    error: { message: string } | null;
  }>;
};

export type SavedHumanDraft = {
  translationId: string;
  translationVersionId: string;
  savedAt: string;
  qa: LegalQaResult;
};

export async function appendHumanEditedDraft(
  client: HumanDraftPersistenceClient,
  input: { segmentId: string; targetLanguage: string; sourceText: string; targetText: string },
): Promise<SavedHumanDraft> {
  const targetText = input.targetText.trim();
  if (!input.segmentId || !input.targetLanguage || !input.sourceText.trim() || !targetText) {
    throw new Error("Segment, language pair, source text and edited target text are required.");
  }
  const qa = runDeterministicLegalQa(input.sourceText, targetText);
  const response = await client.rpc("persist_human_translation_draft", {
    requested_segment_id: input.segmentId,
    requested_target_language: input.targetLanguage,
    edited_target_text: targetText,
    qa_result: qa,
  });
  if (response.error) throw new Error(`Human draft persistence failed: ${response.error.message}`);
  const saved = response.data?.[0];
  if (!saved) throw new Error("Human draft persistence did not return a translation version.");
  return {
    translationId: saved.translation_id,
    translationVersionId: saved.translation_version_id,
    savedAt: saved.saved_at,
    qa,
  };
}
