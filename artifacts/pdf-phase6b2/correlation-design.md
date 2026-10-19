# Correlation design

The record always includes a locally generated run ID, start/completion timestamps and the SHA-256 of the exact source byte array passed to the shadow request. When available at the integration point it also includes the active derived document ID and active DOCX SHA-256. The worker result can replace the local run ID with its returned run ID; transport failures retain the local ID.
