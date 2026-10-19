# Phase 3C report

## Result: PASS

The 30 Phase 3B.1 boundaries were frozen before evaluation. The evaluation-set hash is `D94505D73A6F31539AC2350821AB40330EF92A568165B8282B5EBB3BB6F79FA9`. Reference review found **26 MERGE**, **4 KEEP_BOUNDARY**, and **0 UNCERTAIN** cases.

The conservative deterministic baseline resolved **30** and abstained on **0**, with **0 false merges** and **0 false boundary retentions** against the independent reference labels.

The isolated OpenAI classifier used `gpt-5.6` and the strict MERGE / KEEP_BOUNDARY / ABSTAIN schema. It resolved **30** and abstained on **0** before thresholding. The selected threshold is **0.999**, chosen for zero observed false actions rather than coverage.

At that threshold, **15** AI decisions qualify (**13 MERGE**, **2 KEEP_BOUNDARY**) and **15** are withheld. There are **0 false merges** and **0 false boundary retentions** in the qualifying set. Because the deterministic baseline already resolves every case, conservative AI adds no executable action in the combined strategy; on this dataset it is confirmatory, not necessary.

Simulation performed no rewriting: every simulated merge uses the exact fragments plus one deterministic space. Token-sequence integrity is **PASS**. Neither the Phase 3B.1 typed model nor its DOCX was modified.

## Usefulness conclusion

AI boundary classification is useful only for the conservative residual set where generalized deterministic evidence abstains. Its practical value is measured by additional correct actions above the safe threshold; it is not a replacement for deterministic geometry and source-line evidence. The experiment supports abstention as a first-class outcome.

No SDLXLIFF was created and no production path, typed model, DOCX, table/layout logic, or legal text was changed.

## Frozen hashes

- Source PDF: `0E6E7DF9EF641AFEBECF692CE9E1AF7C8CA2F2AD2E4C82950AD6ECF81A3D55EE`
- Phase 3B.1 typed model: `EBE5FC94961E7983BDCAE52A52B97D757FEDE1D942F956B22E2620C0B7A74192`
- Phase 3B.1 experimental DOCX: `9F6EE3354DD1F36395F374BBA51E4213C9352356542067FFBD39050830230D3B`
