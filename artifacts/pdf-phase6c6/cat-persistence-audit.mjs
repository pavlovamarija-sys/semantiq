import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const { Client }=createRequire(import.meta.url)(process.env.PG_CLIENT_DIR+"/node_modules/pg");
const url=new URL((await readFile("supabase/.temp/pooler-url","utf8")).trim());
const db=new Client({host:url.hostname,port:Number(url.port),database:url.pathname.slice(1),user:decodeURIComponent(url.username),password:process.env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
await db.connect();
const version="74a67935-d57f-428f-aa34-d8d603ddda1e";
const generations=(await db.query("select * from public.processing_generations where document_version_id=$1 and generation_kind='cat_projection' order by generation_number",[version])).rows;
const ids=generations.map(row=>row.id);
const projections=ids.length?(await db.query("select * from public.cat_projections where processing_generation_id=any($1::uuid[]) order by projection_generation",[ids])).rows:[];
const projectionIds=projections.map(row=>row.id);
const artifacts=ids.length?(await db.query("select * from public.document_artifacts where processing_generation_id=any($1::uuid[]) order by created_at",[ids])).rows:[];
const relationships=artifacts.length?(await db.query("select * from public.artifact_relationships where child_artifact_id=any($1::uuid[]) order by created_at",[artifacts.map(row=>row.id)])).rows:[];
const counts=projectionIds.length?(await db.query(`select p.id,
 (select count(*)::int from public.cat_projection_mappings m where m.cat_projection_id=p.id) mappings,
 (select min(mapping_ordinal)::int from public.cat_projection_mappings m where m.cat_projection_id=p.id) min_mapping,
 (select max(mapping_ordinal)::int from public.cat_projection_mappings m where m.cat_projection_id=p.id) max_mapping,
 (select count(distinct canonical_tu_id)::int from public.cat_projection_mappings m where m.cat_projection_id=p.id) distinct_canonical,
 (select count(distinct studio_trans_unit_id)::int from public.cat_projection_mappings m where m.cat_projection_id=p.id) distinct_studio,
 (select count(*)::int from public.cat_projection_structural_units s where s.cat_projection_id=p.id) structural,
 (select count(*)::int from public.cat_projection_structural_units s where s.cat_projection_id=p.id and s.structural_kind='excluded_page_break') excluded_page_breaks
 from public.cat_projections p where p.id=any($1::uuid[])`,[projectionIds])).rows:[];
const storage=artifacts.length?(await db.query("select bucket_id,name,metadata,created_at,updated_at from storage.objects where bucket_id=any($1::text[]) and name=any($2::text[])",[artifacts.map(row=>row.storage_bucket),artifacts.map(row=>row.storage_path)])).rows:[];
const inputs=ids.length?(await db.query("select * from public.processing_generation_inputs where generation_id=any($1::uuid[]) order by generation_id,input_ordinal",[ids])).rows:[];
const integrity=projectionIds.length?(await db.query(`select p.id,
 (select count(*)::int from public.cat_projection_mappings m join public.canonical_translation_units t on t.canonical_snapshot_id=p.canonical_snapshot_id and t.id=m.canonical_tu_id where m.cat_projection_id=p.id and (m.canonical_ordinal<>t.ordinal or m.source_sha256<>t.source_hash)) canonical_mismatches,
 (select count(*)::int from public.cat_projection_mappings m where m.cat_projection_id=p.id and m.mapping_ordinal<>m.canonical_ordinal) ordinal_mismatches,
 (select count(*)::int from (select studio_unit_index,lag(studio_unit_index) over(order by mapping_ordinal) prior from public.cat_projection_mappings where cat_projection_id=p.id) q where prior is not null and studio_unit_index<=prior) order_defects,
 (select count(*)::int from public.cat_projection_structural_units s where s.cat_projection_id=p.id and (s.structural_kind<>'excluded_page_break' or s.studio_tag_id not in ('0','1','2','3','4','5'))) structural_mismatches
 from public.cat_projections p where p.id=any($1::uuid[])`,[projectionIds])).rows:[];
const mappingRows=projectionIds.length?(await db.query("select canonical_ordinal,studio_trans_unit_id,source_sha256 from public.cat_projection_mappings where cat_projection_id=$1 order by mapping_ordinal",[projectionIds[0]])).rows:[];
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)])):value;
const recomputedSourceUnitsSha256=createHash('sha256').update(JSON.stringify(stable(mappingRows.map(row=>({canonicalOrdinal:row.canonical_ordinal,studioUnitId:row.studio_trans_unit_id,sourceSha256:row.source_sha256}))))).digest('hex');
console.log(JSON.stringify({generations,projections,artifacts,relationships,counts,integrity,recomputedSourceUnitsSha256,sourceUnitsHashMatches:projections[0]?.source_units_sha256===recomputedSourceUnitsSha256,storage,inputs},null,2));
await db.end();
