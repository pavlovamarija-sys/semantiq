# Reconstruction invocation audit

The validated entry point remains `app.reconstruction.pipeline.reconstruct_pdf` / `core.build_typed_document`. The new worker boundary is authenticated `POST /reconstruct/model`. It accepts exact PDF bytes plus generation, source-artifact, source-hash, and config-hash identities; verifies the PDF and hash; executes the existing deterministic core; validates source coverage, ordered tokens, diagnostics, and legal heading order; and returns JSON only.

The only application caller is authenticated `POST /api/projects/[projectId]/reconstruction-generations`. No active production workflow imports or invokes it.
