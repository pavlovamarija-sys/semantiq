import type { Mk1SegmentInput, Mk1TranslationResult } from "./mk1-translation-service.ts";

export type PersistedMk1 = {
  translationId: string;
  translationVersionId: string;
  generatedAt: string;
};

type PersistenceRow = {
  translation_id: string;
  translation_version_id: string;
  generated_at: string;
};

export type Mk1PersistenceClient = {
  rpc(name: "persist_generated_mk1", args: Record<string, unknown>): Promise<{
    data: PersistenceRow[] | null;
    error: { message: string } | null;
  }>;
};

export async function persistGeneratedMk1(
  client: Mk1PersistenceClient,
  segmentId: string,
  input: Mk1SegmentInput,
  result: Mk1TranslationResult,
): Promise<PersistedMk1> {
  if (!segmentId) throw new Error("A document segment ID is required to persist MK1.");
  const response = await client.rpc("persist_generated_mk1", {
    requested_segment_id: segmentId,
    requested_target_language: input.targetLanguage,
    generated_target_text: result.mk1,
    generation_model: result.metadata.model,
    generation_prompt_version: result.metadata.promptVersion,
    generation_token_usage: result.metadata.tokens ?? {},
    generation_latency_ms: result.metadata.latencyMs,
    tm_evidence: {
      exactApprovedTm: result.evidence.exactApprovedTm,
      strongFuzzyApprovedTm: result.evidence.strongFuzzyApprovedTm,
    },
    qa_result: result.qa,
  });
  if (response.error) throw new Error(`MK1 persistence failed: ${response.error.message}`);
  const saved = response.data?.[0];
  if (!saved) throw new Error("MK1 persistence did not return a translation version.");
  return { translationId: saved.translation_id, translationVersionId: saved.translation_version_id, generatedAt: saved.generated_at };
}
