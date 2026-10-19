# Generation identity

`processing_generations` remains the execution envelope. Identity includes project, exact source artifact/hash, `pdf_reconstruction`, algorithm version, stable configuration SHA-256, and explicit request key. A retry with the same logical key converges; an intentional new execution requires a new request key. Changed algorithm/configuration changes the input fingerprint. Terminal failures remain audit records and are not silently reused.
