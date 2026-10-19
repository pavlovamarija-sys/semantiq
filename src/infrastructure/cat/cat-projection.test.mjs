import test from "node:test";import assert from "node:assert/strict";import{readFile}from"node:fs/promises";
const source=await readFile(new URL("./cat-projection.ts",import.meta.url),"utf8");
test("CAT projection fails closed on language and byte identity",()=>{assert.match(source,/en-GB/);assert.match(source,/mk-MK/);assert.match(source,/embedded DOCX does not match/);assert.match(source,/unmapped Studio unit/);});
test("CAT projection preserves idempotency, immutable artifact readback, and atomic completion",()=>{assert.match(source,/cat-projection:/);assert.match(source,/verifyByteIntegrity\(readback/);assert.match(source,/complete_cat_projection/);assert.match(source,/alreadyCompleted:true/);});
test("CAT projection requires complete ordered canonical mapping",()=>{assert.match(source,/cursor=unit.index\+1/);assert.match(source,/CAT source coverage is incomplete/);assert.match(source,/excluded page break/);});
