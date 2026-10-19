import { notFound, redirect } from "next/navigation";
import { backfillProjectCharacterCounts } from "@/infrastructure/document-analysis/backfill-character-counts";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";
import { runDeterministicLegalQa } from "@/application/translation/deterministic-legal-qa";
import { DocumentsWorkspace, type WorkspaceDocument } from "./documents-workspace";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { resolveWorkspaceProjectId } from "@/infrastructure/projects/workspace-project";
import { ProjectDeadline } from "./project-deadline";

export const dynamic = "force-dynamic";

async function hasStorageObject(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, bucket: string, objectPath: string) {
  const separator = objectPath.lastIndexOf("/");
  const folder = separator >= 0 ? objectPath.slice(0, separator) : "";
  const filename = separator >= 0 ? objectPath.slice(separator + 1) : objectPath;
  const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 100, search: filename });
  return !error && Boolean(data?.some((item) => item.name === filename));
}

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams:Promise<{document?:string}> }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: project, error: projectError } = await supabase.from("projects").select("id, name, source_language, target_language, status, deadline_date").eq("id", projectId).eq("owner_id", user.id).maybeSingle();
  if (projectError) console.error("Project workspace query failed", { projectId, code: projectError.code, message: projectError.message, details: projectError.details, hint: projectError.hint });
  if (!project) {
    const fallbackProjectId=await resolveWorkspaceProjectId(supabase);
    if(fallbackProjectId&&fallbackProjectId!==projectId)redirect(`/app/projects/${fallbackProjectId}`);
    notFound();
  }
  try {
    const backfill = await backfillProjectCharacterCounts(supabase, project.id);
    for (const result of backfill) if (result.error) console.error("Document character-count backfill failed.", { projectId: project.id, versionId: result.versionId, error: result.error });
  } catch (error) {
    console.error("Unable to run document character-count backfill.", { projectId: project.id, error: error instanceof Error ? error.message : String(error) });
  }

  const { data: documents, error } = await supabase.from("documents")
    .select("id, title, document_type, source_filename, celex_number, created_at, parent_document_id, relation_type, publication_date, derived_from_document_id, derivation_type, transformation_status, transformation_error, document_versions(id, version_number, extraction_status, source_storage_bucket, source_storage_path, characters_without_spaces, characters_with_spaces, character_count_error, document_translation_runs(id,status,total_segments,translated_segments,document_qa,error_message,created_at), document_translation_artifacts(id,artifact_type,filename,storage_bucket,storage_path,segment_count,status))")
    .eq("project_id", project.id).order("created_at", { ascending: false });
  if (error) {
    console.error("Project documents query failed", { projectId, code: error.code, message: error.message, details: error.details, hint: error.hint });
    throw new Error("Unable to load project documents.");
  }

  const documentRows = await Promise.all(documents.map(async (document) => {
    const sourceVersion = [...document.document_versions].sort((a, b) => b.version_number - a.version_number).find((version) => version.source_storage_bucket === "source-documents" && version.source_storage_path);
    const storageObjectExists = sourceVersion?.source_storage_path ? await hasStorageObject(supabase, sourceVersion.source_storage_bucket ?? "source-documents", sourceVersion.source_storage_path) : false;
    const artifact = sourceVersion?.document_translation_artifacts?.find((item) => item.artifact_type === "mk1_docx" && item.status === "completed") ?? null;
    const reportArtifact = sourceVersion?.document_translation_artifacts?.find((item) => item.artifact_type === "translation_report_docx" && item.status === "completed") ?? null;
    const latestRun = sourceVersion?.document_translation_runs?.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
    let currentQaStatus = latestRun?.document_qa?.status ?? null;
    let translatedPreview: string | null = null;
    if (latestRun?.status === "completed") {
      const { data: runSegments } = await supabase.from("document_translation_run_segments").select("segment_id,translation_version_id").eq("run_id", latestRun.id);
      const segmentIds = (runSegments ?? []).map((item) => item.segment_id);
      const versionIds = (runSegments ?? []).map((item) => item.translation_version_id);
      if (segmentIds.length && versionIds.length) {
        const [{ data: segments }, { data: versions }] = await Promise.all([
          supabase.from("document_segments").select("id,source_text").in("id", segmentIds),
          supabase.from("translation_versions").select("id,target_text").in("id", versionIds),
        ]);
        const sourceById = new Map((segments ?? []).map((item) => [item.id, item.source_text]));
        const targetById = new Map((versions ?? []).map((item) => [item.id, item.target_text]));
        translatedPreview = (runSegments ?? []).map((item) => targetById.get(item.translation_version_id) ?? "").filter(Boolean).join("\n");
        if (sourceById.size === segmentIds.length && targetById.size === versionIds.length) currentQaStatus = runDeterministicLegalQa((runSegments ?? []).map((item) => sourceById.get(item.segment_id) ?? "").join("\n"), translatedPreview).status;
      }
    }
    return { ...document, sourceVersion, artifact, reportArtifact, latestRun, currentQaStatus, translatedPreview, storageObjectExists };
  }));

  const roots = documentRows.filter((document) => !document.parent_document_id && !document.derived_from_document_id);
  const childrenByParent = new Map<string, typeof documentRows>();
  for (const document of documentRows) if (document.parent_document_id) childrenByParent.set(document.parent_document_id, [...(childrenByParent.get(document.parent_document_id) ?? []), document]);
  const workingBySource = new Map(documentRows.filter((document) => document.derived_from_document_id && document.derivation_type === "pdf_to_docx").map((document) => [document.derived_from_document_id as string, document]));
  const workspaceDocuments: WorkspaceDocument[] = roots.map((document) => {
    const uploaded = document.document_versions.some((version) => Boolean(version.source_storage_path));
    const working = workingBySource.get(document.id);
    const status: WorkspaceDocument["status"] = working?.latestRun?.status === "completed" ? "translated" : working?.transformation_status === "processing" ? "processing" : ["failed", "needs_review"].includes(working?.transformation_status ?? "") ? "failed" : uploaded ? "ready" : "pending";
    return {
      id: document.id, title: document.title, filename: document.source_filename ?? document.title, documentType: document.document_type ?? "file", celex: document.celex_number, publicationDate: document.publication_date, createdAt: document.created_at, status,
      sourceUrl: document.storageObjectExists ? `/api/projects/${project.id}/documents/${document.id}/storage/source` : null,
      charactersWithoutSpaces: document.sourceVersion?.characters_without_spaces ?? null, charactersWithSpaces: document.sourceVersion?.characters_with_spaces ?? null, characterCountError: document.sourceVersion?.character_count_error ?? null,
      children: (childrenByParent.get(document.id) ?? []).map((child) => ({ id: child.id, title: child.title, filename: child.source_filename ?? child.title, celex: child.celex_number, publicationDate: child.publication_date, sourceUrl: child.storageObjectExists ? `/api/projects/${project.id}/documents/${child.id}/storage/source` : null })),
      working: working ? {
        id: working.id, title: working.source_filename ?? working.title, status: working.transformation_status as "processing" | "ready" | "failed" | "needs_review" | null, storageObjectExists: working.storageObjectExists,
        sourceUrl: working.storageObjectExists ? `/api/projects/${project.id}/documents/${working.id}/storage/source` : null,
        charactersWithoutSpaces: working.sourceVersion?.characters_without_spaces ?? null, charactersWithSpaces: working.sourceVersion?.characters_with_spaces ?? null, characterCountError: working.sourceVersion?.character_count_error ?? null, translatedPreview: working.translatedPreview,
        run: working.latestRun ? { status: working.latestRun.status, total_segments: working.latestRun.total_segments, translated_segments: working.latestRun.translated_segments, document_qa: working.latestRun.document_qa, error_message: working.latestRun.error_message } : null,
        qaStatus: working.currentQaStatus,
        artifact: working.artifact ? { filename: working.artifact.filename, url: `/api/projects/${project.id}/documents/${working.id}/storage/mk1` } : null,
        report: working.reportArtifact ? { filename: working.reportArtifact.filename, url: `/api/projects/${project.id}/documents/${working.id}/storage/report` } : null,
      } : null,
    };
  });

  const displayName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email?.split("@")[0] ?? "Account";
  const initials = displayName.split(/[\s._-]+/).map((part: string) => part[0]).slice(0, 2).join("").toUpperCase();
  const requestedDocumentId=(await searchParams).document;
  return <main className="site-shell dashboard-shell documents-shell">
    <WorkspaceSidebar projectId={project.id} active="documents" displayName={displayName} initials={initials}/>
    <div className="dashboard-body documents-dashboard-body"><ProjectDeadline projectId={project.id} deadline={project.deadline_date}/><DocumentsWorkspace projectId={project.id} projectName={project.name} sourceLanguage={project.source_language} targetLanguage={project.target_language} documents={workspaceDocuments} initialDocumentId={requestedDocumentId} /></div>
  </main>;
}
