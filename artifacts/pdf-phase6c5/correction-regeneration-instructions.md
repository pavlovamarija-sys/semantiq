# Phase 6C.5 corrective regeneration

The original snapshot `41c043ad-a210-4e17-b6f4-5cf98872a602` and generation `26276c49-8c0f-456e-8a3e-cce032f9b633` are immutable historical evidence and must not be changed. Use a new request key after deploying migration `20261023000000_fix_canonical_persistence_contract.sql`:

```js
await fetch("http://localhost:3000/api/projects/ac1e24ca-b699-4863-ba99-f310fa220a8a/canonical-generations", {
  method: "POST",
  credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    documentId: "6b8a3125-eda7-46a2-9066-9b6d619713dc",
    documentVersionId: "74a67935-d57f-428f-aa34-d8d603ddda1e",
    validatedDocxArtifactId: "b0e8fec5-91c8-4755-87a4-ff8f6dd8d307",
    sourceLanguage: "en",
    requestKey: "phase6c5-controlled-32006l0114-correction-v1"
  })
}).then(async response => ({ status: response.status, body: await response.json() })).then(console.log);
```

Repeat the identical request once for the idempotency check. Expected first status is 201 and retry status is 200 with `alreadyCompleted:true`. Expected corrected persisted values are 422 nodes, 265 TUs with ordinals 0..264, 3 inline codes, 3,389 normalized tokens, and the existing DOCX/source hashes. Do not invoke CAT, SDLXLIFF or MK1.
