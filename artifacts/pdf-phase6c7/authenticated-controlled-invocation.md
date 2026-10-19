# Phase 6C.7 authenticated controlled invocation

This invocation triggers 27 paid GPT-5.6 batch requests. Run it only after explicitly approving that controlled cost, from Chrome DevTools on an authenticated `http://localhost:3000` page.

Endpoint: `POST /api/projects/ac1e24ca-b699-4863-ba99-f310fa220a8a/mk1-generations`

Fixed request key: `phase6c7-controlled-32006l0114-v1`

```js
const response = await fetch(
  "/api/projects/ac1e24ca-b699-4863-ba99-f310fa220a8a/mk1-generations",
  {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      documentId: "6b8a3125-eda7-46a2-9066-9b6d619713dc",
      documentVersionId: "74a67935-d57f-428f-aa34-d8d603ddda1e",
      canonicalSnapshotId: "d57fdd35-3b79-4f3a-b20a-3cfaf9941225",
      catProjectionId: "768370ee-4c55-4fe4-9f6c-4b44921904b8",
      sdlxliffArtifactId: "9b2bc2fa-99ad-464d-b905-1dacf790de7a",
      validatedDocxArtifactId: "b0e8fec5-91c8-4755-87a4-ff8f6dd8d307",
      celex: "32006L0114",
      requestKey: "phase6c7-controlled-32006l0114-v1"
    })
  }
);
console.log("HTTP", response.status);
console.log(await response.json());
```

Expected first success: HTTP 201 with `generationId`, `runId`, `sdlxliffArtifactId`, `docxArtifactId`, `translationUnitCount: 265`, and `alreadyCompleted: false`.

After a successful first request, paste the identical snippet again. Expected retry: HTTP 200, the same IDs, `translationUnitCount: 265`, and `alreadyCompleted: true`.

Do not retry with a new key after a failed or interrupted paid run. Preserve the failed generation evidence and diagnose recovery first.

