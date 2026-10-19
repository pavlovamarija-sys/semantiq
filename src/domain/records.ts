import type { LanguageCode } from "./languages";

export type Uuid = string;
export type Timestamp = string;
export type ProjectStatus = "draft" | "active" | "completed" | "archived";
export type ExtractionStatus = "pending" | "processing" | "completed" | "failed";
export type TranslationStatus = "draft" | "in_review" | "approved";
export type TranslationOrigin = "ai" | "translator" | "reviewer";
export type TranslationVersionReviewStatus = "ai_draft_unreviewed" | "translator_draft" | "in_review" | "approved";
export type TerminologyStatus = "pending" | "approved" | "deprecated";

export interface Project {
  id: Uuid; ownerId: Uuid; name: string; sourceLanguage: LanguageCode; targetLanguage: LanguageCode;
  status: ProjectStatus; createdAt: Timestamp; updatedAt: Timestamp;
}
export interface Document {
  id: Uuid; projectId: Uuid; title: string; documentType: string | null;
  celexNumber: string | null; sourceLanguage: LanguageCode; sourceFilename: string | null;
  sourceReference: string | null; createdAt: Timestamp; updatedAt: Timestamp;
}
export interface DocumentVersion {
  id: Uuid; documentId: Uuid; versionNumber: number; rawText: string | null;
  extractionStatus: ExtractionStatus; sourceStorageBucket: string | null;
  sourceStoragePath: string | null; sourceFilename: string | null;
  sourceMimeType: string | null; sourceFileSizeBytes: number | null; createdAt: Timestamp;
}
export interface DocumentSegment {
  id: Uuid; documentVersionId: Uuid; segmentIndex: number; segmentType: string;
  sourceText: string; parentSegmentId: Uuid | null; chapterNumber: string | null;
  articleNumber: string | null; paragraphNumber: string | null; pointNumber: string | null;
  createdAt: Timestamp;
}
export interface Translation {
  id: Uuid; segmentId: Uuid; targetLanguage: LanguageCode; status: TranslationStatus;
  createdAt: Timestamp; updatedAt: Timestamp;
}
export interface TranslationVersion {
  id: Uuid; translationId: Uuid; targetText: string; origin: TranslationOrigin;
  modelProvider: string | null; modelName: string | null; promptVersion: string | null;
  reviewStatus: TranslationVersionReviewStatus | null; createdBy: Uuid | null;
  approvedBy: Uuid | null; approvedAt: Timestamp | null; createdAt: Timestamp;
}
export interface TerminologyEntry {
  id: Uuid; sourceLanguage: LanguageCode; targetLanguage: LanguageCode;
  sourceTerm: string; targetTerm: string; definition: string | null; domain: string | null;
  context: string | null; sourceType: string | null; sourceReference: string | null;
  status: TerminologyStatus; createdAt: Timestamp; updatedAt: Timestamp;
}
export interface TranslationEvidence {
  id: Uuid; translationVersionId: Uuid; evidenceType: string; sourceName: string | null;
  sourceReference: string | null; sourceText: string | null; targetText: string | null;
  metadata: Record<string, unknown>; createdAt: Timestamp;
}
