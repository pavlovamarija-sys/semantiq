import assert from "node:assert/strict";
import test from "node:test";
import { runDeterministicLegalQa } from "./deterministic-legal-qa.ts";

test("passes preserved legal anchors across EN and MK forms", () => {
  const result = runDeterministicLegalQa(
    "Article 7, paragraph 2 of Regulation (EU) 2016/679 applies in Ireland from 1 January 2025 to EUR 1 000 (15 %) under CELEX 32016R0679, point (a).",
    "Член 7, став 2 од Регулатива (ЕУ) 2016/679 се применува во Ирска од 1 јануари 2025 година на 1 000 EUR (15 %), според CELEX 32016R0679, точка (а).",
  );
  assert.equal(result.status, "PASS");
  assert.ok(result.findings.length >= 8);
  assert.ok(result.findings.every((finding) => finding.status === "PASS"));
});

test("reports missing anchors as errors", () => {
  const result = runDeterministicLegalQa(
    "Article 4 of Directive 2010/13/EU applies in Denmark on 12 May 2024.",
    "Оваа одредба се применува во Данска.",
  );
  assert.equal(result.status, "ERROR");
  assert.ok(result.findings.some((finding) => finding.category === "ARTICLE_PARAGRAPH" && finding.targetValue === null));
  assert.ok(result.findings.some((finding) => finding.category === "DATE" && finding.status === "ERROR"));
});

test("reports changed anchors with source and target values", () => {
  const result = runDeterministicLegalQa(
    "Article 5 requires 20 % and EUR 500 in Ireland, point (b).",
    "Член 6 бара 25 % и 700 EUR во Данска, точка (в).",
  );
  assert.equal(result.status, "ERROR");
  for (const category of ["ARTICLE_PARAGRAPH", "PERCENTAGE", "AMOUNT_CURRENCY", "COUNTRY_NAMED_ENTITY", "ENUMERATED_POINT"]) {
    assert.ok(result.findings.some((finding) => finding.category === category && finding.status === "ERROR" && finding.sourceValue && finding.targetValue));
  }
});

test("accepts bilingual legal headings and Macedonian enumeration", () => {
  const result = runDeterministicLegalQa(
    "CHAPTER IV. ANNEX A. (f) Council Directive 90/426/EEC.",
    "ПОГЛАВЈЕ IV. ПРИЛОГ А. (ѓ) Советот Директива 90/426/ЕЕЗ.",
  );
  assert.equal(result.status, "PASS");
  assert.ok(result.findings.every((finding) => finding.status === "PASS"));
});

test("does not flag translated institutional headings or transliterated names", () => {
  const result = runDeterministicLegalQa(
    "THE COUNCIL OF THE EUROPEAN COMMUNITIES, M. O'KENNEDY, ANNEX B",
    "СОВЕТОТ НА ЕВРОПСКИТЕ ЗАЕДНИЦИ, М. О'КЕНЕДИ, АНЕКС Б",
  );
  assert.equal(result.status, "PASS");
});

test("keeps strict numeric legal-reference checks", () => {
  const result = runDeterministicLegalQa(
    "Article 4 of Directive 90/426/EEC applies on 12 May 2024 and requires 20 %.",
    "Член 5 од Директивата 90/427/ЕЕЗ се применува на 13 мај 2024 и бара 25 %.",
  );
  assert.equal(result.status, "ERROR");
  assert.ok(result.findings.some((finding) => finding.category === "ARTICLE_PARAGRAPH" && finding.status === "ERROR"));
  assert.ok(result.findings.some((finding) => finding.category === "LEGAL_INSTRUMENT" && finding.status === "ERROR"));
  assert.ok(result.findings.some((finding) => finding.category === "DATE" && finding.status === "ERROR"));
  assert.ok(result.findings.some((finding) => finding.category === "PERCENTAGE" && finding.status === "ERROR"));
});
