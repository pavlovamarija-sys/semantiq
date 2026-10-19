# Phase 6C.7 v3 inline-code-preflight controlled run

## Frozen inputs

- CELEX: `32006L0114`
- Project: `ac1e24ca-b699-4863-ba99-f310fa220a8a`
- Document: `6b8a3125-eda7-46a2-9066-9b6d619713dc`
- Version: `74a67935-d57f-428f-aa34-d8d603ddda1e`
- Canonical snapshot: `d57fdd35-3b79-4f3a-b20a-3cfaf9941225`
- CAT projection: `768370ee-4c55-4fe4-9f6c-4b44921904b8`
- Studio source artifact: `9b2bc2fa-99ad-464d-b905-1dacf790de7a`
- Validated DOCX artifact: `b0e8fec5-91c8-4755-87a4-ff8f6dd8d307`

The failed generations `1ccd6fd8-c75e-4515-84c5-5e7511f64297` and `ad3a8f31-663d-460a-af31-e0fc8c985db3` remain immutable and are not resumed, reset, or reused.

## Cost controls

- Model: `gpt-5.6` (GPT-5.6 Sol alias)
- Reasoning effort: `high`
- Batch size: 10 TUs
- Maximum requests: 27
- Maximum output tokens per request: 4,000
- Maximum aggregate output tokens: 108,000
- Producer version: `canonical-mk1-phase6c7-v3-inline-code-preflight`

Before any provider call, the generation performs deterministic preflight over all 265 TUs and all 3 protected codes. The preflight passed: 3 literal Studio line-break codes are supported without changing the original SDLXLIFF source/skeleton bytes.

At current promotional pricing ($4/M input and $20/M output), expected usage is approximately 20k–30k input tokens and 8k–30k total output/reasoning tokens: approximately $0.24–$0.72. The application output ceiling costs at most $2.16 for output; allowing a conservative 100k-token input envelope gives a conservative application-run ceiling near $2.56. This is not an OpenAI account-budget guarantee. Confirm at least $3 remaining project credit and a compatible project/monthly usage limit before invocation.

## Invocation

Use an authenticated Chrome tab at `http://localhost:3000`.

Fixed new request key: `phase6c7-controlled-32006l0114-v3-inline-code-preflight`

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
      requestKey: "phase6c7-controlled-32006l0114-v3-inline-code-preflight"
    })
  }
);
const body = await response.json();
console.log("HTTP", response.status);
console.log(body);
```

Expected first success: HTTP 201 with `generationId`, `runId`, `sdlxliffArtifactId`, `docxArtifactId`, `translationUnitCount: 265`, and `alreadyCompleted: false`.

After HTTP 201 only, paste the identical snippet again. Expected idempotency response: HTTP 200 with the same four IDs, `translationUnitCount: 265`, and `alreadyCompleted: true`.

If the first request returns 422 or the browser loses the response, do not change the request key. Do not blindly repeat a potentially running paid request. Preserve the response and inspect the generation state first. The server rejects matching active or failed generations before any duplicate provider call.

## Checkpoint and usage-accounting assessment

Durable per-batch checkpoints and exact provider token accounting are not being added before this run. The current immutable design records batches only after generation and output validation; adding pre-call checkpoints safely requires a separate append-only attempt/checkpoint schema and atomic finalization changes. Introducing partial changes immediately before a paid run could weaken the generation contract or create ambiguous resumability. The v3 preflight removes the known post-call serialization failure. A later checkpoint enhancement should reserve an immutable run, append one attempt record per batch with provider response/usage/error data, and finalize only after every batch and TU is proven complete; failed generations must still never be resumed automatically.
