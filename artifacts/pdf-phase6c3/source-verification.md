# Source verification

The orchestrator resolves one available `SOURCE_PDF` by exact artifact/project/document/version identity, downloads its existing private Storage object, verifies `%PDF-`, SHA-256, and byte size, and sends those exact bytes to the worker. It re-downloads and verifies the source before finalization. Missing, invalid, cross-scope, changed, or unregistered sources fail closed.

Controlled candidate: artifact `2a09f056-05a9-4f07-9340-6610ca1d829b`, version `74a67935-d57f-428f-aa34-d8d603ddda1e`, SHA-256 `1b0fb08ec46c93b9df62675f2b898030511dfcf5df4832b15cde56681932008b`, 77,654 bytes.
