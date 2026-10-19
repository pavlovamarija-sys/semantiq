import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const { Client } = createRequire(import.meta.url)(`${process.env.PG_CLIENT_DIR}/node_modules/pg`);
const pooler = new URL((await readFile("supabase/.temp/pooler-url", "utf8")).trim());
const db = new Client({
  host: pooler.hostname,
  port: Number(pooler.port),
  database: pooler.pathname.slice(1),
  user: decodeURIComponent(pooler.username),
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

await db.connect();
const requestKey = "phase6c5-persistence-integrity-32006l0114-v1";
const expectedIdempotencyKey = "canonical-extraction:4553a2f4772592262de110283266b222dd40c95360085f17ae0c1b94b0357716";
const generationRows = (await db.query(
  `select * from public.processing_generations
   where idempotency_key=$1 order by created_at`,
  [expectedIdempotencyKey],
)).rows;
const generationIds = generationRows.map((row) => row.id);
const snapshots = generationIds.length === 0 ? [] : (await db.query(
  `select * from public.canonical_snapshots
   where processing_generation_id=any($1::uuid[]) order by created_at`,
  [generationIds],
)).rows;

const snapshot = snapshots[0];
let verification = null;
if (snapshot) {
  const rows = (await db.query(
    `select ordinal, source_text, source_hash,
            encode(extensions.digest(convert_to(source_text,'UTF8'),'sha256'),'hex') as server_hash,
            encode(convert_to(source_text,'UTF8'),'hex') as server_utf8_hex
     from public.canonical_translation_units
     where canonical_snapshot_id=$1 order by ordinal`,
    [snapshot.id],
  )).rows;
  const metrics = (await db.query(
    `select
       (select count(*)::int from public.canonical_nodes where canonical_snapshot_id=$1) nodes,
       (select count(*)::int from public.canonical_translation_units where canonical_snapshot_id=$1) tus,
       (select count(*)::int from public.canonical_inline_codes where canonical_snapshot_id=$1) codes,
       (select min(ordinal)::int from public.canonical_translation_units where canonical_snapshot_id=$1) min_ordinal,
       (select max(ordinal)::int from public.canonical_translation_units where canonical_snapshot_id=$1) max_ordinal,
       (select count(distinct ordinal)::int from public.canonical_translation_units where canonical_snapshot_id=$1) distinct_ordinals,
       (select count(*)::int from public.canonical_translation_units where canonical_snapshot_id=$1 and position(chr(65533) in source_text)>0) replacement_units,
       (select count(*)::int from public.canonical_translation_units where canonical_snapshot_id=$1 and (source_text like '%â€™%' or source_text like '%Ã¢%')) mojibake_units`,
    [snapshot.id],
  )).rows[0];
  const mismatches = rows.filter((row) =>
    row.source_hash !== row.server_hash ||
    row.source_hash !== createHash("sha256").update(row.source_text, "utf8").digest("hex")
  );
  verification = {
    metrics,
    persistedSourceHashMismatches: mismatches.map(({ ordinal, source_hash, server_hash }) => ({ ordinal, source_hash, server_hash })),
    nonAsciiCodepoints: [...new Set(rows.flatMap((row) => [...row.source_text]
      .map((character) => character.codePointAt(0))
      .filter((codepoint) => codepoint > 127)
      .map((codepoint) => `U+${codepoint.toString(16).toUpperCase().padStart(4, "0")}`)))].sort(),
  };
}

const historical = (await db.query(
  `select id, processing_generation_id, status, extractor_version,
          validated_docx_sha256, node_count, translation_unit_count,
          inline_code_count, normalized_source_sha256
   from public.canonical_snapshots
   where id=any($1::uuid[]) order by id`,
  [["41c043ad-a210-4e17-b6f4-5cf98872a602", "9773853e-9f81-4796-b358-38a3f53e1d81", "dd258d76-5d3c-4f33-b5b6-6cd33481c73f"]],
)).rows;
const finalizationFunction = (await db.query(
  `select pg_get_functiondef(p.oid) as definition
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='complete_canonical_snapshot'
   order by p.oid desc limit 1`,
)).rows[0]?.definition ?? "";
const generationInputs = generationIds.length === 0 ? [] : (await db.query(
  `select generation_id, project_id, artifact_id, input_role, input_ordinal, expected_sha256
   from public.processing_generation_inputs where generation_id=any($1::uuid[]) order by input_ordinal`,
  [generationIds],
)).rows;

console.log(JSON.stringify({
  requestKey,
  expectedIdempotencyKey,
  generationCount: generationRows.length,
  snapshotCount: snapshots.length,
  generations: generationRows,
  snapshots,
  verification,
  finalizationIntegrityGate: {
    deployed: finalizationFunction.includes("persisted canonical source hash mismatch") && finalizationFunction.includes("convert_to(source_text") && finalizationFunction.includes("UTF8"),
    persistedHashCheckPresent: finalizationFunction.includes("persisted canonical source hash mismatch"),
    completionOnlyViaRpc: snapshots.every((row) => row.status === "available") && generationRows.every((row) => row.status === "completed" && row.validation_status === "PASS"),
  },
  generationInputs,
  historical,
}, null, 2));
await db.end();
