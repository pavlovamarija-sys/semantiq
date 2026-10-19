create table public.project_calendar_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  event_date date not null,
  event_time time without time zone not null,
  description text check (description is null or char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_calendar_events_owner_date_idx
  on public.project_calendar_events (owner_id, event_date, event_time);
create index project_calendar_events_project_idx
  on public.project_calendar_events (project_id)
  where project_id is not null;

create trigger set_project_calendar_events_updated_at
  before update on public.project_calendar_events
  for each row execute function public.set_updated_at();

alter table public.project_calendar_events enable row level security;

create policy project_calendar_events_select_owned
  on public.project_calendar_events for select to authenticated
  using (owner_id = (select auth.uid()));

create policy project_calendar_events_insert_owned
  on public.project_calendar_events for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (
      project_id is null
      or exists (
        select 1 from public.projects
        where projects.id = project_calendar_events.project_id
          and projects.owner_id = (select auth.uid())
      )
    )
  );

create policy project_calendar_events_update_owned
  on public.project_calendar_events for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (
      project_id is null
      or exists (
        select 1 from public.projects
        where projects.id = project_calendar_events.project_id
          and projects.owner_id = (select auth.uid())
      )
    )
  );

create policy project_calendar_events_delete_owned
  on public.project_calendar_events for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.project_calendar_events from anon;
grant select, insert, update, delete on public.project_calendar_events to authenticated;
