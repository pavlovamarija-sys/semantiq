# Typed model contracts

Every entity has a stable generated ID and `algorithm_version`. Provenance is mandatory for textual nodes and contains `page`, `block_id`, `line_ids`, `span_ids`, bounding boxes, reading-order position, original text and style/font evidence.

Core types: `SourceDocument → Page → Region → SourceBlock → SourceLine → SourceSpan`; reconstructed `Document → Section | Heading | Paragraph | List | ListItem | Table | PhysicalTableSegment | LogicalTable | TableRow | TableCell | Footnote | PageBreak`; inline `InlineSpan | InlineBreak`.

Nodes have `id`, `type`, `parent_id`, ordered children, original source text, normalized comparison text, provenance references and classification/style evidence. A logical table owns ordered physical segments; rows/cells retain segment/page provenance. A decision has `id`, `decision_type`, `outcome` (`MERGE|KEEP_BOUNDARY|ABSTAIN`), reason, evidence, confidence when applicable, source provenance and ambiguity status.

Canonical nodes must reference typed-node IDs and source spans. A TranslationUnit is a later legal/document projection, not a PDF span or arbitrary DOCX paragraph. IDs must remain stable within an artifact generation and be linked by an artifact manifest across generations.
