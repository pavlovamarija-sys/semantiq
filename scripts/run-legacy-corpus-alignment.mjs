import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { buildLegacyAlignmentDraft } from "../src/application/legacy-corpus/align-bilingual-documents.ts";

const root = process.env.LEGACY_CORPUS_ROOT ?? "D:\\Преводи\\EU_Acquis_Corpus";
const celex = process.env.LEGACY_CELEX ?? "32014R0788";
const enPath = path.join(root, "Documents", celex, "EN", "2014R0788R(01)_EN.docx");
const mkPath = path.join(root, "Documents", celex, "MK2", "32014R0788_MK2.docx");

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function xmlText(xml) {
  return [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map(([, p]) => {
    const text = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(([, t]) => t).join("");
    return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x2013;/g, "–").trim();
  }).filter(Boolean).join("\n");
}
async function extractDocx(file) {
  const bytes = await readFile(file); const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml").async("string");
  return { bytes, text: xmlText(xml), method: "OOXML word/document.xml paragraph extraction" };
}
function segment(text, versionId, language) {
  const out = []; const pathState = {};
  for (const match of text.matchAll(/[^\r\n]+/gu)) {
    const exactText = match[0]; const trimmed = exactText.trim(); if (!trimmed) continue;
    let type = out.length === 0 ? "title" : "text";
    const article = /^(?:Article|Член)\s+([\dA-ZА-Ш.-]+)/iu.exec(trimmed);
    const annex = /^(?:ANNEX|ПРИЛОГ)\s*([\p{L}\d.-]*)/iu.exec(trimmed);
    const paragraph = /^(\d+)\.\s+/u.exec(trimmed);
    const point = /^\(([a-zа-ш])\)\s+/iu.exec(trimmed);
    if (article) { type = "article"; pathState.article = article[1].toUpperCase(); delete pathState.paragraph; delete pathState.point; }
    else if (annex) { type = "annex"; pathState.annex = (annex[1] || "1").toUpperCase(); delete pathState.article; delete pathState.paragraph; delete pathState.point; }
    else if (paragraph && pathState.article) { type = "paragraph"; pathState.paragraph = paragraph[1]; delete pathState.point; }
    else if (point && (pathState.article || pathState.annex)) { type = "point"; pathState.point = point[1].toLowerCase(); }
    const keys = [pathState.annex && `annex:${pathState.annex}`, pathState.article && `article:${pathState.article}`, pathState.paragraph && `paragraph:${pathState.paragraph}`, pathState.point && `point:${pathState.point}`].filter(Boolean);
    out.push({ id: `${versionId}:${out.length}`, index: out.length, language, type, structuralKey: keys.length ? `${type}|${keys.join("/")}` : null, structuralPath: { ...pathState }, sourceStart: match.index, sourceEnd: match.index + exactText.length, exactText });
  }
  return out;
}
function align(source, target) {
  const by = (xs) => Map.groupBy(xs.filter(x => x.structuralKey), x => x.structuralKey);
  const a = by(source), b = by(target), usedA = new Set(), usedB = new Set(), units = [];
  for (const [key, left] of a) { const right = b.get(key); if (!right) continue; const cardinality = left.length === 1 && right.length === 1 ? "1:1" : left.length === 1 ? "1:N" : right.length === 1 ? "N:1" : null; if (!cardinality) continue; units.push({ index: units.length, sourceSegmentIds: left.map(x => x.id), targetSegmentIds: right.map(x => x.id), cardinality, confidence: cardinality === "1:1" ? .98 : .94, evidence: { method: "legal_structure", structuralKey: key, reason: "Exact legal-structure key on both documents." }, reviewStatus: "proposed", knowledgeStatus: "excluded" }); left.forEach(x => usedA.add(x.id)); right.forEach(x => usedB.add(x.id)); }
  const at = source.filter(x => x.type === "title" && !usedA.has(x.id)), bt = target.filter(x => x.type === "title" && !usedB.has(x.id));
  if (at.length === 1 && bt.length === 1) { units.push({ index: units.length, sourceSegmentIds: [at[0].id], targetSegmentIds: [bt[0].id], cardinality: "1:1", confidence: .8, evidence: { method: "sequence", reason: "Unique document-title position; linguistic equivalence requires review." }, reviewStatus: "needs_review", knowledgeStatus: "excluded" }); usedA.add(at[0].id); usedB.add(bt[0].id); }
  return { units, unalignedSource: source.filter(x => !usedA.has(x.id)), unalignedTarget: target.filter(x => !usedB.has(x.id)) };
}
const [en, mk] = await Promise.all([extractDocx(enPath), extractDocx(mkPath)]);
const sourceInput = { documentId: randomUUID(), documentVersionId: randomUUID(), language: "en", role: "source", exactText: en.text, celexNumber: celex, provenance: { originalPath: enPath } };
const targetInput = { documentId: randomUUID(), documentVersionId: randomUUID(), language: "mk", role: "approved_translation", exactText: mk.text, celexNumber: celex, provenance: { originalPath: mkPath } };
const draft = buildLegacyAlignmentDraft(sourceInput, targetInput);
const source = draft.sourceSegments; const target = draft.targetSegments;
const result = { units: draft.alignments, unalignedSource: source.filter(x => draft.unalignedSourceSegmentIds.includes(x.id)), unalignedTarget: target.filter(x => draft.unalignedTargetSegmentIds.includes(x.id)) };
const structural = [...source, ...target].filter(x => x.structuralKey).length / Math.max(1, source.length + target.length) * 100;
const report = { celex, enPath, mkPath, enSegments: source.length, mkSegments: target.length, aligned1to1: result.units.filter(x => x.cardinality === "1:1").length, aligned1toN: result.units.filter(x => x.cardinality === "1:N").length, alignedNto1: result.units.filter(x => x.cardinality === "N:1").length, needsReview: result.units.filter(x => x.reviewStatus === "needs_review").length, unalignedEN: result.unalignedSource.length, unalignedMK: result.unalignedTarget.length, structuralCoveragePercent: Number(structural.toFixed(2)), textCoverageENPercent: Number(((source.filter(x => !result.unalignedSource.includes(x)).reduce((n,x)=>n+x.exactText.replace(/\s/g,"").length,0) / Math.max(1, en.text.replace(/\s/g,"").length))*100).toFixed(2)), textCoverageMKPercent: Number(((target.filter(x => !result.unalignedTarget.includes(x)).reduce((n,x)=>n+x.exactText.replace(/\s/g,"").length,0) / Math.max(1, mk.text.replace(/\s/g,"").length))*100).toFixed(2)), strongExamples: result.units.filter(x => x.confidence >= .94).slice(0, 5), allNeedsReview: result.units.filter(x => x.reviewStatus === "needs_review"), representativeUnalignedEN: result.unalignedSource.slice(0, 5).map(x => ({ index:x.index, type:x.type, text:x.exactText })), representativeUnalignedMK: result.unalignedTarget.slice(0, 5).map(x => ({ index:x.index, type:x.type, text:x.exactText })), files: [{ language:"en", path:enPath, bytes:en.bytes.length, sha256:sha256(en.bytes), extraction:en.method }, { language:"mk", path:mkPath, bytes:mk.bytes.length, sha256:sha256(mk.bytes), extraction:mk.method }], proposalPolicy: "All units remain excluded/unapproved; confidence is evidence score, not calibrated probability." };
console.log(JSON.stringify({ report, sourceSegments: source, targetSegments: target, units: result.units }, null, 2));
