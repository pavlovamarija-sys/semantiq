import type { AlignmentProposal, LegacyAlignmentDraft, LegacyCorpusDocumentInput, LegacyCorpusSegment } from "../../domain/legacy-corpus.ts";
import { segmentLegalDocument } from "./segment-legal-document.ts";

function groupByKey(segments: LegacyCorpusSegment[]) {
  const grouped = new Map<string, LegacyCorpusSegment[]>();
  for (const segment of segments) {
    if (!segment.structuralKey) continue;
    const items = grouped.get(segment.structuralKey) ?? [];
    items.push(segment);
    grouped.set(segment.structuralKey, items);
  }
  return grouped;
}

function cardinality(sourceCount: number, targetCount: number): AlignmentProposal["cardinality"] | null {
  if (sourceCount === 1 && targetCount === 1) return "1:1";
  if (sourceCount === 1 && targetCount > 1) return "1:N";
  if (sourceCount > 1 && targetCount === 1) return "N:1";
  return null;
}

function normalizedLegalKey(segment: LegacyCorpusSegment) {
  if (segment.type === "article" && segment.structuralPath.article) return `article:${segment.structuralPath.article}`;
  if (segment.type === "annex" && segment.structuralPath.annex) return `annex:${segment.structuralPath.annex}`;
  return null;
}

/** Conservative structure-first alignment: ambiguous N:M and unsupported evidence remain unaligned. */
export function buildLegacyAlignmentDraft(source: LegacyCorpusDocumentInput, target: LegacyCorpusDocumentInput): LegacyAlignmentDraft {
  if (source.role !== "source" || target.role !== "approved_translation") throw new Error("A legacy pair requires a source document and an approved translation.");
  if (source.language === target.language) throw new Error("A bilingual pair must use different languages.");
  if (source.celexNumber && target.celexNumber && source.celexNumber !== target.celexNumber) throw new Error("The paired documents have conflicting CELEX provenance.");
  const sourceSegments = segmentLegalDocument(source);
  const targetSegments = segmentLegalDocument(target);
  const sourceByKey = groupByKey(sourceSegments);
  const targetByKey = groupByKey(targetSegments);
  const usedSource = new Set<string>();
  const usedTarget = new Set<string>();
  const alignments: AlignmentProposal[] = [];
  for (const [structuralKey, sourceGroup] of sourceByKey) {
    const targetGroup = targetByKey.get(structuralKey);
    if (!targetGroup) continue;
    const shape = cardinality(sourceGroup.length, targetGroup.length);
    if (!shape) continue;
    const confidence = shape === "1:1" ? 0.98 : 0.94;
    alignments.push({ index: alignments.length, sourceSegmentIds: sourceGroup.map(({ id }) => id), targetSegmentIds: targetGroup.map(({ id }) => id),
      cardinality: shape, confidence, evidence: { method: "legal_structure", structuralKey, reason: shape === "1:1"
        ? "Exact legal-structure key on both documents." : "Exact legal-structure key with a supported split/merge." },
      reviewStatus: "proposed", knowledgeStatus: "excluded" });
    sourceGroup.forEach(({ id }) => usedSource.add(id));
    targetGroup.forEach(({ id }) => usedTarget.add(id));
  }
  // Some approved translations omit chapter headings that are present in EN.
  // Align only a unique article/annex identifier; never guess across duplicates.
  const sourceByNormalizedKey = new Map<string, LegacyCorpusSegment[]>();
  const targetByNormalizedKey = new Map<string, LegacyCorpusSegment[]>();
  for (const segment of sourceSegments) { const normalized = normalizedLegalKey(segment); if (normalized) sourceByNormalizedKey.set(normalized, [...(sourceByNormalizedKey.get(normalized) ?? []), segment]); }
  for (const segment of targetSegments) { const normalized = normalizedLegalKey(segment); if (normalized) targetByNormalizedKey.set(normalized, [...(targetByNormalizedKey.get(normalized) ?? []), segment]); }
  for (const [normalizedKey, sourceGroup] of sourceByNormalizedKey) {
    const targetGroup = targetByNormalizedKey.get(normalizedKey);
    if (!targetGroup || sourceGroup.some(({ id }) => usedSource.has(id)) || targetGroup.some(({ id }) => usedTarget.has(id))) continue;
    const shape = cardinality(sourceGroup.length, targetGroup.length);
    if (!shape) continue;
    alignments.push({ index: alignments.length, sourceSegmentIds: sourceGroup.map(({ id }) => id), targetSegmentIds: targetGroup.map(({ id }) => id),
      cardinality: shape, confidence: shape === "1:1" ? 0.96 : 0.92,
      evidence: { method: "legal_structure", structuralKey: normalizedKey, reason: "Unique normalized article/annex identifier; chapter-prefix variation ignored." },
      reviewStatus: "proposed", knowledgeStatus: "excluded" });
    sourceGroup.forEach(({ id }) => usedSource.add(id)); targetGroup.forEach(({ id }) => usedTarget.add(id));
  }
  const sourceTitles = sourceSegments.filter(({ type, id }) => type === "title" && !usedSource.has(id));
  const targetTitles = targetSegments.filter(({ type, id }) => type === "title" && !usedTarget.has(id));
  if (sourceTitles.length === 1 && targetTitles.length === 1) {
    alignments.push({ index: alignments.length, sourceSegmentIds: [sourceTitles[0].id], targetSegmentIds: [targetTitles[0].id],
      cardinality: "1:1", confidence: 0.8, evidence: { method: "sequence", reason: "Unique document-title position in the matched pair; linguistic equivalence still requires review." },
      reviewStatus: "needs_review", knowledgeStatus: "excluded" });
    usedSource.add(sourceTitles[0].id);
    usedTarget.add(targetTitles[0].id);
  }
  return { source, target, sourceSegments, targetSegments, alignments,
    unalignedSourceSegmentIds: sourceSegments.filter(({ id }) => !usedSource.has(id)).map(({ id }) => id),
    unalignedTargetSegmentIds: targetSegments.filter(({ id }) => !usedTarget.has(id)).map(({ id }) => id) };
}
