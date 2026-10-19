-- Permit PostgREST to reach RLS during SSR session restoration. No anon policy
-- exists, so unauthenticated callers still receive zero translator rows.
grant select on public.translators to anon;
