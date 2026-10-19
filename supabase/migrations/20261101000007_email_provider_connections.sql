create table if not exists public.email_provider_connections (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  provider_account_id text not null,
  sender_email text not null,
  encrypted_access_token text not null,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.email_provider_connections enable row level security;
create policy "email connections owner select" on public.email_provider_connections for select using (owner_id = auth.uid());
create policy "email connections owner insert" on public.email_provider_connections for insert with check (owner_id = auth.uid());
create policy "email connections owner update" on public.email_provider_connections for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "email connections owner delete" on public.email_provider_connections for delete using (owner_id = auth.uid());
grant select, insert, update, delete on public.email_provider_connections to authenticated;

create table if not exists public.sent_email_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  recipient text not null,
  subject text not null,
  provider text not null check (provider in ('gmail','outlook')),
  status text not null check (status in ('pending','sent','failed')),
  provider_message_id text,
  error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(owner_id, idempotency_key)
);
create index if not exists sent_email_log_owner_created_idx on public.sent_email_log(owner_id, created_at desc);
alter table public.sent_email_log enable row level security;
create policy "sent email owner select" on public.sent_email_log for select using (owner_id = auth.uid());
create policy "sent email owner insert" on public.sent_email_log for insert with check (owner_id = auth.uid());
create policy "sent email owner update" on public.sent_email_log for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update on public.sent_email_log to authenticated;
