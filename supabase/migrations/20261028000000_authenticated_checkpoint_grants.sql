-- Authenticated clients need table privileges for RLS policy evaluation.
-- RLS remains the authorization boundary; these grants do not expose other projects.
grant select on public.projects to authenticated;
grant select on public.canonical_mk1_runs to authenticated;
grant select, insert on public.canonical_mk1_batch_checkpoints to authenticated;

drop policy canonical_mk1_batch_checkpoints_owned on public.canonical_mk1_batch_checkpoints;
create policy canonical_mk1_batch_checkpoints_owned on public.canonical_mk1_batch_checkpoints for all to authenticated
  using (exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())))
  with check (exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
