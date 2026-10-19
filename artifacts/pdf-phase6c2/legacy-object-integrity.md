# Legacy object integrity

Legacy-backed artifacts retain their existing `source-documents` paths; they are not copied or falsely represented as physically relocated immutable objects. The registered hash and size are immutable audit evidence. Every adopted read boundary must compare current bytes against them and fail closed on mismatch.

The source bucket has no UPDATE policy and application uploads use `upsert:false`. A privileged delete/recreate remains a physical risk outside this registry; stronger object-lock retention was not introduced in 6C.2. A mismatch must create no silent metadata update and no downstream processing.
