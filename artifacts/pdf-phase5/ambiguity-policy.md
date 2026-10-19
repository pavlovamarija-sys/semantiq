# Ambiguity policy

MERGE is executable only for generalized evidence such as same-block baseline lexical continuation or tightly spaced continuation lines with compatible style/provenance. It combines existing fragments without rewriting text and preserves all provenance.

KEEP_BOUNDARY is executable where evidence proves structural separation, such as intervening source lines or a distinct running header/footer region. It preserves separate logical nodes.

ABSTAIN is mandatory when evidence does not safely distinguish the alternatives, including ambiguous page/header/footnote relationships or uncertain paragraph boundaries. It retains the boundary, records evidence and exposes the count/locations for review.

AI is not in the executable path. Safe ABSTAIN may permit continuation after source, typed, structural and text-integrity gates pass; unsafe ambiguity, unresolved table identity or any integrity defect blocks. Conservative fragmentation must be visible in diagnostics and never silently converted into translation units.
