revoke all on function public.persist_generated_mk1(uuid,text,text,text,text,jsonb,numeric,jsonb,jsonb) from public;
revoke all on function public.persist_generated_mk1(uuid,text,text,text,text,jsonb,numeric,jsonb,jsonb) from anon;
grant execute on function public.persist_generated_mk1(uuid,text,text,text,text,jsonb,numeric,jsonb,jsonb) to authenticated;
