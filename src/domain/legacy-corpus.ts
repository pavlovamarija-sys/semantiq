export type LegacySegmentType = "title" | "preamble" | "recital" | "chapter" | "article" | "paragraph" | "point" | "annex" | "footnote" | "text";

export type LegacyCorpusDocumentInput = {
  documentId: string;
  documentVersionId: string;
  language: string;
  role: "source" | "approved_translation";
  exactText: string;
  celexNumber?: string;
  provenance: Record<string, unknown>;
};

export type StructuralPath = {
  chapter?: string;
  article?: string;
  paragraph?: string;
  point?: string;
  annex?: string;
  recital?: string;
  footnote?: string;
};

export type LegacyCorpusSegment = {
  id: string;
  documentVersionId: string;
  language: string;
  index: number;
  type: LegacySegmentType;
  structuralKey: string | null;
  structuralPath: StructuralPath;
  sourceStart: number;
  sourceEnd: number;
  exactText: string;
};

export type AlignmentProposal = {
  index: number;
  sourceSegmentIds: string[];
  targetSegmentIds: string[];
  cardinality: "1:1" | "1:N" | "N:1";
  confidence: number;
  evidence: { method: "legal_structure" | "sequence"; structuralKey?: string; reason: string };
  reviewStatus: "proposed" | "needs_review";
  knowledgeStatus: "excluded";
};

export type LegacyAlignmentDraft = {
  source: LegacyCorpusDocumentInput;
  target: LegacyCorpusDocumentInput;
  sourceSegments: LegacyCorpusSegment[];
  targetSegments: LegacyCorpusSegment[];
  alignments: AlignmentProposal[];
  unalignedSourceSegmentIds: string[];
  unalignedTargetSegmentIds: string[];
};
