# Serialization determinism

The typed model, ordered visible text, node-to-paragraph/table mapping, table dimensions, and structural validation are deterministic for a fixed model and serializer version. Byte-identical DOCX ZIP packages are not promised because the underlying OOXML writer may emit package timestamps/metadata. Idempotency therefore guarantees one immutable persisted artifact for one logical request; it does not create a second package and compare ZIP hashes. The actual uploaded bytes are hashed, read back, and become the immutable identity.
