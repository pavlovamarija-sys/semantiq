# Authenticated corrected MK1 DOCX generation

Run this once in Chrome DevTools while authenticated at `http://localhost:3000`:

```js
const response = await fetch(
  "/api/projects/ac1e24ca-b699-4863-ba99-f310fa220a8a/mk1-docx-corrections",
  {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      documentId: "6b8a3125-eda7-46a2-9066-9b6d619713dc",
      documentVersionId: "74a67935-d57f-428f-aa34-d8d603ddda1e",
      canonicalSnapshotId: "d57fdd35-3b79-4f3a-b20a-3cfaf9941225",
      sourceRecoveryGenerationId: "0aef4e29-711a-4cd1-9e9d-1d3f4bc560a2",
      sourceRunId: "7ec58b3d-5829-48da-83e5-9146097dc06b",
      validatedDocxArtifactId: "b0e8fec5-91c8-4755-87a4-ff8f6dd8d307",
      supersededDocxArtifactId: "d67fe184-9227-40e1-81ef-082f6249608a",
      celex: "32006L0114",
      requestKey: "phase6c7-docx-line-break-correction-32006l0114-v1"
    })
  }
);
const payload = await response.json();
console.log("HTTP", response.status, payload);
```

Expected first success: HTTP 201 with `generationId`, `docxArtifactId`, `docxSha256`, `docxByteSize`, `translationUnitCount: 265`, and `alreadyCompleted: false`. The deterministic offline expectation is SHA-256 `e87ccb54bfa3878a107889e9bdc071c6977a4f213c11da88a8639018f536c088` and 887,530 bytes; the persisted response and independent readback remain authoritative.

Run the identical snippet for idempotency verification. Expected: HTTP 200 with the same IDs/hash/size and `alreadyCompleted: true`.

If the request times out, do not change the key or start a parallel request. Wait, then repeat the identical request. HTTP 422 from an active or failed correction requires diagnosis. This endpoint has no model-provider path and cannot call GPT-5.6.

After success, download the returned artifact from:

`http://localhost:3000/api/projects/ac1e24ca-b699-4863-ba99-f310fa220a8a/artifacts/<docxArtifactId>`

Save it unchanged under `artifacts/pdf-phase6c7/corrected-docx-readback/` for final actual-byte validation.
