-- Phase 6C.7: append-only per-batch MK1 evidence. Existing generations are untouched.
create table public.canonical_mk1_batch_checkpoints (
  mk1_run_id uuid not null,
  project_id uuid not null,
  canonical_snapshot_id uuid not null,
  batch_ordinal integer not null check (batch_ordinal >= 0),
  first_tu_ordinal integer not null,
  last_tu_ordinal integer not null,
  canonical_tu_ids jsonb not null,
  source_hashes jsonb not null,
  translations jsonb not null,
  model text not null,
  prompt_version text not null,
  provider_response_id text not null,
  input_tokens integer,
  output_tokens integer,
  status text not null check (status = 'PASS'),
  created_at timestamptz not null default now(),
  primary key (mk1_run_id, batch_ordinal),
  foreign key (mk1_run_id, project_id) references public.canonical_mk1_runs(id, project_id) on delete restrict,
  foreign key (canonical_snapshot_id, project_id) references public.canonical_snapshots(id, project_id) on delete restrict
);
create function public.mk1_checkpoint_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'MK1 checkpoints are immutable' using errcode='55000';end;$$;
create trigger canonical_mk1_batch_checkpoints_immutable before update or delete on public.canonical_mk1_batch_checkpoints for each row execute function public.mk1_checkpoint_immutable();
alter table public.canonical_mk1_batch_checkpoints enable row level security;
create policy canonical_mk1_batch_checkpoints_owned on public.canonical_mk1_batch_checkpoints for all to authenticated using (exists(select 1 from public.canonical_mk1_runs r join public.projects p on p.id=r.project_id where r.id=mk1_run_id and p.owner_id=(select auth.uid()))) with check (exists(select 1 from public.canonical_mk1_runs r join public.projects p on p.id=r.project_id where r.id=mk1_run_id and p.owner_id=(select auth.uid())));
