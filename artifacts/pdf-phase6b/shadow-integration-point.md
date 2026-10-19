# Shadow integration point

Shadow execution branches after the active converter has returned a DOCX and the active DOCX has passed validation, but before authoritative persistence. It receives the same source PDF bytes and calls the opt-in worker endpoint `/shadow/reconstruct`. Its result is logged only; it cannot replace the active DOCX or status.

The feature flag is `PDF_TO_DOCX_SHADOW_RECONSTRUCTION=true`; absent or any other value means OFF. The default is OFF. The active path still calls `/convert/pdf-to-docx` and persists only its output.
