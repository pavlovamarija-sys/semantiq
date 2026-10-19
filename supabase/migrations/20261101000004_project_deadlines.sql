alter table public.projects add column if not exists deadline_date date;
create index if not exists projects_owner_deadline_idx on public.projects (owner_id, deadline_date) where deadline_date is not null;
