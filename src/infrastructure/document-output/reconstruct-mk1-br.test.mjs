import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { codeToken } from "../../application/translation/canonical-mk1.ts";
import { renderMk1Docx } from "../cat/mk1-artifacts.ts";
import { validateReconstructedMk1Docx } from "./reconstruct-mk1-docx.ts";
import JSZip from "jszip";

const canonical = JSON.parse(await readFile(new URL("../../../artifacts/pdf-phase6c6/canonical-tus.json", import.meta.url), "utf8"));
const template = new Uint8Array(await readFile(new URL("../../../artifacts/pdf-phase6c4/controlled-run-readback/validated-docx.docx", import.meta.url)));

test("DOCX w:br is part of source identity for protected line-break TUs", async () => {
  const units = canonical.filter((u) => [158, 159, 160].includes(u.ordinal)).map((u) => ({ id: u.id, ordinal: u.ordinal, sourceText: u.source_text, sourceHash: u.source_hash, protectedCodes: [{ id: `br-${u.ordinal}`, literal: "\n", offset: u.source_text.indexOf("\n") }] }));
  const targets = units.map((u) => ({ id: u.id, ordinal: u.ordinal, targetText: `MK-${u.ordinal}${codeToken(`br-${u.ordinal}`)}citation` }));
  const result = await renderMk1Docx(template, units, targets);
  assert.equal(result.mappedSegmentIds.length, 3);
  const xml=await (await JSZip.loadAsync(result.bytes)).file("word/document.xml").async("string");
  for(const ordinal of[158,159,160]){const marker=`MK-${ordinal}`,start=xml.indexOf(marker);assert.notEqual(start,-1);const paragraphStart=xml.lastIndexOf("<w:p",start),paragraphEnd=xml.indexOf("</w:p>",start);const paragraph=xml.slice(paragraphStart,paragraphEnd);assert.equal([...paragraph.matchAll(/<w:br\b/g)].length,1);assert.match(paragraph,new RegExp(`${marker}[\\s\\S]*?<w:br\\b`));}
});

test("synthetic reconstruction preflight maps all 265 canonical TUs", async () => {
  const units = canonical.map((u) => ({ id: u.id, ordinal: u.ordinal, sourceText: u.source_text, sourceHash: u.source_hash,
    protectedCodes: u.source_text.includes("\n") ? [{ id:`br-${u.ordinal}`,literal:"\n",offset:u.source_text.indexOf("\n") }] : [] }));
  const targets = units.map((u) => ({ id: u.id, ordinal: u.ordinal, targetText: u.protectedCodes.length
    ? `MK-${u.ordinal}${u.protectedCodes.map((c,index) => `${codeToken(c.id)}continuation-${index}`).join("")}` : `MK-${u.ordinal}` }));
  const result = await renderMk1Docx(template, units, targets);
  assert.equal(result.mappedSegmentIds.length, 265);
  assert.deepEqual(result.mappedSegmentIds, units.map((u) => u.id));
  const segments=units.map((unit)=>{let targetText=targets[unit.ordinal].targetText;for(const code of unit.protectedCodes)targetText=targetText.replace(codeToken(code.id),code.literal);return{id:unit.id,index:unit.ordinal,sourceText:unit.sourceText,targetText};});
  const validation=await validateReconstructedMk1Docx(template,result.bytes,segments);
  assert.deepEqual(validation,{translationUnits:265,paragraphs:273,tables:3,rows:48,cells:100,pageBreaks:6,sections:1});
});
