import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { reconstructMk1Docx } from "./reconstruct-mk1-docx.ts";

async function template(paragraphs) {
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document><w:body>${paragraphs.map((p) => `<w:p><w:pPr/><w:r><w:t>${p}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}

test("reconstructs ordered MK1 text and preserves paragraph structure", async () => {
  const result = await reconstructMk1Docx(await template(["Article 1", "Source paragraph"]), [
    { id: "a", index: 0, sourceText: "Article 1", targetText: "Член 1" },
    { id: "b", index: 1, sourceText: "Source paragraph", targetText: "Изворен став" },
  ]);
  const zip = await JSZip.loadAsync(result.bytes);
  const xml = await zip.file("word/document.xml").async("string");
  assert.match(xml, /Член 1/); assert.match(xml, /Изворен став/); assert.equal(result.mappedSegmentIds.length, 2);
});

test("fails safely for missing or duplicate mappings", async () => {
  await assert.rejects(async () => reconstructMk1Docx(await template(["Only one"]), [
    { id: "a", index: 0, sourceText: "Only one", targetText: "Еден" },
    { id: "b", index: 1, sourceText: "Missing", targetText: "Недостасува" },
  ]), /map every segment/);
  await assert.rejects(async () => reconstructMk1Docx(await template(["Only one"]), [
    { id: "a", index: 0, sourceText: "Only one", targetText: "Еден" },
    { id: "a", index: 1, sourceText: "Only one", targetText: "Два" },
  ]), /duplicate segment IDs/);
});
