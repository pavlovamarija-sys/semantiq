create table public.document_translation_artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.document_translation_runs(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  artifact_type text not null check (artifact_type = 'mk1_docx'),
  status text not null default 'completed' check (status in ('completed', 'failed')),
  storage_bucket text not null,
  storage_path text not null,
  filename text not null,
  segment_count integer not null check (segment_count >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (run_id, artifact_type)
);

alter table public.document_translation_artifacts enable row level security;

create policy document_translation_artifacts_owned on public.document_translation_artifacts
  for all to authenticated
  using (exists (
    select 1 from public.document_translation_runs r
    join public.document_versions dv on dv.id = r.document_version_id
    join public.documents d on d.id = dv.document_id
    join public.projects p on p.id = d.project_id
    where r.id = document_translation_artifacts.run_id and p.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.document_translation_runs r
    join public.document_versions dv on dv.id = r.document_version_id
    join public.documents d on d.id = dv.document_id
    join public.projects p on p.id = d.project_id
    where r.id = document_translation_artifacts.run_id and p.owner_id = auth.uid()
  ));

comment on table public.document_translation_artifacts is
  'Derived AI working artifacts; never trusted translation memory.';
