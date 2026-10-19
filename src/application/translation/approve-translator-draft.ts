export type ApprovalPersistenceClient = {
  rpc(name: "approve_translator_draft", args: { requested_translation_version_id: string }): Promise<{
    data: Array<{ translation_id: string; translation_version_id: string; approved_tm_unit_id: string; approved_at: string }> | null;
    error: { message: string } | null;
  }>;
};

export type ApprovedTranslatorDraft = {
  translationId: string;
  translationVersionId: string;
  approvedTmUnitId: string;
  approvedAt: string;
};

export async function approveTranslatorDraft(client: ApprovalPersistenceClient, translationVersionId: string): Promise<ApprovedTranslatorDraft> {
  if (!translationVersionId) throw new Error("An explicit translator draft version is required for approval.");
  const response = await client.rpc("approve_translator_draft", { requested_translation_version_id: translationVersionId });
  if (response.error) throw new Error(`Translator draft approval failed: ${response.error.message}`);
  const approved = response.data?.[0];
  if (!approved) throw new Error("Translator draft approval returned no approved version.");
  return {
    translationId: approved.translation_id,
    translationVersionId: approved.translation_version_id,
    approvedTmUnitId: approved.approved_tm_unit_id,
    approvedAt: approved.approved_at,
  };
}
