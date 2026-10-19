import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

const require=createRequire(import.meta.url);
const {Client}=require(path.join(process.env.PG_CLIENT_DIR,"node_modules","pg"));
const pooler=new URL((await readFile("supabase/.temp/pooler-url","utf8")).trim());
const db=new Client({host:pooler.hostname,port:Number(pooler.port),database:pooler.pathname.slice(1),
  user:decodeURIComponent(pooler.username),password:process.env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
await db.connect();
try {
  const source=(await db.query(`select a.id artifact_id,a.sha256,a.byte_size,a.project_id,a.document_id,a.document_version_id,
    a.storage_bucket,a.storage_path from public.document_artifacts a join public.documents d on d.id=a.document_id
    where d.celex_number='32006L0114' and a.artifact_type='SOURCE_PDF' and a.status='available'`)).rows;
  const rpc=(await db.query(`select p.proname,pg_get_function_identity_arguments(p.oid) arguments
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='complete_reconstruction_generation'`)).rows;
  const recon=(await db.query(`select g.id,g.status,g.idempotency_key,a.id model_artifact_id,a.status model_status
    from public.processing_generations g left join public.document_artifacts a on a.processing_generation_id=g.id
    where g.generation_kind='pdf_reconstruction' order by g.created_at`)).rows;
  const validatedDocx=Number((await db.query(`select count(*) from public.document_artifacts where artifact_type='VALIDATED_DOCX'`)).rows[0].count);
  process.stdout.write(JSON.stringify({source,rpc,reconstructionGenerations:recon,validatedDocxArtifacts:validatedDocx},null,2));
} finally { await db.end(); }
