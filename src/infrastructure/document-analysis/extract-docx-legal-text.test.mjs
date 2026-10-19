import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { extractDocxLegalParagraphs } from "./extract-docx-legal-text.ts";

async function docx(body) {
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}

test("extracts normal, inserted and table-cell paragraphs in source order", async () => {
  const bytes = await docx(`<w:p><w:r><w:t>Article </w:t></w:r><w:r><w:t>1</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:ins><w:r><w:t>Accepted cell</w:t></w:r></w:ins></w:p></w:tc></w:tr></w:tbl>`);
  assert.deepEqual(await extractDocxLegalParagraphs(bytes), ["Article 1", "Accepted cell"]);
});

test("excludes deleted revision content", async () => {
  const bytes = await docx(`<w:p><w:del><w:r><w:delText>Old text</w:delText></w:r></w:del><w:ins><w:r><w:t>Current text</w:t></w:r></w:ins></w:p>`);
  assert.deepEqual(await extractDocxLegalParagraphs(bytes), ["Current text"]);
});
