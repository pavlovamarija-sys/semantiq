import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  RECONSTRUCTION_ALGORITHM_VERSION, reconstructionConfigIdentity,
  reconstructionRequestIdentity, stableJson,
} from "./reconstruction-generation.ts";

test("configuration identity is deterministic across key order", () => {
  assert.equal(stableJson({b:2,a:{d:4,c:3}}), '{"a":{"c":3,"d":4},"b":2}');
  assert.equal(reconstructionConfigIdentity({b:2,a:1}), reconstructionConfigIdentity({a:1,b:2}));
});

test("logical retries share identity while changed request, algorithm, or config differs", () => {
  const base={projectId:"10000000-0000-4000-8000-000000000001",sourceArtifactId:"20000000-0000-4000-8000-000000000002",sourceSha256:"a".repeat(64),algorithmVersion:RECONSTRUCTION_ALGORITHM_VERSION,configSha256:reconstructionConfigIdentity({}),requestKey:"controlled"};
  assert.deepEqual(reconstructionRequestIdentity(base),reconstructionRequestIdentity({...base}));
  assert.notEqual(reconstructionRequestIdentity(base).idempotencyKey,reconstructionRequestIdentity({...base,requestKey:"intentional-new"}).idempotencyKey);
  assert.notEqual(reconstructionRequestIdentity(base).inputFingerprintSha256,reconstructionRequestIdentity({...base,algorithmVersion:"next"}).inputFingerprintSha256);
  assert.notEqual(reconstructionRequestIdentity(base).inputFingerprintSha256,reconstructionRequestIdentity({...base,configSha256:"b".repeat(64)}).inputFingerprintSha256);
});

test("production boundary is explicit and absent from CELEX and active converter", async () => {
  const [service,celex,converter]=await Promise.all([
    readFile(new URL("./reconstruction-generation.ts",import.meta.url),"utf8"),
    readFile(new URL("../../app/app/projects/[projectId]/celex-actions.ts",import.meta.url),"utf8"),
    readFile(new URL("../document-conversion/pdf-to-docx.ts",import.meta.url),"utf8")]);
  assert.match(service,/\/reconstruct\/model/);
  assert.doesNotMatch(celex,/runReconstructionGeneration|reconstruct\/model|RECONSTRUCTION_MODEL/);
  assert.doesNotMatch(converter,/runReconstructionGeneration|reconstruct\/model|RECONSTRUCTION_MODEL/);
});

test("atomic completion migration enforces source lineage and publishes no VALIDATED_DOCX", async () => {
  const sql=await readFile(new URL("../../../supabase/migrations/20261020000000_complete_reconstruction_generation.sql",import.meta.url),"utf8");
  assert.match(sql,/artifact_type='SOURCE_PDF'/);
  assert.match(sql,/artifact_type='RECONSTRUCTION_MODEL'/);
  assert.match(sql,/relationship_type,input_role/);
  assert.match(sql,/'derived_from','source_pdf'/);
  assert.doesNotMatch(sql,/VALIDATED_DOCX/);
});

test("source scope, PDF signature, hash, stale re-read, and failure recording are fail-closed", async () => {
  const source=await readFile(new URL("./reconstruction-generation.ts",import.meta.url),"utf8");
  assert.match(source,/eq\("project_id", request\.projectId\)/);
  assert.match(source,/eq\("document_version_id", request\.documentVersionId\)/);
  assert.match(source,/eq\("artifact_type", "SOURCE_PDF"\)/);
  assert.match(source,/assertPdf\(sourceBytes\)/);
  assert.equal((source.match(/verifyByteIntegrity\(/g)??[]).length>=2,true);
  assert.match(source,/SOURCE_PDF disappeared before model finalization/);
  assert.match(source,/error_code:"reconstruction_failed"/);
});
