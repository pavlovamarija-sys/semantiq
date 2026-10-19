create table public.document_translation_runs (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','segmenting','translating','document_qa','completed','failed')),
  total_segments integer not null default 0 check (total_segments >= 0),
  translated_segments integer not null default 0 check (translated_segments >= 0 and translated_segments <= total_segments),
  current_segment_index integer,
  document_qa jsonb not null default '{}'::jsonb check (jsonb_typeof(document_qa) = 'object'),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index document_translation_runs_one_active_version_idx
  on public.document_translation_runs(document_version_id)
  where status in ('pending','segmenting','translating','document_qa');
create index document_translation_runs_version_created_idx
  on public.document_translation_runs(document_version_id, created_at desc);

create table public.document_translation_run_segments (
  run_id uuid not null references public.document_translation_runs(id) on delete cascade,
  segment_id uuid not null references public.document_segments(id) on delete restrict,
  translation_version_id uuid not null references public.translation_versions(id) on delete restrict,
  segment_index integer not null check (segment_index >= 0),
  qa_status text not null check (qa_status in ('PASS','WARNING','ERROR')),
  created_at timestamptz not null default now(),
  primary key (run_id, segment_id),
  unique (run_id, translation_version_id)
);

create trigger document_translation_runs_updated_at before update on public.document_translation_runs
  for each row execute function public.set_updated_at();

alter table public.document_translation_runs enable row level security;
alter table public.document_translation_run_segments enable row level security;

create policy document_translation_runs_owned on public.document_translation_runs for all to authenticated
  using (exists (
    select 1 from public.document_versions dv join public.documents d on d.id = dv.document_id
    join public.projects p on p.id = d.project_id
    where dv.id = document_version_id and p.owner_id = (select auth.uid())
  ))
  with check (created_by = (select auth.uid()) and exists (
    select 1 from public.document_versions dv join public.documents d on d.id = dv.document_id
    join public.projects p on p.id = d.project_id
    where dv.id = document_version_id and p.owner_id = (select auth.uid())
  ));

create policy document_translation_run_segments_owned on public.document_translation_run_segments for all to authenticated
  using (exists (
    select 1 from public.document_translation_runs r join public.document_versions dv on dv.id = r.document_version_id
    join public.documents d on d.id = dv.document_id join public.projects p on p.id = d.project_id
    where r.id = run_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.document_translation_runs r join public.document_versions dv on dv.id = r.document_version_id
    join public.documents d on d.id = dv.document_id join public.projects p on p.id = d.project_id
    where r.id = run_id and p.owner_id = (select auth.uid())
  ));

comment on table public.document_translation_runs is
  'Owner-scoped progress and final deterministic QA for automatic whole-document MK1 generation.';
comment on table public.document_translation_run_segments is
  'Ordered translation-version results belonging to one automatic document translation run.';
