export type ReferenceCorpusSemanticMatch = {
  id: string; chunk_text: string; celex: string; structural_context: Record<string, unknown>;
  source_file: string; paragraph_order: number; global_chunk_order: number;
  source_paragraph_index: number; extraction_method: string;
  duplicate_sources: unknown[]; similarity: number;
};

type RpcClient = { rpc(name: string, args: Record<string, unknown>): Promise<{ data: ReferenceCorpusSemanticMatch[] | null; error: { message: string } | null }> };
export const REFERENCE_CORPUS_EMBEDDING_MODEL = "text-embedding-3-large" as const;
export const REFERENCE_CORPUS_EMBEDDING_DIMENSIONS = 768 as const;

export async function retrieveReferenceCorpusSemantic(client: RpcClient, knowledgeBaseId: string, queryEmbedding: number[], topK = 10): Promise<ReferenceCorpusSemanticMatch[]> {
  if (queryEmbedding.length !== 768) throw new Error("Reference Corpus query embedding must have 768 dimensions");
  const response = await client.rpc("search_reference_corpus_semantic", { p_knowledge_base_id: knowledgeBaseId, p_query_embedding: `[${queryEmbedding.join(",")}]`, p_top_k: topK, p_embedding_model: REFERENCE_CORPUS_EMBEDDING_MODEL, p_embedding_dimensions: REFERENCE_CORPUS_EMBEDDING_DIMENSIONS });
  if (response.error) throw new Error(`Reference Corpus semantic retrieval failed: ${response.error.message}`);
  return response.data ?? [];
}
