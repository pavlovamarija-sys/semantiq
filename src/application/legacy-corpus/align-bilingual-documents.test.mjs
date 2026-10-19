import assert from "node:assert/strict";
import test from "node:test";
import { buildLegacyAlignmentDraft } from "./align-bilingual-documents.ts";
import { segmentLegalDocument } from "./segment-legal-document.ts";

const input = (version, language, role, exactText) => ({ documentId: `doc-${version}`, documentVersionId: version, language, role,
  celexNumber: "32024R0001", exactText, provenance: { corpus: "curated-test" } });

test("aligns exact legal structures while preserving text slices exactly", () => {
  const en = input("en-v1", "en", "source", "REGULATION\n(1) First recital.\nArticle 1\n1. First paragraph.\n(a) Point A.\nArticle 2\nFinal text.");
  const mk = input("mk-v1", "mk", "approved_translation", "РЕГУЛАТИВА\n(1) Прва рецитала.\nЧлен 1\n1. Прв став.\n(а) Точка А.\nЧлен 2\nЗавршен текст.");
  const draft = buildLegacyAlignmentDraft(en, mk);
  assert.ok(draft.alignments.some((unit) => unit.evidence.structuralKey === "article|article:1" && unit.confidence === 0.98));
  assert.ok(draft.alignments.some((unit) => unit.evidence.method === "sequence" && unit.reviewStatus === "needs_review"));
  assert.ok(draft.alignments.every((unit) => unit.knowledgeStatus === "excluded"));
  assert.equal(draft.sourceSegments[3].exactText, "1. First paragraph.");
  assert.equal(en.exactText.slice(draft.sourceSegments[3].sourceStart, draft.sourceSegments[3].sourceEnd), draft.sourceSegments[3].exactText);
});

test("supports 1:N and N:1 only when a shared legal key supplies evidence", () => {
  const en = input("en-v2", "en", "source", "TITLE\nArticle 1\n1. One English segment.");
  const mk = input("mk-v2", "mk", "approved_translation", "НАСЛОВ\nЧлен 1\n1. Прв дел.\n1. Втор дел.");
  const oneToMany = buildLegacyAlignmentDraft(en, mk).alignments.find((unit) => unit.cardinality === "1:N");
  assert.equal(oneToMany?.confidence, 0.94);
  const reverse = buildLegacyAlignmentDraft(
    input("en-v3", "en", "source", "TITLE\nArticle 1\n1. Part one.\n1. Part two."),
    input("mk-v3", "mk", "approved_translation", "НАСЛОВ\nЧлен 1\n1. Еден споен став."),
  ).alignments.find((unit) => unit.cardinality === "N:1");
  assert.equal(reverse?.confidence, 0.94);
});

test("does not force uncertain, conflicting, or N:M matches", () => {
  const draft = buildLegacyAlignmentDraft(
    input("en-v4", "en", "source", "TITLE\nUnnumbered source text.\nArticle 1\n1. A.\n1. B."),
    input("mk-v4", "mk", "approved_translation", "НАСЛОВ\nНесигурен текст.\nЧлен 1\n1. А.\n1. Б."),
  );
  assert.ok(draft.unalignedSourceSegmentIds.length > 0);
  assert.ok(draft.unalignedTargetSegmentIds.length > 0);
  assert.equal(draft.alignments.some((unit) => unit.evidence.structuralKey?.includes("paragraph:1")), false);
});

test("detects the Phase 1 legal structures in exact extracted text", () => {
  const document = input("en-v5", "en", "source", "LEGAL ACT\n(1) Recital.\nCHAPTER I\nArticle 1\n1. Paragraph.\n(a) Point.\nANNEX I\nAnnex text.\n(1) OJ L 1, 1.1.2024, p. 1.");
  const segments = segmentLegalDocument(document);
  for (const type of ["title", "recital", "chapter", "article", "paragraph", "point", "annex", "footnote"]) {
    assert.ok(segments.some((segment) => segment.type === type), `missing ${type}`);
  }
  assert.ok(segments.every((segment) => document.exactText.slice(segment.sourceStart, segment.sourceEnd) === segment.exactText));
});

test("rejects pairs with conflicting CELEX provenance", () => {
  const source = input("en-v6", "en", "source", "TITLE");
  const target = { ...input("mk-v6", "mk", "approved_translation", "НАСЛОВ"), celexNumber: "32024R0002" };
  assert.throws(() => buildLegacyAlignmentDraft(source, target), /conflicting CELEX/);
});
