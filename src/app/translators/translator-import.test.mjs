import test from "node:test";
import assert from "node:assert/strict";
import { mapImportRows, normalizeSubmittedImportRow, parseCsv } from "./translator-import.ts";

test("maps a UTF-8 BOM Macedonian 20-translator CSV", () => {
  const lines = ["\uFEFFИме,Презиме,Јазична комбинација,Е-пошта"];
  for (let index = 1; index <= 20; index++) lines.push(`Име${index},Презиме${index},Англиски → Македонски,translator${index}@example.mk`);
  const rows = mapImportRows(parseCsv(lines.join("\r\n")));
  assert.equal(rows.length, 20);
  assert.deepEqual(rows[0], { fullName:"Име1 Презиме1", email:"translator1@example.mk", sourceLanguage:"Англиски", targetLanguage:"Македонски", specialization:"Правен превод", availability:"Available", notes:"", rowNumber:2 });
  assert.equal(rows[19].fullName, "Име20 Презиме20");
  assert.equal(rows[19].rowNumber, 21);
});

test("recognizes English headers and quoted CSV values", () => {
  const rows = mapImportRows(parseCsv('First Name,Last Name,Language Pair,Email\n"Ana, Maria",Stone,English -> Macedonian,ana@example.com'));
  assert.equal(rows[0].fullName, "Ana, Maria Stone");
  assert.equal(rows[0].sourceLanguage, "English");
  assert.equal(rows[0].targetLanguage, "Macedonian");
});

test("normalizes the legacy snake_case browser payload accepted by the server action", () => {
  assert.deepEqual(normalizeSubmittedImportRow({full_name:"Ана Петрова",email:"ana@example.mk",source_language:"Англиски",target_language:"Македонски",specialization:"Правен превод",availability:"Available",notes:""},0), {fullName:"Ана Петрова",email:"ana@example.mk",sourceLanguage:"Англиски",targetLanguage:"Македонски",specialization:"Правен превод",availability:"Available",notes:"",rowNumber:2});
});
