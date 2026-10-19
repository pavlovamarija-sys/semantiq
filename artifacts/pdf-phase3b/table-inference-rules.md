# Phase 3B document-independent table inference rules

These rules were defined from the frozen Phase 3A defect classes before implementation. They contain no CELEX, page-number, Article-number, Annex-name or document-title controls.

## Table versus aligned body columns

A repeated alignment is not sufficient. A table candidate must combine stable column boundaries with row evidence and must not merely reproduce the page's independent body-column flow. Evidence includes row occupancy, repeated baselines, compact row spacing, compatible cell typography and optional header evidence. Negative evidence includes list/bullet dominance, continuation indentation, broad independent text flow before and after the candidate in both page columns, and anchors matching the inferred body-column starts.

Short two-column candidates embedded in sustained two-column prose/list flow are retained as ordinary structures unless stronger table evidence exists. Confidence and negative evidence are recorded.

## Flexible boundaries

After a stable grid is found, adjacent rows may join even when extraction splits a wrapped cell into several fragments or leaves cells empty. Assignment uses inferred column boundaries and row baselines rather than raw fragment count. A region ends only after a material vertical gap, an incompatible grid/style transition, or a structural heading.

## Same-page joining

Adjacent candidate regions join when column boundaries, typography and row rhythm are compatible and every intervening fragment can be assigned to the shared grid. Sparse intervening rows are bridge evidence. A structural heading or incompatible column grid prevents joining.

## Cross-page continuity

End-of-page and start-of-next-page table segments join logically when column boundaries and typography are compatible, no new structural heading intervenes, and the transition has either repeated-header evidence or compatible continuing rows. Physical segments and repeated headers remain explicit. Every row and cell retains page/block/line/span/bounding-box provenance.

Repeated source headers remain represented exactly once per physical occurrence and are marked `repeatedHeader`; they are not synthesized or silently removed.

## Confidence and ambiguity

Positive and negative evidence are retained on each inferred table. If evidence is insufficient, content remains ordinary and an ambiguity record contains candidate interpretations, evidence and confidence. No text label controls table detection.
