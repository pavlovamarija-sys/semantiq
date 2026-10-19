# Security and RLS audit

Current controls are sound foundations: authenticated server clients carry user cookies; database RLS resolves project ownership; private Storage paths begin with owner/project; downloads use short-lived signed URLs; there is no Storage UPDATE policy.

Future policies should:

- permit artifact/generation/snapshot reads only through an owned project;
- permit inserts only when `created_by=auth.uid()` and project/document/version ownership agrees;
- disallow ordinary UPDATE/DELETE on available artifacts and relationships; expose narrow SECURITY INVOKER functions for state transitions/purge;
- validate Storage path segments `[owner, project, document, version, artifacts, artifact]` against DB ownership;
- keep signed URLs short-lived and generated only after document/artifact ownership checks;
- prevent cross-project relationships and translation mappings through triggers plus RLS;
- keep workers stateless. Prefer authenticated application-mediated uploads; if background infrastructure later needs service role, isolate it server-side, scope operations in application logic, and never expose credentials to browser/worker logs.

No current RLS policy needs weakening. New artifact MIME limits may require a separate private `document-artifacts` bucket because `source-documents` currently permits only PDF/DOCX, while SDLXLIFF/JSON/ZIP are needed.
