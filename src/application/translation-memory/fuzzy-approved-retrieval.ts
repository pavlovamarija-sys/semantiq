import {
  normalizeExactLookupText,
  type ExactTranslationMemoryQuery,
} from "./exact-approved-retrieval.ts";

export type FuzzyTranslationMemoryQuery = ExactTranslationMemoryQuery & {
  minimumSimilarity?: number;
};

export type FuzzyTranslationMemoryMatch = {
  sourceText: string;
  targetText: string;
  celex: string | null;
  provenance: Record<string, unknown>;
  sourceKind: "legacy_import";
  alignmentConfidence: number;
  originalTmxTuId: string;
  similarity: number;
};

type RpcRow = {
  source_text: string;
  target_text: string;
  celex: string | null;
  provenance: Record<string, unknown>;
  source_kind: "legacy_import";
  alignment_confidence: number | string;
  original_tmx_tu_id: string;
  similarity: number | string;
};

type RpcClient = {
  rpc(name: "search_approved_legacy_tm_fuzzy", args: Record<string, unknown>): Promise<{
    data: RpcRow[] | null;
    error: { message: string } | null;
  }>;
};

export async function findFuzzyApprovedTranslationMemory(
  client: RpcClient,
  query: FuzzyTranslationMemoryQuery,
): Promise<FuzzyTranslationMemoryMatch[]> {
  const normalizedSource = normalizeExactLookupText(query.sourceText);
  if (!query.knowledgeBaseId || !query.sourceLanguage || !query.targetLanguage || !normalizedSource) return [];
  const threshold = query.minimumSimilarity ?? 0.70;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new RangeError("minimumSimilarity must be between 0 and 1");

  const response = await client.rpc("search_approved_legacy_tm_fuzzy", {
    requested_knowledge_base_id: query.knowledgeBaseId,
    requested_source_language: query.sourceLanguage,
    requested_target_language: query.targetLanguage,
    requested_source_text: normalizedSource,
    minimum_similarity: threshold,
    result_limit: 5,
  });
  if (response.error) throw new Error(`Approved fuzzy translation-memory lookup failed: ${response.error.message}`);

  return (response.data ?? []).slice(0, 5).map((row) => ({
    sourceText: row.source_text,
    targetText: row.target_text,
    celex: row.celex,
    provenance: row.provenance,
    sourceKind: row.source_kind,
    alignmentConfidence: Number(row.alignment_confidence),
    originalTmxTuId: row.original_tmx_tu_id,
    similarity: Number(row.similarity),
  }));
}
