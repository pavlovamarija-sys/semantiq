import {
  findExactApprovedTranslationMemory,
  type ExactTranslationMemoryMatch,
  type ExactTranslationMemoryQuery,
  normalizeExactLookupText,
} from "../translation-memory/exact-approved-retrieval.ts";
import {
  findFuzzyApprovedTranslationMemory,
  type FuzzyTranslationMemoryMatch,
} from "../translation-memory/fuzzy-approved-retrieval.ts";
import { runDeterministicLegalQa, type LegalQaResult } from "./deterministic-legal-qa.ts";
import { persistGeneratedMk1, type Mk1PersistenceClient, type PersistedMk1 } from "./mk1-persistence.ts";

export const MK1_PROMPT_VERSION = "mk1-legal-benchmark-v1";
export const MK1_MODEL = "gpt-5.6";

export type Mk1SegmentInput = ExactTranslationMemoryQuery & {
  previousSourceText?: string | null;
  nextSourceText?: string | null;
  minimumFuzzySimilarity?: number;
  documentTitle?: string | null;
  documentType?: string | null;
  celex?: string | null;
};

export type Mk1Evidence = {
  exactApprovedTm: ExactTranslationMemoryMatch[];
  strongFuzzyApprovedTm: FuzzyTranslationMemoryMatch[];
  sourceDocumentContext: {
    previousEn: string | null;
    currentEn: string;
    nextEn: string | null;
    documentTitle: string | null;
    documentType: string | null;
    celex: string | null;
  };
};

export type Mk1GenerationMetadata = {
  model: string;
  promptVersion: string;
  tokens: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  latencyMs: number;
};

export type Mk1TranslationResult = {
  mk1: string;
  evidence: Mk1Evidence;
  metadata: Mk1GenerationMetadata;
  qa: LegalQaResult;
};

export type PersistedMk1TranslationResult = Mk1TranslationResult & { persistence: PersistedMk1 };

export type TranslationMemoryReader = Parameters<typeof findExactApprovedTranslationMemory>[0];
export type TranslationMemoryRpcClient = Parameters<typeof findFuzzyApprovedTranslationMemory>[0];

export type Mk1OpenAiClient = {
  generate(input: { sourceEn: string; evidence: Mk1Evidence }): Promise<{
    mk1: string;
    tokens: Mk1GenerationMetadata["tokens"];
    latencyMs: number;
  }>;
};

export async function translateSegmentWithMk1(
  reader: TranslationMemoryReader,
  rpcClient: TranslationMemoryRpcClient,
  openAi: Mk1OpenAiClient,
  input: Mk1SegmentInput,
): Promise<Mk1TranslationResult> {
  const currentEn = normalizeExactLookupText(input.sourceText);
  if (!input.knowledgeBaseId || !input.sourceLanguage || !input.targetLanguage || !currentEn) {
    throw new Error("A Knowledge Base, language pair, and non-empty source segment are required.");
  }

  const exactApprovedTm = await findExactApprovedTranslationMemory(reader, {
    knowledgeBaseId: input.knowledgeBaseId,
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    sourceText: currentEn,
  });
  const strongFuzzyApprovedTm = exactApprovedTm.length > 0
    ? []
    : await findFuzzyApprovedTranslationMemory(rpcClient, {
      knowledgeBaseId: input.knowledgeBaseId,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      sourceText: currentEn,
      minimumSimilarity: input.minimumFuzzySimilarity ?? 0.70,
    });

  const evidence: Mk1Evidence = {
    exactApprovedTm,
    strongFuzzyApprovedTm,
    sourceDocumentContext: {
      previousEn: input.previousSourceText ? normalizeExactLookupText(input.previousSourceText) : null,
      currentEn,
      nextEn: input.nextSourceText ? normalizeExactLookupText(input.nextSourceText) : null,
      documentTitle: input.documentTitle?.trim() || null,
      documentType: input.documentType?.trim() || null,
      celex: input.celex?.trim() || null,
    },
  };
  const generated = await openAi.generate({ sourceEn: currentEn, evidence });
  if (!generated.mk1.trim()) throw new Error("MK1 provider returned an empty translation.");
  const mk1 = generated.mk1.trim();
  return {
    mk1,
    evidence,
    metadata: { model: MK1_MODEL, promptVersion: MK1_PROMPT_VERSION, tokens: generated.tokens, latencyMs: generated.latencyMs },
    qa: runDeterministicLegalQa(currentEn, mk1),
  };
}

export async function translateAndPersistSegmentWithMk1(
  reader: TranslationMemoryReader,
  rpcClient: TranslationMemoryRpcClient,
  openAi: Mk1OpenAiClient,
  persistenceClient: Mk1PersistenceClient,
  segmentId: string,
  input: Mk1SegmentInput,
): Promise<PersistedMk1TranslationResult> {
  const result = await translateSegmentWithMk1(reader, rpcClient, openAi, input);
  const persistence = await persistGeneratedMk1(persistenceClient, segmentId, input, result);
  return { ...result, persistence };
}

export function createOpenAiMk1Client(fetcher: typeof fetch = fetch, apiKey = process.env.OPENAI_API_KEY): Mk1OpenAiClient {
  if (!apiKey) throw new Error("OPENAI_API_KEY is required.");
  return {
    async generate({ sourceEn, evidence }) {
      const started = performance.now();
      const response = await fetcher("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: MK1_MODEL,
          messages: [
            { role: "system", content: "You are a professional EU legal translator. Translate English into Macedonian MK1. Output only the Macedonian translation. Preserve legal meaning, defined terms, numbering, references, and legally relevant sentence structure. Use only supplied evidence. Do not invent legal references or terminology." },
            { role: "user", content: JSON.stringify({ source_en: sourceEn, allowed_evidence: evidence }) },
          ],
        }),
      });
      if (!response.ok) throw new Error(`MK1 OpenAI generation failed (${response.status}): ${await response.text()}`);
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: Mk1GenerationMetadata["tokens"] };
      const mk1 = payload.choices?.[0]?.message?.content;
      if (typeof mk1 !== "string") throw new Error("MK1 OpenAI response did not contain translation text.");
      return { mk1, tokens: payload.usage ?? null, latencyMs: Number((performance.now() - started).toFixed(2)) };
    },
  };
}
