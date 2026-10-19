import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { Client } = require(path.join(process.env.PG_CLIENT_DIR, "node_modules", "pg"));
const linkedProjectRef = (await readFile("supabase/.temp/project-ref", "utf8")).trim();
const poolerUrl = new URL((await readFile("supabase/.temp/pooler-url", "utf8")).trim());
const appUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const appProjectRef = appUrl.hostname.split(".")[0];
const client = new Client({
  host: poolerUrl.hostname,
  port: Number(poolerUrl.port || "5432"),
  database: poolerUrl.pathname.slice(1),
  user: decodeURIComponent(poolerUrl.username),
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const catalog = await client.query(`
    select n.nspname as schema_name, p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_arguments,
      pg_get_function_result(p.oid) as result_type,
      p.prosecdef as security_definer
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_owned_working_document'
  `);
  const response = await fetch(`${appUrl.origin}/rest/v1/rpc/delete_owned_working_document`, {
    method: "POST",
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requested_project_id: "00000000-0000-0000-0000-000000000000",
      requested_document_id: "00000000-0000-0000-0000-000000000000",
    }),
  });
  process.stdout.write(JSON.stringify({
    sameProject: linkedProjectRef === appProjectRef,
    catalog: catalog.rows,
    rest: { status: response.status, body: await response.text() },
  }));
} finally {
  await client.end();
}
