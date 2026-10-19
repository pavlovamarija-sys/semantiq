# Controlled authenticated Phase 6C.5 invocation

The agent did not invoke this route because it has no authenticated browser session. After reviewing the request, an authenticated user may paste the following into Chrome DevTools while logged in at `http://localhost:3000`:

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
    requestKey: "phase6c5-controlled-32006l0114-v1"
  })
}).then(async response => ({ status: response.status, body: await response.json() })).then(console.log);
```

The first successful response should be HTTP 201 with `generationId`, `snapshotId`, `validatedDocxArtifactId`, `nodeCount`, `translationUnitCount`, `inlineCodeCount`, and `normalizedSourceSha256`. Repeating the identical request should return HTTP 200 with `alreadyCompleted:true` and the same snapshot identity/counts. No MK1 or SDLXLIFF operation is invoked.
