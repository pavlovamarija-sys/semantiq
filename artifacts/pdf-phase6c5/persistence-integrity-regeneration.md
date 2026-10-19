# Persistence-integrity guarded regeneration

Migration `20261024000000_verify_canonical_persisted_hashes.sql` is deployed. Use a new request key so the new immutable generation is finalized under the database-side hash guard:

```js
const body={documentId:"6b8a3125-eda7-46a2-9066-9b6d619713dc",documentVersionId:"74a67935-d57f-428f-aa34-d8d603ddda1e",validatedDocxArtifactId:"b0e8fec5-91c8-4755-87a4-ff8f6dd8d307",sourceLanguage:"en",requestKey:"phase6c5-persistence-integrity-32006l0114-v1"};
await fetch("http://localhost:3000/api/projects/ac1e24ca-b699-4863-ba99-f310fa220a8a/canonical-generations",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(async r=>({status:r.status,body:await r.json()})).then(console.log);
```

Repeat the identical snippet once. Expected: HTTP 201 then HTTP 200 with the same IDs. Historical snapshots remain unchanged.
