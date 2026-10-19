-- Phase 6C.7: explicit immutable lineage for recovery-only MK1 runs.
alter table public.canonical_mk1_runs
  add column recovered_from_generation_id uuid,
  add column recovered_from_run_id uuid,
  add constraint canonical_mk1_runs_recovery_pair check (
    (recovered_from_generation_id is null and recovered_from_run_id is null)
    or (recovered_from_generation_id is not null and recovered_from_run_id is not null)
  ),
  add constraint canonical_mk1_runs_recovery_generation_fk
    foreign key (recovered_from_generation_id, project_id)
    references public.processing_generations(id, project_id) on delete restrict,
  add constraint canonical_mk1_runs_recovery_run_fk
    foreign key (recovered_from_run_id, project_id)
    references public.canonical_mk1_runs(id, project_id) on delete restrict,
  add constraint canonical_mk1_runs_not_self_recovery check (recovered_from_run_id is null or recovered_from_run_id <> id),
  add constraint canonical_mk1_runs_not_same_generation check (recovered_from_generation_id is null or recovered_from_generation_id <> processing_generation_id);

create index canonical_mk1_runs_recovered_from_idx
  on public.canonical_mk1_runs(recovered_from_run_id) where recovered_from_run_id is not null;
