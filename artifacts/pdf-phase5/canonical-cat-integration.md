# Canonical and CAT integration

The typed model is the authoritative structural source for canonical projection. It produces `DocumentNode` records and TranslationUnits according to legal/document boundaries, not one unit per native PDF span and not one unit per arbitrary DOCX paragraph. Table cells retain table/row/column and typed-node provenance.

Studio CAT segments are a later filter projection and may sentence-segment a TranslationUnit. InlineCode and controlled breaks remain mapped to source provenance. The immutable Studio skeleton must retain source artifact, typed-node and canonical-unit identities.

MK1 is an AI translation version over canonical units and remains separate from the untouched Studio skeleton. Human edits produce MK2; explicit approval is required before trusted TM/terminology reuse. Translation units, GPT batches, CAT segments and translation versions are distinct identities.
