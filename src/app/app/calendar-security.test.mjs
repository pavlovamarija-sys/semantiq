import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../../supabase/migrations/20261101000000_project_calendar_events.sql", import.meta.url);
const actionsUrl = new URL("./calendar-actions.ts", import.meta.url);

test("calendar persistence enables RLS and isolates every operation by authenticated owner", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /for select to authenticated[\s\S]*owner_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /for insert to authenticated[\s\S]*owner_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /for update to authenticated[\s\S]*owner_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /for delete to authenticated[\s\S]*owner_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /projects\.owner_id = \(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(sql, /create policy[\s\S]*to anon/i);
});

test("anonymous SSR reads can reach RLS without receiving write privileges", async () => {
  const grant = await readFile(new URL("../../../supabase/migrations/20261101000001_project_calendar_events_read_grant.sql", import.meta.url), "utf8");
  assert.match(grant, /grant select .* to anon/i);
  assert.doesNotMatch(grant, /grant (insert|update|delete|all)/i);
});

test("calendar CRUD uses authenticated server actions and refreshes persisted data", async () => {
  const source = await readFile(actionsUrl, "utf8");
  assert.match(source, /getAuthenticatedUser\(\)/);
  assert.match(source, /\.insert\(payload\)/);
  assert.match(source, /\.update\(payload\).*\.eq\("owner_id", user\.id\)/s);
  assert.match(source, /\.delete\(\).*\.eq\("owner_id", user\.id\)/s);
  assert.equal((source.match(/revalidatePath\("\/app"\)/g) ?? []).length, 2);
});
