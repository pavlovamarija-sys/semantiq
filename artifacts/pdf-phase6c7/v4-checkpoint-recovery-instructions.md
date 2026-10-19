# Authenticated v4 checkpoint recovery

Use an authenticated Chrome DevTools Console at `http://localhost:3000`.

- Endpoint: `POST /api/projects/ac1e24ca-b699-4863-ba99-f310fa220a8a/mk1-recoveries`
- Request key: `phase6c7-recovery-32006l0114-v4-checkpoints-v1`
- Source generation: `01eb331b-427d-4e77-b9ab-e40412bdef0a`
- Source run: `63a18859-19eb-4b91-afc3-0221b0544f1a`

```js
const response = await fetch(
  "/api/projects/ac1e24ca-b699-4863-ba99-f310fa220a8a/mk1-recoveries",
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
      sourceGenerationId: "01eb331b-427d-4e77-b9ab-e40412bdef0a",
      sourceRunId: "63a18859-19eb-4b91-afc3-0221b0544f1a",
      celex: "32006L0114",
      requestKey: "phase6c7-recovery-32006l0114-v4-checkpoints-v1"
    })
  }
);
const payload = await response.json();
console.log("HTTP", response.status, payload);
```

Expected first success: HTTP 201 with `generationId`, `runId`, `sdlxliffArtifactId`, `docxArtifactId`, `translationUnitCount: 265`, and `alreadyCompleted: false`.

For idempotency verification, run the identical snippet with no changes. Expected result after completion: HTTP 200, the same four IDs, `translationUnitCount: 265`, and `alreadyCompleted: true`.

If the browser times out, do not change the key. Wait for the original server request to finish, then run the identical snippet. An active request can return HTTP 422 and must not be paralleled. A failed recovery also returns HTTP 422 and must be diagnosed; changing the key is not an authorized recovery action. This endpoint contains no GPT-5.6 provider path, so invocation has zero model-call cost.
