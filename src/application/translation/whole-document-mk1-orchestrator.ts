import { runDeterministicLegalQa, type LegalQaResult, type LegalQaStatus } from "./deterministic-legal-qa.ts";
import type { Mk1TranslationResult } from "./mk1-translation-service.ts";

export type OrderedDocumentSegment = { id: string; index: number; sourceText: string };
export type WholeDocumentProgress = { totalSegments: number; translatedSegments: number; currentSegmentIndex: number | null };
export type WholeDocumentSegmentResult = { segmentId: string; segmentIndex: number; translationVersionId: string; targetText: string; qaStatus: LegalQaStatus };
export type WholeDocumentQa = {
  status: LegalQaStatus;
  completeness: { expectedSegments: number; translatedSegments: number; missingSegmentIds: string[]; emptyTargetSegmentIds: string[]; sourceOrderValid: boolean };
  segmentQa: { pass: number; warning: number; error: number };
  legalAnchors: LegalQaResult;
};

export async function orchestrateWholeDocumentMk1(input: {
  segments: OrderedDocumentSegment[];
  translateSegment: (segment: OrderedDocumentSegment, context: { previousSourceText: string | null; nextSourceText: string | null }) => Promise<{ result: Mk1TranslationResult; translationVersionId: string }>;
  onProgress?: (progress: WholeDocumentProgress, result?: WholeDocumentSegmentResult) => Promise<void>;
}): Promise<{ segments: WholeDocumentSegmentResult[]; qa: WholeDocumentQa }> {
  const ordered = [...input.segments].sort((a, b) => a.index - b.index);
  if (ordered.length === 0) throw new Error("The document contains no translatable segments.");
  const sourceOrderValid = ordered.every((segment, index) => index === 0 || segment.index > ordered[index - 1].index);
  if (!sourceOrderValid) throw new Error("Document segment order is not deterministic.");
  const translated: WholeDocumentSegmentResult[] = [];
  await input.onProgress?.({ totalSegments: ordered.length, translatedSegments: 0, currentSegmentIndex: null });
  for (let index = 0; index < ordered.length; index++) {
    const segment = ordered[index];
    const generated = await input.translateSegment(segment, {
      previousSourceText: ordered[index - 1]?.sourceText ?? null,
      nextSourceText: ordered[index + 1]?.sourceText ?? null,
    });
    const item = { segmentId: segment.id, segmentIndex: segment.index, translationVersionId: generated.translationVersionId, targetText: generated.result.mk1, qaStatus: generated.result.qa.status };
    translated.push(item);
    await input.onProgress?.({ totalSegments: ordered.length, translatedSegments: translated.length, currentSegmentIndex: segment.index }, item);
  }
  const translatedIds = new Set(translated.map((item) => item.segmentId));
  const missingSegmentIds = ordered.filter((segment) => !translatedIds.has(segment.id)).map((segment) => segment.id);
  const emptyTargetSegmentIds = translated.filter((item) => !item.targetText.trim()).map((item) => item.segmentId);
  const legalAnchors = runDeterministicLegalQa(ordered.map((segment) => segment.sourceText).join("\n"), translated.map((item) => item.targetText).join("\n"));
  const segmentQa = {
    pass: translated.filter((item) => item.qaStatus === "PASS").length,
    warning: translated.filter((item) => item.qaStatus === "WARNING").length,
    error: translated.filter((item) => item.qaStatus === "ERROR").length,
  };
  const hasCompletenessError = missingSegmentIds.length > 0 || emptyTargetSegmentIds.length > 0 || translated.length !== ordered.length;
  const status: LegalQaStatus = hasCompletenessError || segmentQa.error > 0 || legalAnchors.status === "ERROR" ? "ERROR"
    : segmentQa.warning > 0 || legalAnchors.status === "WARNING" ? "WARNING" : "PASS";
  return { segments: translated, qa: { status, completeness: { expectedSegments: ordered.length, translatedSegments: translated.length, missingSegmentIds, emptyTargetSegmentIds, sourceOrderValid }, segmentQa, legalAnchors } };
}
