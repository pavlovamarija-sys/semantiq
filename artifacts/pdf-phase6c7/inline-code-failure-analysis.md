# Phase 6C.7 inline-code failure analysis

Generation `ad3a8f31-663d-460a-af31-e0fc8c985db3` is immutably failed. It reached all 27 sequential GPT-5.6 responses and then failed during SDLXLIFF target serialization, before MK1 run, batch, translation, or output-artifact persistence.

The failing canonical TU is ordinal 158, `tu-1d6b6715f26ec06e48647069`, mapped to Studio trans-unit `cb3ec640-f572-4ac2-b1b6-6eab5e686503` at Studio index 163 and source location `table:0/row:0/cell:0/p:0`.

Canonical source:

```text
Council Directive 84/450/EEC
(OJ L 250, 19.9.1984, p. 17)
```

Canonical inline code: `code-39df10d27bcdc70870b46b6f`, type `line_break`, offset 28, literal newline. Studio preserves the same source as a literal newline inside `<source>` and `<seg-source>`, not as `<x/>`. The model placeholder passed validation exactly once; the renderer failed because it required an `<x/>` for every canonical code.

The other protected-code TUs, ordinals 159 and 160, have the same proven representation: one canonical line-break code and one literal Studio newline. They are citations in Annex I table cells, not footnotes.

The fix preserves `<x/>` identities when Studio supplies them. Literal protected codes are accepted only if the complete decoded Studio source equals canonical source and the literal occurs at the canonical offset. Mixed or unprovable representations fail closed. The representation preflight now runs before provider creation and translation.

Full preflight result against the untouched SDLXLIFF and persisted snapshot: 265/265 units PASS; 3/3 protected codes are proven literal line breaks.

Provider usage was not persisted because the original code wrote batch evidence only after serialization. Execution order proves 27 calls completed before this renderer error, but exact input/output token totals are unavailable in PostgreSQL. Estimated charge remains approximately $0.24–$0.72, bounded conservatively by approximately $2.56 under the configured output ceilings.
