# Access root cause

`32008L0050` was not accessible remotely to Codex. It was verifiable because the user had previously opened the exact source through the application's authenticated route and retained the downloaded bytes at `artifacts/pdf-phase6b/manual-verification/e66411bf-204a-4d08-8035-35a161cdc0cf.pdf`.

All ten objects use the private `source-documents` bucket and the same owner/project/document/version path convention. Eight remaining objects share the same project as `32008L0050`; one (`32025D1397`) belongs to another project. The path and legacy age do not explain access. The decisive difference is possession of user-mediated authenticated byte evidence.

Storage SELECT requires an authenticated user whose UID is the first path segment and who owns the project in the second segment. The CLI has database migration credentials but no user browser session and no application service-role storage credential. Database access can inventory metadata but cannot legitimately fetch private object bytes. This applies to each of the nine candidates.
