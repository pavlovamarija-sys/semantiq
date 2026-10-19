# Phase 6C.4 authenticated controlled invocation

While logged in at `http://localhost:3000`, paste this unchanged snippet into Chrome DevTools Console. Reuse it unchanged for the idempotency retry.

```js
await fetch("/api/projects/ac1e24ca-b699-4863-ba99-f310fa220a8a/validated-docx-generations", {
  method: "POST",
  credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    documentId: "6b8a3125-eda7-46a2-9066-9b6d619713dc",
    documentVersionId: "74a67935-d57f-428f-aa34-d8d603ddda1e",
    modelArtifactId: "5c09e46f-aa23-40d1-91e3-b9044a305272",
    requestKey: "phase6c4-controlled-32006l0114-v1",
    config: {}
  })
}).then(async r => ({ status: r.status, body: await r.json() })).then(console.log)
```

Expected first result: HTTP 201, `alreadyCompleted:false`, and `generationId`, `docxArtifactId`, `docxSha256`, `docxByteSize`, and structural metrics. The identical retry should return HTTP 200 with `alreadyCompleted:true` and the same generation/artifact/hash/size. No SDLXLIFF or downstream processing is invoked.

Afterward, download the exact immutable bytes through:

`http://localhost:3000/api/projects/ac1e24ca-b699-4863-ba99-f310fa220a8a/artifacts/<docxArtifactId>`

Hash those downloaded bytes and compare them to `docxSha256`; inspect the DOCX structure against the frozen 32006L0114 fixture before closing Phase 6C.4.
