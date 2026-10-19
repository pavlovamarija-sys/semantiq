import type { LegacyCorpusDocumentInput, LegacyCorpusSegment, LegacySegmentType, StructuralPath } from "../../domain/legacy-corpus.ts";

const STRUCTURE = {
  chapter: /^(?:CHAPTER|ГЛАВА)\s+([\p{L}\d.-]+)/iu,
  article: /^(?:Article|Член)\s+([\dA-ZА-Ш.-]+)/iu,
  annex: /^(?:ANNEX|ПРИЛОГ)\s*([\p{L}\d.-]*)/iu,
  paragraph: /^(\d+)\.\s+/u,
  point: /^\(([a-zа-ш])\)\s+/iu,
  numbered: /^\((\d+)\)\s+/u,
  footnote: /^\((\d+|\*)\)\s+(?:OJ\b|Official Journal\b|Сл\.?\s*весник\b)/iu,
};

function stableId(versionId: string, index: number) {
  return `${versionId}:${index}`;
}

function key(path: StructuralPath, type: LegacySegmentType) {
  const parts = [path.annex && `annex:${path.annex}`, path.chapter && `chapter:${path.chapter}`, path.article && `article:${path.article}`,
    path.recital && `recital:${path.recital}`, path.paragraph && `paragraph:${path.paragraph}`, path.point && `point:${path.point}`,
    path.footnote && `footnote:${path.footnote}`].filter(Boolean);
  return parts.length ? `${type}|${parts.join("/")}` : null;
}

/** Line-preserving V1 segmenter. Exact text is always sliced from the supplied immutable extraction. */
export function segmentLegalDocument(document: LegacyCorpusDocumentInput): LegacyCorpusSegment[] {
  const segments: LegacyCorpusSegment[] = [];
  const path: StructuralPath = {};
  let beforeFirstArticle = true;
  let firstContent = true;
  for (const match of document.exactText.matchAll(/[^\r\n]+/gu)) {
    const exactText = match[0];
    const trimmed = exactText.trim();
    if (!trimmed) continue;
    const sourceStart = match.index;
    let type: LegacySegmentType = firstContent ? "title" : "text";
    const footnote = STRUCTURE.footnote.exec(trimmed);
    const chapter = STRUCTURE.chapter.exec(trimmed);
    const article = STRUCTURE.article.exec(trimmed);
    const annex = STRUCTURE.annex.exec(trimmed);
    const paragraph = STRUCTURE.paragraph.exec(trimmed);
    const point = STRUCTURE.point.exec(trimmed);
    const numbered = STRUCTURE.numbered.exec(trimmed);
    if (footnote) { type = "footnote"; path.footnote = footnote[1]; }
    else if (chapter) { type = "chapter"; path.chapter = chapter[1].toUpperCase(); delete path.article; delete path.paragraph; delete path.point; }
    else if (article) { type = "article"; path.article = article[1].toUpperCase(); delete path.paragraph; delete path.point; delete path.recital; beforeFirstArticle = false; }
    else if (annex) { type = "annex"; path.annex = (annex[1] || "1").toUpperCase(); delete path.chapter; delete path.article; delete path.paragraph; delete path.point; delete path.recital; beforeFirstArticle = false; }
    else if (numbered && beforeFirstArticle) { type = "recital"; path.recital = numbered[1]; }
    else if (paragraph && path.article) { type = "paragraph"; path.paragraph = paragraph[1]; delete path.point; }
    else if (point && (path.article || path.annex)) { type = "point"; path.point = point[1].toLowerCase(); }
    else if (firstContent) type = "title";
    else if (beforeFirstArticle) type = "preamble";
    const snapshot = { ...path };
    segments.push({ id: stableId(document.documentVersionId, segments.length), documentVersionId: document.documentVersionId,
      language: document.language, index: segments.length, type, structuralKey: key(snapshot, type), structuralPath: snapshot,
      sourceStart, sourceEnd: sourceStart + exactText.length, exactText });
    firstContent = false;
  }
  return segments;
}
