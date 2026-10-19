# Unicode-correct canonical regeneration

Historical generation `a53b41bf-6118-43ba-b2f9-b7e4417fea4c` and snapshot `9773853e-9f81-4796-b358-38a3f53e1d81` remain immutable. After restarting/reloading the worker with extractor `docx-canonical-phase6c5-v2-unicode`, paste this into Chrome while authenticated at `http://localhost:3000`:

```js
const body = { documentId: "6b8a3125-eda7-46a2-9066-9b6d619713dc", documentVersionId: "74a67935-d57f-428f-aa34-d8d603ddda1e", validatedDocxArtifactId: "b0e8fec5-91c8-4755-87a4-ff8f6dd8d307", sourceLanguage: "en", requestKey: "phase6c5-unicode-corrected-32006l0114-v1" };
await fetch("http://localhost:3000/api/projects/ac1e24ca-b699-4863-ba99-f310fa220a8a/canonical-generations", {method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)}).then(async r=>({status:r.status,body:await r.json()})).then(console.log);
```

Repeat the identical request once for idempotency. Expected first status is 201; retry is 200. Verify extractor version `docx-canonical-phase6c5-v2-unicode`, 422 nodes, 265 TUs with ordinals 0..264, 3 inline codes and 3,389 tokens. Do not modify historical rows.
