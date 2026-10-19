import { createHash, randomUUID } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const MODE = process.argv[2] ?? "preflight";
const EXPLICIT_VERSION_ID = process.argv[3] ?? null;
const DOWNLOAD_DIRECTORY = process.env.PHASE6C2_AUTHENTICATED_DOWNLOAD_DIR
  ?? path.resolve("artifacts/pdf-phase6c2/manual-backfill");
const LEGACY_EVIDENCE_DIRECTORY = path.resolve("artifacts/pdf-phase6b/manual-verification");
const require = createRequire(import.meta.url);
const { Client } = require(path.join(process.env.PG_CLIENT_DIR, "node_modules", "pg"));
const pooler = new URL((await readFile("supabase/.temp/pooler-url", "utf8")).trim());
const projectRef = (await readFile("supabase/.temp/project-ref", "utf8")).trim();
const db = new Client({
  host: pooler.hostname,
  port: Number(pooler.port),
  database: pooler.pathname.slice(1),
  user: decodeURIComponent(pooler.username),
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

function integrity(bytes) {
  return { sha256: createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.byteLength };
}

function isPdf(bytes) {
  return bytes.byteLength > 5 && new TextDecoder("ascii").decode(bytes.subarray(0, 5)) === "%PDF-";
}

async function localAuthenticatedBytes(versionId) {
  const candidates = [
    path.join(DOWNLOAD_DIRECTORY, versionId, "source.pdf"),
    path.join(DOWNLOAD_DIRECTORY, versionId, `${versionId}.pdf`),
    path.join(DOWNLOAD_DIRECTORY, `${versionId}.pdf`),
    path.join(LEGACY_EVIDENCE_DIRECTORY, `${versionId}.pdf`),
  ];
  for (const file of candidates) {
    try { await access(file); } catch { continue; }
    return { file, bytes: new Uint8Array(await readFile(file)) };
  }
  return null;
}

async function preflight() {
  const one = async (sql, params = []) => (await db.query(sql, params)).rows;
  return {
    mode: "preflight",
    projectRef,
    database: (await one("select current_database() database, current_user"))[0],
    requiredTables: (await one(`select table_name from information_schema.tables where table_schema='public'
      and table_name in ('projects','documents','document_versions') order by table_name`)).map((row) => row.table_name),
    conflictingFoundationTables: (await one(`select table_name from information_schema.tables where table_schema='public'
      and table_name in ('processing_generations','document_artifacts','processing_generation_inputs','artifact_relationships') order by table_name`)).map((row) => row.table_name),
    requiredColumns: await one(`select table_name,column_name from information_schema.columns where table_schema='public' and (
      (table_name='projects' and column_name in ('id','owner_id')) or
      (table_name='documents' and column_name in ('id','project_id','celex_number','source_language','source_reference','source_retrieved_at','provenance_metadata','parent_document_id')) or
      (table_name='document_versions' and column_name in ('id','document_id','source_storage_bucket','source_storage_path','source_filename','source_mime_type','source_file_size_bytes')))
      order by table_name,column_name`),
    sourceBucket: (await one("select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='source-documents'"))[0] ?? null,
    sourcePdfVersions: Number((await one(`select count(*) from public.document_versions
      where source_storage_bucket='source-documents' and source_storage_path is not null
      and lower(coalesce(source_mime_type,''))='application/pdf'`))[0].count),
  };
}

async function runtimeSchema() {
  const tables = ["processing_generations", "document_artifacts", "processing_generation_inputs", "artifact_relationships"];
  return {
    mode: "runtime-schema",
    projectRef,
    tables: (await db.query(`select c.relname table_name,c.relrowsecurity rls_enabled
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=any($1::text[]) order by c.relname`, [tables])).rows,
    columns: (await db.query(`select table_name,column_name,data_type,is_nullable,column_default
      from information_schema.columns where table_schema='public' and table_name=any($1::text[])
      order by table_name,ordinal_position`, [tables])).rows,
    constraints: (await db.query(`select c.relname table_name,k.conname,k.contype,pg_get_constraintdef(k.oid) definition
      from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=any($1::text[]) order by table_name,k.conname`, [tables])).rows,
    indexes: (await db.query(`select tablename,indexname,indexdef from pg_indexes
      where schemaname='public' and tablename=any($1::text[]) order by tablename,indexname`, [tables])).rows,
    policies: (await db.query(`select tablename,policyname,cmd,roles,qual,with_check from pg_policies
      where schemaname='public' and tablename=any($1::text[]) order by tablename,policyname`, [tables])).rows,
    triggers: (await db.query(`select event_object_table trigger_table,trigger_name,event_manipulation,action_statement
      from information_schema.triggers where trigger_schema='public' and event_object_table=any($1::text[])
      order by trigger_table,trigger_name,event_manipulation`, [tables])).rows,
    functions: (await db.query(`select proname,prosecdef security_definer
      from pg_proc where pronamespace='public'::regnamespace and proname=any($1::text[])
      order by proname`, [["validate_artifact_scope","enforce_artifact_immutability","enforce_generation_updates",
        "reject_artifact_relationship_cycle","reject_immutable_row_change","finalize_document_artifact"]])).rows,
    artifactBucket: (await db.query("select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='document-artifacts'")).rows[0] ?? null,
    storagePolicies: (await db.query(`select policyname,cmd,roles,qual,with_check from pg_policies
      where schemaname='storage' and tablename='objects' and policyname like 'document_artifacts_storage_%'
      order by policyname`)).rows,
  };
}

async function postcheck() {
  return {
    mode: "postcheck",
    projectRef,
    artifactCounts: (await db.query(`select artifact_type,status,count(*)::int count
      from public.document_artifacts group by artifact_type,status order by artifact_type,status`)).rows,
    generationCounts: (await db.query(`select generation_kind,status,count(*)::int count
      from public.processing_generations group by generation_kind,status order by generation_kind,status`)).rows,
    sourceArtifacts: (await db.query(`select a.id artifact_id,a.project_id,a.document_id,a.document_version_id,
      d.celex_number,a.storage_bucket,a.storage_path,a.sha256,a.byte_size,a.status,a.producer_kind,a.producer_version
      from public.document_artifacts a join public.documents d on d.id=a.document_id
      where a.artifact_type='SOURCE_PDF' order by a.created_at`)).rows,
    nonSourceArtifacts: Number((await db.query("select count(*) from public.document_artifacts where artifact_type<>'SOURCE_PDF'")).rows[0].count),
  };
}

async function routeAudit() {
  return {
    mode: "route-audit",
    documents: (await db.query(`select p.id project_id,d.id document_id,d.celex_number,d.parent_document_id,
      dv.id document_version_id,dv.version_number,dv.source_storage_bucket,dv.source_storage_path,
      dv.source_filename,dv.source_file_size_bytes,dv.created_at
      from public.documents d join public.projects p on p.id=d.project_id
      join public.document_versions dv on dv.document_id=d.id
      where dv.source_storage_bucket='source-documents' and dv.source_storage_path is not null
      order by d.id,dv.version_number desc`)).rows,
  };
}

async function inventory(register, onlyVersionId = null) {
  const candidates = (await db.query(`select p.id project_id,p.owner_id,d.id document_id,d.celex_number,d.source_language,
    d.source_reference,d.source_retrieved_at,d.parent_document_id,d.provenance_metadata,
    dv.id document_version_id,dv.version_number,dv.created_at version_created_at,
    dv.source_storage_bucket,dv.source_storage_path,dv.source_filename,dv.source_mime_type,dv.source_file_size_bytes,
    a.id artifact_id,a.sha256 artifact_sha256,a.byte_size artifact_byte_size,a.storage_bucket artifact_bucket,
    a.storage_path artifact_path,a.status artifact_status
    from public.document_versions dv join public.documents d on d.id=dv.document_id join public.projects p on p.id=d.project_id
    left join public.document_artifacts a on a.document_version_id=dv.id and a.artifact_type='SOURCE_PDF'
    where dv.source_storage_bucket='source-documents' and dv.source_storage_path is not null
      and lower(coalesce(dv.source_mime_type,''))='application/pdf'
    order by dv.created_at,dv.id`)).rows.filter((row) => !onlyVersionId || row.document_version_id === onlyVersionId);
  if (onlyVersionId && candidates.length !== 1) throw new Error(`document_version_id ${onlyVersionId} is not one exact inventory candidate`);
  const manifest = [];
  for (const row of candidates) {
    if (onlyVersionId) {
      const routeVersion = (await db.query(`select id from public.document_versions
        where document_id=$1 and source_storage_bucket is not null and source_storage_path is not null
        order by version_number desc limit 1`, [row.document_id])).rows[0];
      if (!routeVersion || routeVersion.id !== row.document_version_id) {
        throw new Error(`authenticated source route would not resolve exact document_version_id ${row.document_version_id}`);
      }
    }
    const local = await localAuthenticatedBytes(row.document_version_id);
    const item = {
      project_id: row.project_id, document_id: row.document_id, document_version_id: row.document_version_id,
      celex: row.celex_number, corrigendum: Boolean(row.parent_document_id), language: row.source_language,
      source_url: row.source_reference, retrieval_timestamp: row.source_retrieved_at ?? row.version_created_at,
      storage_bucket: row.source_storage_bucket, storage_path: row.source_storage_path,
      metadata: { filename: row.source_filename, mime_type: row.source_mime_type, byte_size: Number(row.source_file_size_bytes) },
      artifact_id: row.artifact_id, status: null, sha256: null, byte_size: null, error_category: null,
      authenticated_evidence_path: local?.file ?? null,
    };
    if (row.artifact_id && !local) {
      Object.assign(item, { status: "UNAUTHORIZED", sha256: row.artifact_sha256, byte_size: Number(row.artifact_byte_size),
        error_category: "registered_object_bytes_unavailable_for_current_integrity_verification" });
      manifest.push(item); continue;
    }
    if (!local) {
      Object.assign(item, { status: "UNAUTHORIZED", error_category: "authenticated_storage_bytes_unavailable_to_cli" });
      manifest.push(item); continue;
    }
    if (!isPdf(local.bytes)) {
      Object.assign(item, { status: "INVALID_PDF", error_category: "missing_pdf_signature" });
      manifest.push(item); continue;
    }
    const actual = integrity(local.bytes);
    Object.assign(item, { sha256: actual.sha256, byte_size: actual.byteSize });
    if (row.artifact_id) {
      if (row.artifact_sha256 !== actual.sha256 || Number(row.artifact_byte_size) !== actual.byteSize
          || row.artifact_bucket !== row.source_storage_bucket || row.artifact_path !== row.source_storage_path) {
        Object.assign(item, { status: "OTHER_ERROR", error_category: "existing_artifact_integrity_mismatch" });
      } else item.status = "ALREADY_REGISTERED";
      manifest.push(item); continue;
    }
    item.status = "READY";
    if (register) {
      await db.query("begin");
      try {
        await db.query("select pg_advisory_xact_lock(hashtext($1))", [row.document_version_id]);
        const existing = (await db.query(`select id,sha256,byte_size,storage_bucket,storage_path from public.document_artifacts
          where document_version_id=$1 and artifact_type='SOURCE_PDF'`, [row.document_version_id])).rows[0];
        if (existing) {
          if (existing.sha256 !== actual.sha256 || Number(existing.byte_size) !== actual.byteSize
              || existing.storage_bucket !== row.source_storage_bucket || existing.storage_path !== row.source_storage_path) {
            throw new Error("concurrent SOURCE_PDF registration conflicts with actual bytes or storage identity");
          }
          Object.assign(item, { status: "ALREADY_REGISTERED", artifact_id: existing.id });
        } else {
          const generationId = randomUUID();
          const artifactId = randomUUID();
          await db.query(`insert into public.processing_generations
            (id,project_id,document_id,document_version_id,generation_kind,generation_number,idempotency_key,
             input_fingerprint_sha256,status,producer_kind,producer_version,algorithm_version,validation_status,
             source_coverage_status,ordered_token_status,started_at,completed_at,created_by)
            values($1,$2,$3,$4,'source_registration',1,$5,$6,'completed','legacy_source_backfill','phase6c2','1',
             'PASS','PASS','PASS',now(),now(),$7)`, [generationId,row.project_id,row.document_id,row.document_version_id,
             `legacy-source-pdf:${row.document_version_id}:${actual.sha256}`,actual.sha256,row.owner_id]);
          await db.query(`insert into public.document_artifacts
            (id,project_id,document_id,document_version_id,processing_generation_id,artifact_type,artifact_generation,status,
             storage_bucket,storage_path,original_filename,sha256,byte_size,mime_type,producer_kind,producer_version,
             created_by,available_at)
            values($1,$2,$3,$4,$5,'SOURCE_PDF',1,'available',$6,$7,$8,$9,$10,'application/pdf',
             'legacy_source_backfill','phase6c2',$11,now())`, [artifactId,row.project_id,row.document_id,row.document_version_id,
             generationId,row.source_storage_bucket,row.source_storage_path,row.source_filename ?? `${row.document_version_id}.pdf`,
             actual.sha256,actual.byteSize,row.owner_id]);
          Object.assign(item, { status: "REGISTERED", artifact_id: artifactId });
        }
        await db.query("commit");
      } catch (error) {
        await db.query("rollback");
        Object.assign(item, { status: "OTHER_ERROR", error_category: error instanceof Error ? error.message : String(error) });
      }
    }
    manifest.push(item);
  }
  const statuses = ["READY","REGISTERED","ALREADY_REGISTERED","MISSING_OBJECT","INVALID_PDF","AMBIGUOUS_IDENTITY","UNAUTHORIZED","OTHER_ERROR"];
  return {
    mode: register ? "register" : "dry-run",
    authenticatedDownloadDirectory: DOWNLOAD_DIRECTORY,
    candidates: manifest,
    summary: Object.fromEntries(["candidates", ...statuses].map((status) => [status.toLowerCase(), status === "candidates" ? manifest.length : manifest.filter((item) => item.status === status).length])),
  };
}

await db.connect();
try {
  if (["verify-manual", "register-manual"].includes(MODE) && !EXPLICIT_VERSION_ID) {
    throw new Error(`${MODE} requires an explicit document_version_id argument`);
  }
  const result = MODE === "preflight" ? await preflight()
    : MODE === "runtime-schema" ? await runtimeSchema()
    : MODE === "postcheck" ? await postcheck()
    : MODE === "route-audit" ? await routeAudit()
    : await inventory(MODE === "register" || MODE === "register-manual", EXPLICIT_VERSION_ID);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await db.end();
}
