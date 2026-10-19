revoke all on public.email_provider_connections from authenticated;
grant select (owner_id, provider, provider_account_id, sender_email, token_expires_at, created_at, updated_at) on public.email_provider_connections to authenticated;

create or replace function public.save_email_provider_connection(p_provider text,p_account_id text,p_sender_email text,p_access_token text,p_refresh_token text,p_expires_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.email_provider_connections(owner_id,provider,provider_account_id,sender_email,encrypted_access_token,encrypted_refresh_token,token_expires_at,updated_at)
  values(auth.uid(),p_provider,p_account_id,p_sender_email,p_access_token,p_refresh_token,p_expires_at,now())
  on conflict(owner_id) do update set provider=excluded.provider,provider_account_id=excluded.provider_account_id,sender_email=excluded.sender_email,encrypted_access_token=excluded.encrypted_access_token,encrypted_refresh_token=excluded.encrypted_refresh_token,token_expires_at=excluded.token_expires_at,updated_at=now();
end $$;
create or replace function public.get_email_provider_secret()
returns table(provider text,sender_email text,encrypted_access_token text,encrypted_refresh_token text,token_expires_at timestamptz)
language sql security definer set search_path='' as $$ select c.provider,c.sender_email,c.encrypted_access_token,c.encrypted_refresh_token,c.token_expires_at from public.email_provider_connections c where c.owner_id=auth.uid() $$;
create or replace function public.disconnect_email_provider() returns void language sql security definer set search_path='' as $$ delete from public.email_provider_connections where owner_id=auth.uid() $$;
revoke all on function public.save_email_provider_connection(text,text,text,text,text,timestamptz) from public;
revoke all on function public.get_email_provider_secret() from public;
revoke all on function public.disconnect_email_provider() from public;
grant execute on function public.save_email_provider_connection(text,text,text,text,text,timestamptz) to authenticated;
grant execute on function public.get_email_provider_secret() to authenticated;
grant execute on function public.disconnect_email_provider() to authenticated;
