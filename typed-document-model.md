# Typed intermediate document model

## Design requirements

The intermediate model is the canonical representation between PDF extraction and every downstream consumer. It must preserve exact source text, structural hierarchy, reading order, layout evidence, confidence, and reversible provenance. DOCX paragraphs must not be the canonical structure.

## Core types

```ts
type NodeId = string;

type BoundingBox = {
  page: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

type SourceRef = {
  page: number;
  pdfBlockId: string;
  lineIds: string[];
  spanIds: string[];
  boxes: BoundingBox[];
  readingOrderStart: number;
  readingOrderEnd: number;
};

type StyleEvidence = {
  fontFamilies: string[];
  fontSizes: number[];
  bold: boolean;
  italic: boolean;
  color?: string;
  alignmentEvidence?: "left" | "center" | "right" | "justified";
  indentation?: number;
  lineSpacing?: number;
};

type Classification = {
  method: "deterministic" | "ai-assisted" | "human";
  confidence: number;
  evidence: string[];
  modelVersion?: string;
};

type BaseNode = {
  id: NodeId;
  type: string;
  exactText: string;
  source: SourceRef[];
  style: StyleEvidence;
  classification: Classification;
  children?: DocumentNode[];
};

type DocumentNode =
  | DocumentNodeRoot
  | SectionNode
  | HeadingNode
  | ParagraphNode
  | ListItemNode
  | TableNode
  | TableRowNode
  | TableCellNode
  | FootnoteNode
  | PageBreakNode
  | InlineSpanNode;
```

## Node semantics

### Document

Contains immutable source identity, language, version, page geometry, extraction engine/version, and top-level nodes. It owns a global reading-order index and diagnostics.

### Section

Groups title, preamble, recitals, chapters, articles, annexes, and table-bearing regions. Suggested fields include `sectionKind`, `legalLabel`, `ordinal`, and `parentId`.

### Heading

Represents a structural heading only after layout and context support that role. Suggested kinds: document title, chapter, section, article, annex, part, and table title. A reference containing identical text remains a `Paragraph`, `InlineSpan`, or `TableCell`.

### Paragraph

Represents one logical paragraph and may span multiple PDF blocks, columns, or pages. It contains ordered `InlineSpan` children and explicit continuation evidence.

### ListItem

Separates marker from body and records list kind, level, ordinal, legal point/subpoint role, and continuation nodes.

### Table / TableRow / TableCell

Preserves row/column positions, spans, header status, inferred grid, and cell provenance. Cells contain paragraphs or lists rather than raw strings. A table can be `ruled`, `whitespace-aligned`, or `hybrid`, with confidence and detection evidence.

### Footnote

Stores marker, call site, body nodes, page, note-region evidence, numbering mode, and linkage confidence. Footnotes are not body paragraphs.

### PageBreak

Records a physical source-page boundary. It can occur inside a logical paragraph without splitting that paragraph into two translation units.

### InlineSpan

Preserves exact text, font/style evidence, baseline, coordinates, and source span ID. Hyphenation decisions are recorded rather than silently rewriting text.

## Invariants

1. Concatenating leaf `exactText` values under the model must reproduce the canonical extracted source text under a documented whitespace policy.
2. Every source span maps to exactly one retained leaf node or an explicitly excluded running-margin artifact.
3. Every exclusion retains provenance and reason.
4. Reading order is explicit and stable.
5. A physical page break does not imply a logical paragraph boundary.
6. Table cells, footnotes, and headers cannot be reclassified as headings solely from text.
7. AI classifications may alter labels or boundaries but never source text.
8. Confidence and evidence survive persistence and DOCX rendering.

## Canonical nodes and translation units

Canonical `DocumentNode` records should be persisted independently from rendered DOCX. Translation-unit derivation should be deterministic and versioned:

- headings may be contextual, separately translatable units;
- body paragraphs are default units;
- legal list items may be separate units while retaining their parent paragraph/list path;
- table cells are translated in row/column context;
- footnotes are separate units linked to their call sites;
- page breaks never create units by themselves;
- adjacent fragments sharing one `Paragraph` node remain one unit.

Each TranslationUnit should retain `documentNodeIds`, structural path, table coordinates where applicable, source page range, and derivation version.
