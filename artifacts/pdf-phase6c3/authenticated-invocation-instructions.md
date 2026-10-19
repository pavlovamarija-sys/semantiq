# Phase 6C.3 authenticated controlled invocation

Run this only from Chrome DevTools Console while signed in to `http://localhost:3000`. The authenticated cookies are same-origin and must not be copied elsewhere.

## Controlled identities

- CELEX: `32006L0114`
- project ID: `ac1e24ca-b699-4863-ba99-f310fa220a8a`
- document ID: `6b8a3125-eda7-46a2-9066-9b6d619713dc`
- document version ID: `74a67935-d57f-428f-aa34-d8d603ddda1e`
- SOURCE_PDF artifact ID: `2a09f056-05a9-4f07-9340-6610ca1d829b`
- registered source SHA-256: `1b0fb08ec46c93b9df62675f2b898030511dfcf5df4832b15cde56681932008b`
- registered size: `77654` bytes

## Actual API contract

- Method: `POST`
- Route: `/api/projects/ac1e24ca-b699-4863-ba99-f310fa220a8a/reconstruction-generations`
- Header: `Content-Type: application/json`
- Authentication: existing same-origin browser cookies
- Required JSON fields: `documentId`, `documentVersionId`, `sourceArtifactId`, `requestKey`
- Optional JSON field used explicitly here: `config: {}`
- Idempotency field: JSON `requestKey`; there is no idempotency header

## First invocation

```js
await (async () => {
  const response = await fetch(
    "/api/projects/ac1e24ca-b699-4863-ba99-f310fa220a8a/reconstruction-generations",
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "6b8a3125-eda7-46a2-9066-9b6d619713dc",
        documentVersionId: "74a67935-d57f-428f-aa34-d8d603ddda1e",
        sourceArtifactId: "2a09f056-05a9-4f07-9340-6610ca1d829b",
        requestKey: "phase6c3-controlled-32006l0114-v1",
        config: {}
      })
    }
  );
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  console.log("HTTP status:", response.status);
  console.log("Response:", body);
  return { status: response.status, body };
})();
```

Expected first status: `201`. Expected JSON fields: `generationId`, `modelArtifactId`, `sourceArtifactId`, `modelSha256`, `modelByteSize`, `alreadyCompleted: false`, and `metrics`.

## Idempotent retry

Paste the exact same snippet again, unchanged. It deliberately reuses the endpoint, complete body, empty configuration, and fixed `requestKey`.

Expected retry status: `200`. It should return the same `generationId`, `modelArtifactId`, `sourceArtifactId`, `modelSha256`, and `modelByteSize`, with `alreadyCompleted: true`. No second generation or model artifact should be created.

Copy back both complete console results, especially HTTP status, `generationId`, `modelArtifactId`, `sourceArtifactId`, `modelSha256`, `modelByteSize`, `alreadyCompleted`, and `metrics`.
