import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ExactArtifactReadError, readExactArtifact, safeArtifactDownloadName } from "./exact-artifact-readback.ts";

const projectId=randomUUID(), artifactId=randomUUID(), documentId=randomUUID(), versionId=randomUUID(), ownerId=randomUUID();
const bytes=new TextEncoder().encode('{"schemaVersion":"eu-acquis.reconstruction-model.v1"}');
const row=(overrides={})=>({id:artifactId,ownerId,projectId,documentId,documentVersionId:versionId,
  processingGenerationId:randomUUID(),artifactType:"RECONSTRUCTION_MODEL",artifactGeneration:1,status:"available",
  storageBucket:"document-artifacts",storagePath:`${ownerId}/${projectId}/${documentId}/${versionId}/artifacts/${artifactId}/reconstruction-model.json`,
  originalFilename:"reconstruction-model.json",sha256:createHash("sha256").update(bytes).digest("hex"),byteSize:bytes.length,
  mimeType:"application/json",producerKind:"worker",producerVersion:"1",...overrides});

class Repo{constructor(value=row()){this.value=value;this.mutations=0;}async findScoped(p,id){return this.value&&this.value.projectId===p&&this.value.id===id?this.value:null;}async find(id){return this.value?.id===id?this.value:null;}async reserve(){this.mutations++;throw Error();}async markUploading(){this.mutations++;}async finalize(){this.mutations++;throw Error();}async markFailed(){this.mutations++;}}
class Storage{constructor(value=bytes){this.value=value;this.uploads=0;this.requests=[];}async download(bucket,path){this.requests.push({bucket,path});return this.value?.slice()??null;}async upload(){this.uploads++;}}

test("unauthenticated route returns 401 before artifact access",async()=>{const route=await readFile(new URL("../../app/api/projects/[projectId]/artifacts/[artifactId]/route.ts",import.meta.url),"utf8");assert.match(route,/if\(!user\).*status:401/);assert.ok(route.indexOf("getAuthenticatedUser")<route.indexOf("createSupabaseServerClient"));});
test("authorized exact artifact returns unchanged stored bytes",async()=>{const result=await readExactArtifact(new Repo(),new Storage(),projectId,artifactId);assert.deepEqual(result.bytes,bytes);});
test("nonexistent artifact is not found",async()=>{await assert.rejects(readExactArtifact(new Repo(null),new Storage(),projectId,artifactId),e=>e instanceof ExactArtifactReadError&&e.code==="not_found");});
test("wrong project fails closed",async()=>{await assert.rejects(readExactArtifact(new Repo(),new Storage(),randomUUID(),artifactId),/not found/i);});
test("cross-project row is rejected even if a repository misbehaves",async()=>{const repo=new Repo(row({projectId:randomUUID()}));repo.findScoped=async()=>repo.value;await assert.rejects(readExactArtifact(repo,new Storage(),projectId,artifactId),/not found/i);});
test("caller cannot supply or override storage identity",async()=>{const storage=new Storage();const artifact=row();await readExactArtifact(new Repo(artifact),storage,projectId,artifactId);assert.deepEqual(storage.requests,[{bucket:artifact.storageBucket,path:artifact.storagePath}]);const route=await readFile(new URL("../../app/api/projects/[projectId]/artifacts/[artifactId]/route.ts",import.meta.url),"utf8");assert.doesNotMatch(route,/request\.json|searchParams|storageBucket|storagePath/);});
test("reserved artifact is unavailable",async()=>{await assert.rejects(readExactArtifact(new Repo(row({status:"reserved"})),new Storage(),projectId,artifactId),e=>e.code==="unavailable");});
test("missing storage object fails closed",async()=>{await assert.rejects(readExactArtifact(new Repo(),new Storage(null),projectId,artifactId),e=>e.code==="integrity_failure");});
test("byte-size mismatch fails closed",async()=>{await assert.rejects(readExactArtifact(new Repo(row({byteSize:bytes.length+1})),new Storage(),projectId,artifactId),e=>e.code==="integrity_failure");});
test("SHA-256 mismatch fails closed",async()=>{await assert.rejects(readExactArtifact(new Repo(row({sha256:"0".repeat(64)})),new Storage(),projectId,artifactId),e=>e.code==="integrity_failure");});
test("persisted MIME type and safe filename remain response metadata",async()=>{const result=await readExactArtifact(new Repo(),new Storage(),projectId,artifactId);assert.equal(result.artifact.mimeType,"application/json");assert.equal(safeArtifactDownloadName(result.artifact),"reconstruction-model.json");const route=await readFile(new URL("../../app/api/projects/[projectId]/artifacts/[artifactId]/route.ts",import.meta.url),"utf8");assert.match(route,/"Content-Type":result\.artifact\.mimeType/);});
test("exact byte sequence is not transformed or reserialized",async()=>{const odd=new TextEncoder().encode('{ "z": 1, "a": 2 }\n');const artifact=row({sha256:createHash("sha256").update(odd).digest("hex"),byteSize:odd.length});const result=await readExactArtifact(new Repo(artifact),new Storage(odd),projectId,artifactId);assert.deepEqual(result.bytes,odd);});
test("readback performs no mutation",async()=>{const repo=new Repo(),storage=new Storage();await readExactArtifact(repo,storage,projectId,artifactId);assert.equal(repo.mutations,0);assert.equal(storage.uploads,0);});
test("RECONSTRUCTION_MODEL is supported",async()=>{const result=await readExactArtifact(new Repo(),new Storage(),projectId,artifactId);assert.equal(result.artifact.artifactType,"RECONSTRUCTION_MODEL");});
test("reader is generic across immutable artifact types",async()=>{for(const type of ["SOURCE_PDF","VALIDATED_DOCX","CANONICAL_SNAPSHOT","STUDIO_SDLXLIFF_SOURCE"]){const artifact=row({artifactType:type});const result=await readExactArtifact(new Repo(artifact),new Storage(),projectId,artifactId);assert.equal(result.artifact.artifactType,type);}});
