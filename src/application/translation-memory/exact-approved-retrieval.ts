import { createHash } from "node:crypto";

export type ExactTranslationMemoryQuery = {
  knowledgeBaseId: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceText: string;
};

export type ExactTranslationMemoryMatch = {
  targetText: string;
  celex: string | null;
  provenance: Record<string, unknown>;
  sourceKind: "legacy_import";
  alignmentConfidence: number;
  originalTmxTuId: string;
};

type Row = {
  target_text: string;
  celex: string | null;
  provenance: Record<string, unknown>;
  source_kind: "legacy_import";
  alignment_confidence: number | string;
  original_tmx_tu_id: string;
  source_text: string;
};

type QueryBuilder = PromiseLike<{ data: Row[] | null; error: { message: string } | null }> & {
  eq(column: string, value: string): QueryBuilder;
  in(column: string, values: string[]): QueryBuilder;
  select(columns: string): QueryBuilder;
};

type SupabaseReader = {
  from(table: "approved_translation_memory_units"): QueryBuilder;
};

/**
 * Normalize only representation-level whitespace. Legal characters and word
 * order remain untouched; matching is still confirmed against normalized text.
 */
export function normalizeExactLookupText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function hash(value: string): string {
  return createHash("md5").update(value, "utf8").digest("hex");
}

export async function findExactApprovedTranslationMemory(
  reader: SupabaseReader,
  query: ExactTranslationMemoryQuery,
): Promise<ExactTranslationMemoryMatch[]> {
  const normalizedSource = normalizeExactLookupText(query.sourceText);
  if (!query.knowledgeBaseId || !query.sourceLanguage || !query.targetLanguage || !normalizedSource) return [];

  const hashes = [...new Set([hash(query.sourceText), hash(normalizedSource)])];
  const response = await reader
    .from("approved_translation_memory_units")
    .select("target_text,celex,provenance,source_kind,alignment_confidence,original_tmx_tu_id,source_text")
    .eq("knowledge_base_id", query.knowledgeBaseId)
    .eq("source_language", query.sourceLanguage)
    .eq("target_language", query.targetLanguage)
    .eq("source_kind", "legacy_import")
    .eq("trust_status", "approved")
    .eq("audit_status", "valid")
    .eq("alignment_audit_status", "alignment_valid")
    .in("source_text_hash", hashes);

  if (response.error) throw new Error(`Approved translation-memory lookup failed: ${response.error.message}`);

  return (response.data ?? [])
    .filter((row) => normalizeExactLookupText(row.source_text) === normalizedSource)
    .map((row) => ({
      targetText: row.target_text,
      celex: row.celex,
      provenance: row.provenance,
      sourceKind: row.source_kind,
      alignmentConfidence: Number(row.alignment_confidence),
      originalTmxTuId: row.original_tmx_tu_id,
    }));
}
