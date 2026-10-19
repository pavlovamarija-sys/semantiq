# Phase 6C.7 v4 controlled MK1 run

RLS verification: PASS in isolated local Supabase using two authenticated JWT identities. The linked production database was not reset or modified. Do not execute this request until paid execution is explicitly authorized.

- Producer: `canonical-mk1-phase6c7-v4-durable-checkpoints`
- Request key: `phase6c7-controlled-32006l0114-v4-durable-checkpoints`
- Model: `gpt-5.6`, reasoning `high`
- Batch size: 10; 27 total requests; maximum output 4,000/request
- Frozen snapshot: `d57fdd35-3b79-4f3a-b20a-3cfaf9941225`
- CAT projection: `768370ee-4c55-4fe4-9f6c-4b44921904b8`

Paste into an authenticated Chrome console at `http://localhost:3000`:

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
      requestKey: "phase6c7-controlled-32006l0114-v4-durable-checkpoints"
    })
  }
);
console.log("HTTP", response.status, await response.json());
```

HTTP 201 is expected on first completion. Repeat the identical request only after inspecting the generation if the browser loses the response. A completed batch checkpoint is never called again. If the request times out, inspect the generation and checkpoint rows; wait for an active generation, or recover only from validated checkpoints under the same generation. Do not change the key or start a second request while active. A failed generation remains immutable and requires a separately authorized new key.

The configured maximum output exposure is 108,000 tokens. At $4/M input and $20/M output, the conservative application envelope remains approximately $2.56; expected usage is approximately $0.24–$0.72. This is not an account spending-limit guarantee.
