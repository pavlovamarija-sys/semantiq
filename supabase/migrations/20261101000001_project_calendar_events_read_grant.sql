-- PostgREST may begin a server-rendered read under the anon database role while
-- the SSR client restores its session. RLS remains authoritative: there is no
-- anon policy, so granting SELECT cannot expose rows to unauthenticated users.
grant select on public.project_calendar_events to anon;
