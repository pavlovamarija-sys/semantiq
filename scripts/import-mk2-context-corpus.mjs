import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const { Client } = require(path.join(process.env.PG_CLIENT_DIR, "node_modules", "pg"));

const input = path.resolve("scripts/output/mk2-context-corpus/mk2-context-chunks.jsonl");
const kbId = process.env.TM_KNOWLEDGE_BASE_ID ?? "1f4282d9-0468-487e-bf56-685ab1f507b3";
const rows = (await readFile(input, "utf8")).trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const corpusSummary = JSON.parse(await readFile("scripts/output/mk2-context-corpus/summary.json", "utf8"));
if (rows.length !== 17544) throw new Error(`Expected 17,544 chunks, found ${rows.length}`);
if (new Set(rows.map((row) => row.celex)).size !== 102) throw new Error("Expected 102 CELEX documents");
if (rows.some((row) => !row.text?.trim())) throw new Error("Empty chunk text found");
if (new Set(rows.map((row) => row.chunk_id)).size !== rows.length) throw new Error("Duplicate stable chunk identity in source");
const characters = corpusSummary.summary.total_extracted_mk2_characters;
if (characters !== 4959130) throw new Error(`Expected 4,959,130 extracted characters, found ${characters}`);
if (corpusSummary.documents.length !== 102) throw new Error(`Expected 102 document summaries, found ${corpusSummary.documents.length}`);
const documentSummary = new Map(corpusSummary.documents.map((row) => [row.celex, row]));

const pooler = new URL((await readFile("supabase/.temp/pooler-url", "utf8")).trim());
const db = new Client({ host: pooler.hostname, port: Number(pooler.port), database: pooler.pathname.slice(1), user: decodeURIComponent(pooler.username), password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin");
  const docs = new Map();
  for (const row of rows) {
    const key = `${row.celex}\0${row.source_file}`;
    if (docs.has(key)) continue;
    const docRows = rows.filter((candidate) => candidate.celex === row.celex && candidate.source_file === row.source_file);
    const summary = documentSummary.get(row.celex);
    if (!summary) throw new Error(`Missing summary for ${row.celex}`);
    const result = await db.query(`insert into public.knowledge_base_reference_documents (knowledge_base_id,celex,source_file,source_format,language,extracted_characters,extraction_method) values ($1,$2,$3,$4,'mk',$5,$6) on conflict (knowledge_base_id,celex,source_file) do update set source_format=excluded.source_format, language=excluded.language, extracted_characters=excluded.extracted_characters, extraction_method=excluded.extraction_method returning id`, [kbId, row.celex, row.source_file, row.source_format, summary.extracted_characters, row.extraction_method]);
    docs.set(key, result.rows[0].id);
  }
  let inserted = 0;
  for (let start = 0; start < rows.length; start += 400) {
    const batch = rows.slice(start, start + 400);
    const values = [];
    const placeholders = batch.map((row, index) => {
      const offset = index * 14;
      values.push(docs.get(`${row.celex}\0${row.source_file}`), kbId, row.chunk_id, row.celex, row.text, row.normalized_text, row.characters, row.global_chunk_order, row.paragraph_order, row.source_paragraph_index, JSON.stringify(row.context ?? {}), row.source_format, row.extraction_method, JSON.stringify(row.duplicate_sources ?? []));
      return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},'mk',$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11}::jsonb,$${offset + 12},$${offset + 13},$${offset + 14}::jsonb)`;
    }).join(',');
    const result = await db.query(`insert into public.knowledge_base_reference_chunks (reference_document_id,knowledge_base_id,stable_source_chunk_id,celex,language,chunk_text,normalized_text,characters,global_chunk_order,paragraph_order,source_paragraph_index,structural_context,source_format,extraction_method,duplicate_sources) values ${placeholders} on conflict (knowledge_base_id,stable_source_chunk_id) do nothing`, values);
    inserted += result.rowCount;
  }
  await db.query("commit");
  const verification = await db.query(`select (select count(distinct celex)::int from public.knowledge_base_reference_documents where knowledge_base_id=$1) as documents,(select count(*)::int from public.knowledge_base_reference_chunks where knowledge_base_id=$1) as chunks,(select count(*) filter (where length(btrim(chunk_text))=0)::int from public.knowledge_base_reference_chunks where knowledge_base_id=$1) as empty_chunks,(select count(*)-count(distinct (knowledge_base_id,stable_source_chunk_id))::int from public.knowledge_base_reference_chunks where knowledge_base_id=$1) as duplicate_identities,(select coalesce(sum(extracted_characters),0)::int from public.knowledge_base_reference_documents where knowledge_base_id=$1) as characters,(select coalesce(sum(characters),0)::int from public.knowledge_base_reference_chunks where knowledge_base_id=$1) as retained_chunk_text_characters`, [kbId]);
  console.log(JSON.stringify({ knowledge_base_id: kbId, source_documents: 102, source_chunks: rows.length, source_characters: characters, inserted, verification: verification.rows[0] }, null, 2));
} catch (error) { await db.query("rollback"); throw error; } finally { await db.end(); }
