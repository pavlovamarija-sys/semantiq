create table public.translators (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 200),
  email text not null check (char_length(email) <= 320),
  source_language text not null check (char_length(btrim(source_language)) between 1 and 80),
  target_language text not null check (char_length(btrim(target_language)) between 1 and 80),
  specialization text not null check (char_length(btrim(specialization)) between 1 and 200),
  availability text not null default 'Available' check (availability in ('Available','Busy','Unavailable')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index translators_owner_email_idx on public.translators (owner_id, lower(email));
create index translators_owner_name_idx on public.translators (owner_id, lower(full_name));
create trigger set_translators_updated_at before update on public.translators for each row execute function public.set_updated_at();
alter table public.translators enable row level security;
create policy translators_select_owned on public.translators for select to authenticated using (owner_id = (select auth.uid()));
create policy translators_insert_owned on public.translators for insert to authenticated with check (owner_id = (select auth.uid()));
create policy translators_update_owned on public.translators for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy translators_delete_owned on public.translators for delete to authenticated using (owner_id = (select auth.uid()));
revoke all on public.translators from anon;
grant select, insert, update, delete on public.translators to authenticated;
