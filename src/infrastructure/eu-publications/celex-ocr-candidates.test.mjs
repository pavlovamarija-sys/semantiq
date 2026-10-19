import assert from "node:assert/strict";
import test from "node:test";

import { analyzeCelexOcr, detectCelexCandidates } from "./celex-ocr-candidates.ts";

test("recovers an extra OCR character and a type-position 1", () => {
  assert.deepEqual(detectCelexCandidates("13199010426"), [{
    value: "31990L0426",
    original: "13199010426",
    status: "review",
    correction: "structure_recovery",
  }]);
});

test("recovers L when OCR reads 1 in the document-type position", () => {
  assert.deepEqual(detectCelexCandidates("3199010427"), [{
    value: "31990L0427",
    original: "3199010427",
    status: "review",
    correction: "structure_recovery",
  }]);
});

for (const celex of ["31990L0426", "31990L0427"]) {
  test(`preserves valid CELEX ${celex}`, () => {
    assert.deepEqual(detectCelexCandidates(celex), [{
      value: celex,
      status: "detected",
      correction: "none",
    }]);
  });
}

test("recovers both identifiers from the real OCR output", () => {
  assert.deepEqual(
    detectCelexCandidates("13199010426\n\n3199010427\n").map(({ value, status }) => ({ value, status })),
    [
      { value: "31990L0426", status: "review" },
      { value: "31990L0427", status: "review" },
    ],
  );
});

test("reports raw tokens, normalized candidates, and rejected-token reasons", () => {
  const analysis = analyzeCelexOcr("3199010427 NOTACELEX 12345");
  assert.deepEqual(analysis.rawTokens, ["3199010427", "12345"]);
  assert.equal(analysis.candidates[0].value, "31990L0427");
  assert.deepEqual(analysis.rejectedTokens, [{
    token: "12345",
    reason: "No unique valid CELEX-shaped recovery",
  }]);
});
