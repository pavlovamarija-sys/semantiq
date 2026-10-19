import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("project deadlines persist through creation, editing, and calendar derivation", async () => {
  const migration = await readFile(new URL("../../../supabase/migrations/20261101000004_project_deadlines.sql", import.meta.url), "utf8");
  const actions = await readFile(new URL("../auth/actions.ts", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
  const editor = await readFile(new URL("./projects/[projectId]/project-deadline-actions.ts", import.meta.url), "utf8");
  assert.match(migration, /add column if not exists projects?\.deadline_date|add column if not exists deadline_date/i);
  assert.match(actions, /deadline_date/);
  assert.match(editor, /deadline_date/);
  assert.match(dashboard, /deadlines=\{/);
  assert.match(dashboard, /deadlineOverdue/);
  assert.doesNotMatch(dashboard, /insert\(.*calendar/i);
});
