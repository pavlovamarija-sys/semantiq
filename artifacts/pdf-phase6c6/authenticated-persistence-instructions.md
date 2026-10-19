# Phase 6C.6 authenticated CAT persistence

Open Chrome DevTools Console while authenticated at `http://localhost:3000`, then paste this entire snippet. Select `validated-docx-corrected.sdlxliff` first and `Project 5.sdlproj` second when prompted.

```js
const [sdlHandle] = await showOpenFilePicker({
  multiple: false,
  types: [{ description: "Studio SDLXLIFF", accept: { "application/xml": [".sdlxliff"] } }],
});
const [projectHandle] = await showOpenFilePicker({
  multiple: false,
  types: [{ description: "Trados Studio project", accept: { "application/xml": [".sdlproj"] } }],
});
const sdlxliff = await sdlHandle.getFile();
const studioProject = await projectHandle.getFile();
const form = new FormData();
form.set("documentId", "6b8a3125-eda7-46a2-9066-9b6d619713dc");
form.set("documentVersionId", "74a67935-d57f-428f-aa34-d8d603ddda1e");
form.set("canonicalSnapshotId", "d57fdd35-3b79-4f3a-b20a-3cfaf9941225");
form.set("requestKey", "phase6c6-controlled-32006l0114-v1");
form.set("sdlxliff", sdlxliff, "validated-docx-corrected.sdlxliff");
form.set("studioProject", studioProject, "Project 5.sdlproj");
await fetch("/api/projects/ac1e24ca-b699-4863-ba99-f310fa220a8a/cat-projections", {
  method: "POST",
  credentials: "same-origin",
  body: form,
}).then(async response => ({ status: response.status, body: await response.json() })).then(console.log);
```

Expected first status: HTTP 201. Copy back `generationId`, `projectionId`, and `artifactId`.

For the idempotency retry, rerun the same snippet, select the same two unchanged files, and expect HTTP 200 with the same IDs and `alreadyCompleted: true`.
