import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";

import { countDocxCharacters, countVisibleCharacters, translationPages } from "./character-counts.ts";

const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

test("counts normal spaces but excludes every whitespace character from the no-spaces total", () => {
  assert.deepEqual(countVisibleCharacters("EU law\t42\nA\u00a0B"), {
    charactersWithoutSpaces: 9,
    charactersWithSpaces: 11,
  });
  assert.deepEqual(translationPages({ charactersWithoutSpaces: 42385, charactersWithSpaces: 47052 }), {
    pages1500NoSpaces: 42385 / 1500,
    pages1800WithSpaces: 47052 / 1800,
  });
});

test("counts body, tables, headers and real Word footnote/endnote parts without metadata", async () => {
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document xmlns:w="${w}"><w:body><w:p><w:r><w:t>Body 12</w:t></w:r><w:footnoteReference w:id="1"/></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table!</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`);
  zip.file("word/footnotes.xml", `<w:footnotes xmlns:w="${w}"><w:footnote w:id="-1"><w:p><w:r><w:t></w:t></w:r></w:p></w:footnote><w:footnote w:id="1"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:t>Foot note.</w:t></w:r></w:p></w:footnote></w:footnotes>`);
  zip.file("word/endnotes.xml", `<w:endnotes xmlns:w="${w}"><w:endnote w:id="1"><w:p><w:r><w:t>End note</w:t></w:r></w:p></w:endnote></w:endnotes>`);
  zip.file("word/header1.xml", `<w:hdr xmlns:w="${w}"><w:p><w:r><w:t>Header</w:t></w:r></w:p></w:hdr>`);
  zip.file("docProps/core.xml", "<title>Technical metadata must not count</title>");
  const bytes = await zip.generateAsync({ type: "uint8array" });

  assert.deepEqual(await countDocxCharacters(bytes), {
    charactersWithoutSpaces: 34,
    charactersWithSpaces: 37,
  });
});
