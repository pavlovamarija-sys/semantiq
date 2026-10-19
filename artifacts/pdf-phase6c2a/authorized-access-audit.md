# Authorized access audit

The existing route `/api/projects/{projectId}/documents/{documentId}/storage/source` is the correct mechanism. It:

1. requires the normal authenticated browser session;
2. validates UUID parameters;
3. verifies the document belongs to the requested project through RLS;
4. resolves the source object from `document_versions`;
5. creates a 60-second signed URL; and
6. redirects the browser to that exact persisted object.

The project page already links each source filename to this route, including corrigenda. No general privileged endpoint, anonymous policy, cookie persistence, service-role key, worker bypass, or external source download exists or is needed.

Because the current process cannot use the browser session, manual user-mediated downloads are required. The local files are byte evidence only and must never be uploaded back to Supabase.
