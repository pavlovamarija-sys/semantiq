import assert from "node:assert/strict";
import test from "node:test";
import { isConvertedDocxAvailable } from "./converted-docx-readiness.ts";

test("metadata-present but missing Storage object is unavailable", () => {
  assert.equal(isConvertedDocxAvailable({ documentType: "docx", transformationStatus: "ready", storageObjectExists: false }), false);
});

test("ready DOCX with an existing Storage object remains available", () => {
  assert.equal(isConvertedDocxAvailable({ documentType: "docx", transformationStatus: "ready", storageObjectExists: true }), true);
});
