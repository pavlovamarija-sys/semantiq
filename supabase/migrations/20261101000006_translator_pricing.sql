alter table public.translators add column if not exists gross_price_per_page_mkd numeric(12,2);
do $$ begin
  alter table public.translators add constraint translators_gross_price_nonnegative check (gross_price_per_page_mkd is null or gross_price_per_page_mkd >= 0);
exception when duplicate_object then null; end $$;

create table if not exists public.translator_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  personal_tax_percent numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint translator_settings_tax_range check (personal_tax_percent is null or (personal_tax_percent >= 0 and personal_tax_percent <= 100))
);
alter table public.translator_settings enable row level security;
drop policy if exists "translator_settings_owner_select" on public.translator_settings;
drop policy if exists "translator_settings_owner_insert" on public.translator_settings;
drop policy if exists "translator_settings_owner_update" on public.translator_settings;
drop policy if exists "translator_settings_owner_delete" on public.translator_settings;
create policy "translator_settings_owner_select" on public.translator_settings for select using (owner_id = auth.uid());
create policy "translator_settings_owner_insert" on public.translator_settings for insert with check (owner_id = auth.uid());
create policy "translator_settings_owner_update" on public.translator_settings for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "translator_settings_owner_delete" on public.translator_settings for delete using (owner_id = auth.uid());
grant select, insert, update, delete on public.translator_settings to authenticated;
