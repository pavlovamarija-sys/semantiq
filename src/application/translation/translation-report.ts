import { createHash } from "node:crypto";
import JSZip from "jszip";
import { runDeterministicLegalQa, type LegalQaFinding, type LegalQaStatus } from "./deterministic-legal-qa.ts";

export const REPORT_ANALYSIS_VERSION = "translation-report-terminology-v2";
export type ReportSegment = { id: string; index: number; sourceText: string; targetText: string; translationVersionId: string };
export type ReportMetadata = { document: string; celex: string | null; sourceLanguage: string; targetLanguage: string; model: string; promptVersion: string; startedAt: string; completedAt: string; inputTokens: number; outputTokens: number; translationPages: number };
export type SemanticCandidate = { kind: "term" | "repeated_phrase"; en: string; variants: Array<{ mk: string; segmentIndexes: number[] }> };
export type SemanticAnalysis = { model: string; promptVersion: string; candidates: SemanticCandidate[]; usage?: { inputTokens: number; outputTokens: number } };
export type BilingualCandidate = { en: string; mk: string[]; frequency: number; segmentReferences: Array<{ id: string; index: number }>; status: "CONSISTENT" | "VARIANT"; variants: Array<{ mk: string; count: number; segmentIndexes: number[] }> };
export type TranslationReport = { metadata: ReportMetadata; segmentCount: number; qaTotals: Record<LegalQaStatus, number>; findings: Array<{ segmentId: string; segmentIndex: number; sourceExcerpt: string; targetExcerpt: string; finding: LegalQaFinding }>; terminology: BilingualCandidate[]; repeatedPhrases: BilingualCandidate[]; inconsistencies: BilingualCandidate[]; legalAnchors: string[]; contentHash: string; analysis: Pick<SemanticAnalysis, "model" | "promptVersion" | "usage"> };

const stopwords = new Set("a an and are as at be been by for from has have in into is it its of on or that the their this to was were which with shall may must not".split(" "));
const normalized = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
const tokens = (value: string) => normalized(value).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
const excerpt = (text: string, size = 220) => text.length <= size ? text : `${text.slice(0, size - 1)}…`;
const phraseOccurs = (text: string, phrase: string) => { const haystack = tokens(text); const needle = tokens(phrase); return needle.length > 0 && haystack.some((_, index) => needle.every((token, offset) => haystack[index + offset] === token)); };
const forbiddenCandidate = (value: string) => { const candidateTokens = tokens(value); if (!candidateTokens.length || /[0-9a-f]{8}-[0-9a-f-]{27,}/iu.test(value)) return true; if (candidateTokens.every((token) => stopwords.has(token) || /^\d+$/u.test(token))) return true; return /^(?:article|annex|directive|regulation|decision)\s+(?:\([a-z]+\)\s*)?[\d/().-]+$/iu.test(normalized(value)); };

export function verifySemanticCandidates(analysis: SemanticAnalysis, segments: ReportSegment[]) {
  const byIndex = new Map(segments.map((segment) => [segment.index, segment]));
  const verified: Array<BilingualCandidate & { kind: SemanticCandidate["kind"] }> = [];
  for (const candidate of analysis.candidates) {
    if (forbiddenCandidate(candidate.en)) continue;
    const variants: BilingualCandidate["variants"] = [];
    for (const variant of candidate.variants) {
      if (forbiddenCandidate(variant.mk)) continue;
      if (tokens(candidate.en).length > 1 && tokens(variant.mk).length < 2) continue;
      const indexes = [...new Set(variant.segmentIndexes)].filter((index) => { const segment = byIndex.get(index); return Boolean(segment && phraseOccurs(segment.sourceText, candidate.en) && phraseOccurs(segment.targetText, variant.mk)); }).sort((a, b) => a - b);
      if (indexes.length) variants.push({ mk: variant.mk.trim(), count: indexes.length, segmentIndexes: indexes });
    }
    if (!variants.length) continue;
    const indexes = [...new Set(variants.flatMap((variant) => variant.segmentIndexes))].sort((a, b) => a - b);
    if (candidate.kind === "repeated_phrase" && indexes.length < 2) continue;
    verified.push({ kind: candidate.kind, en: candidate.en.trim(), mk: variants.map((variant) => variant.mk), frequency: indexes.length, segmentReferences: indexes.map((index) => ({ id: byIndex.get(index)!.id, index })), status: variants.length === 1 ? "CONSISTENT" : "VARIANT", variants });
  }
  const deduped = verified.filter((candidate, index, all) => !all.some((other, otherIndex) => otherIndex !== index && candidate.kind === other.kind && normalized(other.en) !== normalized(candidate.en) && phraseOccurs(other.en, candidate.en) && other.segmentReferences.map((item) => item.index).join() === candidate.segmentReferences.map((item) => item.index).join() && other.en.length > candidate.en.length));
  const unique = new Map<string, typeof deduped[number]>(); for (const item of deduped) unique.set(`${item.kind}:${normalized(item.en)}`, item);
  return [...unique.values()].sort((a, b) => b.frequency - a.frequency || b.en.length - a.en.length).slice(0, 50);
}

export function computeReportContentHash(segments: ReportSegment[]) { return createHash("sha256").update(JSON.stringify([REPORT_ANALYSIS_VERSION, segments.map((s) => [s.id, s.index, s.translationVersionId, s.sourceText, s.targetText])])).digest("hex"); }

export function buildTranslationReport(metadata: ReportMetadata, segments: ReportSegment[], semanticAnalysis: SemanticAnalysis): TranslationReport {
  const qaTotals: Record<LegalQaStatus, number> = { PASS: 0, WARNING: 0, ERROR: 0 }; const findings: TranslationReport["findings"] = [];
  for (const segment of segments) { const qa = runDeterministicLegalQa(segment.sourceText, segment.targetText); qaTotals[qa.status]++; for (const finding of qa.findings.filter((item) => item.status !== "PASS")) findings.push({ segmentId: segment.id, segmentIndex: segment.index, sourceExcerpt: excerpt(segment.sourceText), targetExcerpt: excerpt(segment.targetText), finding }); }
  findings.sort((a, b) => (a.finding.status === b.finding.status ? a.segmentIndex - b.segmentIndex : a.finding.status === "ERROR" ? -1 : 1));
  const verified = verifySemanticCandidates(semanticAnalysis, segments); const terminology = verified.filter((item) => item.kind === "term"); const repeatedPhrases = verified.filter((item) => item.kind === "repeated_phrase"); const inconsistencies = verified.filter((item) => item.status === "VARIANT");
  const anchors = new Set<string>(); for (const segment of segments) for (const match of segment.sourceText.matchAll(/\b(?:Directive|Regulation|Decision)\s+(?:\([A-Z]+\)\s*)?\d+[\s/]+\d+|\bArticle\s+\d+[a-z]?|\bAnnex\s+[A-Z0-9]+|\b(?:European Commission|Council|European Parliament|Member States?)\b/giu)) anchors.add(match[0].replace(/\s+/g, " "));
  return { metadata, segmentCount: segments.length, qaTotals, findings, terminology, repeatedPhrases, inconsistencies, legalAnchors: [...anchors].sort(), contentHash: computeReportContentHash(segments), analysis: { model: semanticAnalysis.model, promptVersion: semanticAnalysis.promptVersion, usage: semanticAnalysis.usage } };
}

function xml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function paragraph(text: string, style?: string) { return `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`; }
function table(headers: string[], rows: string[][]) { const row = (cells: string[], bold = false) => `<w:tr>${cells.map((cell) => `<w:tc><w:p><w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${xml(cell)}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`; return `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B8C2CC"/><w:left w:val="single" w:sz="4" w:color="B8C2CC"/><w:bottom w:val="single" w:sz="4" w:color="B8C2CC"/><w:right w:val="single" w:sz="4" w:color="B8C2CC"/><w:insideH w:val="single" w:sz="4" w:color="D9E0E6"/><w:insideV w:val="single" w:sz="4" w:color="D9E0E6"/></w:tblBorders></w:tblPr>${row(headers, true)}${rows.map((cells) => row(cells)).join("")}</w:tbl>`; }

export async function renderTranslationReportDocx(report: TranslationReport): Promise<Uint8Array> {
  const body: string[] = [paragraph("Translation & Terminology Report", "Title"), paragraph(`${report.metadata.document}${report.metadata.celex ? ` · ${report.metadata.celex}` : ""}`), paragraph("AI working translation (MK1) — not approved translation memory"), paragraph("1. Translation summary", "Heading1")]; const runtime = Math.max(0, new Date(report.metadata.completedAt).getTime() - new Date(report.metadata.startedAt).getTime());
  for (const line of [`Languages: ${report.metadata.sourceLanguage.toUpperCase()} → ${report.metadata.targetLanguage.toUpperCase()}`, `Translation model / prompt: ${report.metadata.model} / ${report.metadata.promptVersion}`, `Terminology analysis: ${report.analysis.model} / ${report.analysis.promptVersion}`, `Segments translated: ${report.segmentCount}`, `Translation pages: ${report.metadata.translationPages.toFixed(2)}`, `Runtime: ${(runtime / 1000).toFixed(1)} seconds`, `Tokens: ${report.metadata.inputTokens} input / ${report.metadata.outputTokens} output`, `QA: ${report.qaTotals.PASS} PASS / ${report.qaTotals.WARNING} WARNING / ${report.qaTotals.ERROR} ERROR`]) body.push(paragraph(line));
  body.push(paragraph("2. Critical QA findings", "Heading1")); if (!report.findings.length) body.push(paragraph("No QA errors or warnings.")); for (const item of report.findings) body.push(paragraph(`${item.finding.status} · Segment ${item.segmentIndex}`), paragraph(`EN: ${item.sourceExcerpt}`), paragraph(`MK1: ${item.targetExcerpt}`), paragraph(`${item.finding.category}: ${item.finding.message}`));
  const addCandidates = (title: string, items: BilingualCandidate[]) => { body.push(paragraph(title, "Heading1")); if (!items.length) body.push(paragraph("No verified items identified.")); else body.push(table(["EN term/phrase", "MK1 translation", "Occurrences", "Consistency"], items.map((item) => [item.en, item.mk.join(" | "), String(item.frequency), item.status]))); }; addCandidates("3. Key terminology", report.terminology); addCandidates("4. Repeated legal phrases", report.repeatedPhrases);
  body.push(paragraph("5. Translation inconsistencies", "Heading1")); if (!report.inconsistencies.length) body.push(paragraph("No verified terminology variants identified.")); else body.push(table(["EN term", "MK1 variant", "Count", "Segment numbers"], report.inconsistencies.flatMap((item) => item.variants.map((variant) => [item.en, variant.mk, String(variant.count), variant.segmentIndexes.join(", ")])))); body.push(paragraph("6. Legal anchors", "Heading1")); for (const anchor of report.legalAnchors) body.push(paragraph(anchor));
  const zip = new JSZip(); zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`); zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`); zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`); zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>`); zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr/></w:body></w:document>`); return zip.generateAsync({ type: "uint8array" });
}
