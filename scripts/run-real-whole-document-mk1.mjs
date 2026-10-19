import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { extractDocxLegalText } from "../src/infrastructure/document-analysis/extract-docx-legal-text.ts";
import { segmentLegalDocument } from "../src/application/legacy-corpus/segment-legal-document.ts";
import { orchestrateWholeDocumentMk1 } from "../src/application/translation/whole-document-mk1-orchestrator.ts";
import { createOpenAiMk1Client, translateAndPersistSegmentWithMk1 } from "../src/application/translation/mk1-translation-service.ts";

const require = createRequire(import.meta.url);
const { Client } = require(path.join(process.env.PG_CLIENT_DIR, "node_modules", "pg"));
const documentId = "8d04df7b-4888-4b27-9e67-af3d74e38162";
const versionId = "78c8ad58-7e73-4e6e-ab9c-737febe888b6";
const docxPath = ".tmp-real-run/31990L0426_EN.docx";
const pooler = new URL((await readFile("supabase/.temp/pooler-url", "utf8")).trim());
const db = new Client({ host: pooler.hostname, port: Number(pooler.port), database: pooler.pathname.slice(1), user: decodeURIComponent(pooler.username), password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
const kbDefault = process.env.TM_KNOWLEDGE_BASE_ID ?? "1f4282d9-0468-487e-bf56-685ab1f507b3";

await db.connect();
try {
  const context = (await db.query(`select d.id,d.title,d.celex_number,d.document_type,d.project_id,p.owner_id,p.source_language,p.target_language,dv.id version_id
    from public.documents d join public.projects p on p.id=d.project_id join public.document_versions dv on dv.document_id=d.id
    where d.id=$1 and dv.id=$2`, [documentId, versionId])).rows[0];
  if (!context) throw new Error("Real converted DOCX context was not found.");
  const ownerId = context.owner_id;
  await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role','authenticated',false)", [ownerId]);
  const knowledgeBase = (await db.query("select id from public.translation_knowledge_bases where owner_id=$1", [ownerId])).rows[0] ?? { id: kbDefault };
  const paragraphs = await extractDocxLegalText(new Uint8Array(await readFile(docxPath)));
  const proposed = segmentLegalDocument({ documentId, documentVersionId: versionId, language: context.source_language, role: "source", exactText: paragraphs, celexNumber: context.celex_number ?? undefined, provenance: { document_id: documentId, document_version_id: versionId, source_filename: "31990L0426_EN.docx" } });
  let segments = (await db.query("select id,segment_index,source_text from public.document_segments where document_version_id=$1 order by segment_index", [versionId])).rows;
  if (!segments.length) {
    const inserted = [];
    for (const item of proposed) {
      const row = (await db.query(`insert into public.document_segments(document_version_id,segment_index,segment_type,source_text,chapter_number,article_number,paragraph_number,point_number)
        values($1,$2,$3,$4,$5,$6,$7,$8) returning id,segment_index,source_text`, [versionId,item.index,item.type,item.exactText,item.structuralPath.chapter??null,item.structuralPath.article??null,item.structuralPath.paragraph??null,item.structuralPath.point??null])).rows[0];
      inserted.push(row);
    }
    segments = inserted;
    await db.query("update public.document_versions set raw_text=$1, extraction_status='completed' where id=$2", [paragraphs, versionId]);
  }
  const run = (await db.query("insert into public.document_translation_runs(document_version_id,status,total_segments,created_by) values($1,'translating',$2,$3) returning id", [versionId,segments.length,ownerId])).rows[0];
  const exactReader = { from() { return { select() { return this; }, eq() { return this; }, in() { return this; }, then(resolve) { return db.query(`select target_text,celex,provenance,source_kind,alignment_confidence,original_tmx_tu_id,source_text from public.approved_translation_memory_units where knowledge_base_id=$1 and source_language=$2 and target_language=$3 and source_kind='legacy_import' and trust_status='approved' and audit_status='valid' and alignment_audit_status='alignment_valid' and source_text_hash = any($4::text[])`, this._params).then((r)=>resolve({data:r.rows,error:null})); } }; } };
  const md5 = (await import("node:crypto")).createHash;
  const exact = { from() { const state={params:[]}; const builder={select(){return builder;},eq(column,value){state.params.push([column,value]);return builder;},in(column,value){state.params.push([column,value]);return builder;},then(resolve){const by=Object.fromEntries(state.params);const hashes=by.source_text_hash??[];return db.query(`select target_text,celex,provenance,source_kind,alignment_confidence,original_tmx_tu_id,source_text from public.approved_translation_memory_units where knowledge_base_id=$1 and source_language=$2 and target_language=$3 and source_kind='legacy_import' and trust_status='approved' and audit_status='valid' and alignment_audit_status='alignment_valid' and source_text_hash=any($4::text[])`,[by.knowledge_base_id,by.source_language,by.target_language,hashes]).then(r=>resolve({data:r.rows,error:null}));}};return builder;} };
  const rpc = { rpc(name,args) { return db.query(`select * from public.search_approved_legacy_tm_fuzzy($1,$2,$3,$4,$5,$6)`, [args.requested_knowledge_base_id,args.requested_source_language,args.requested_target_language,args.requested_source_text,args.minimum_similarity,args.result_limit]).then((r)=>({data:r.rows,error:null})); } };
  const persistence = { rpc(name,args) { return db.query(`select * from public.persist_generated_mk1($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9::jsonb)`, [args.requested_segment_id,args.requested_target_language,args.generated_target_text,args.generation_model,args.generation_prompt_version,JSON.stringify(args.generation_token_usage),args.generation_latency_ms,JSON.stringify(args.tm_evidence),JSON.stringify(args.qa_result)]).then((r)=>({data:r.rows.map(row=>({translation_id:row.translation_id,translation_version_id:row.translation_version_id,generated_at:row.generated_at}),),error:null})); } };
  const output = await orchestrateWholeDocumentMk1({
    segments: segments.map((s) => ({ id:s.id,index:s.segment_index,sourceText:s.source_text })),
    translateSegment: async (segment,neighbors) => {
      const result = await translateAndPersistSegmentWithMk1(exact,rpc,createOpenAiMk1Client(),persistence,segment.id,{knowledgeBaseId:knowledgeBase.id,sourceLanguage:context.source_language,targetLanguage:context.target_language,sourceText:segment.sourceText,previousSourceText:neighbors.previousSourceText,nextSourceText:neighbors.nextSourceText,documentTitle:context.title,documentType:context.document_type,celex:context.celex_number??"31990L0426"});
      return {result,translationVersionId:result.persistence.translationVersionId};
    },
    onProgress: async (progress,item) => { if(item) await db.query("insert into public.document_translation_run_segments(run_id,segment_id,translation_version_id,segment_index,qa_status) values($1,$2,$3,$4,$5)",[run.id,item.segmentId,item.translationVersionId,item.segmentIndex,item.qaStatus]); await db.query("update public.document_translation_runs set translated_segments=$1,current_segment_index=$2 where id=$3",[progress.translatedSegments,progress.currentSegmentIndex,run.id]); },
  });
  await db.query("update public.document_translation_runs set status='completed',translated_segments=$1,current_segment_index=null,document_qa=$2::jsonb,completed_at=now() where id=$3",[output.segments.length,JSON.stringify(output.qa),run.id]);
  console.log(JSON.stringify({document_id:documentId,version_id:versionId,run_id:run.id,knowledge_base_id:knowledgeBase.id,source_characters_without_spaces:context.characters_without_spaces??null,segments:output.segments.length,qa:output.qa},null,2));
} catch (error) { console.error(error); process.exitCode=1; } finally { await db.end(); }
