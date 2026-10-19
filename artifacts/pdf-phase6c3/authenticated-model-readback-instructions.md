# Authenticated controlled model readback

Phase 6C.3 remains PARTIAL until this manual readback is completed and the resulting local file is independently verified.

While signed in using the same Chrome profile at `http://localhost:3000`, open:

`http://localhost:3000/api/projects/ac1e24ca-b699-4863-ba99-f310fa220a8a/artifacts/5c09e46f-aa23-40d1-91e3-b9044a305272`

The route resolves exactly artifact `5c09e46f-aa23-40d1-91e3-b9044a305272` within project `ac1e24ca-b699-4863-ba99-f310fa220a8a`. It does not select a latest artifact and accepts no caller-provided storage identity.

Expected behavior: HTTP 200 downloads the verified original `application/json` bytes as `reconstruction-model.json`. Authentication failure returns 401; inaccessible/nonexistent identity returns 404; unavailable or integrity-invalid bytes are not returned.

Save the downloaded file exactly as:

`D:\EU Acquis AI App\artifacts\pdf-phase6c3\controlled-run-readback\reconstruction-model.json`

Expected independent checks after download:

- SHA-256: `63fb1a805d02484ca9aa5d951dd441b98a0e5155dd64f08fc5f25b623ac33520`
- byte size: `3184355`
- valid JSON conforming to `eu-acquis.reconstruction-model.v1`

The local file is verification evidence only. Do not upload or register it as another artifact.
