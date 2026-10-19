import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";
import { CelexImport } from "../celex-import";
import { SourceDocumentUpload } from "../document-controls";
import { WorkspaceSidebar } from "../workspace-sidebar";
import { resolveWorkspaceProjectId } from "@/infrastructure/projects/workspace-project";
import { ImportProjectControls } from "./import-project-controls";

export const dynamic = "force-dynamic";

export default async function ImportAcquisPage({ params }: { params:Promise<{projectId:string}> }) {
  const user=await getAuthenticatedUser(); if(!user)redirect("/login");
  const {projectId}=await params; const supabase=await createSupabaseServerClient();
  const [{data:project}, {data:projects, error:projectsError}] = await Promise.all([
    supabase.from("projects").select("id,name").eq("id",projectId).maybeSingle(),
    supabase.from("projects").select("id,name").order("created_at", { ascending: false }),
  ]);
  if (projectsError) throw new Error("Unable to load projects.");
  if(!project){const fallback=await resolveWorkspaceProjectId(supabase);if(fallback&&fallback!==projectId)redirect(`/app/projects/${fallback}/import`);notFound();}
  const displayName=typeof user.user_metadata?.full_name==="string"?user.user_metadata.full_name:user.email?.split("@")[0]??"Account";
  const initials=displayName.split(/[\s._-]+/).map((part:string)=>part[0]).slice(0,2).join("").toUpperCase();
  return <main className="site-shell dashboard-shell documents-shell import-acquis-shell">
    <WorkspaceSidebar projectId={project.id} active="import" displayName={displayName} initials={initials}/>
    <div className="dashboard-body import-acquis-page"><header><div><p className="import-acquis-eyebrow">{project.name}</p><h1>Увези правни акти на ЕУ</h1><p>Додајте официјален документ од EUR-Lex или поставете изворен PDF. Постојните постапки за валидација, потекло и обработка остануваат зачувани.</p></div><ImportProjectControls activeProjectId={project.id} projects={projects ?? []}/></header>
      <div className="import-acquis-options">
        <section className="import-acquis-card"><span className="import-acquis-step">1</span><CelexImport projectId={project.id} mode="manual"/></section>
        <section className="import-acquis-card"><span className="import-acquis-step">2</span><CelexImport projectId={project.id} mode="screenshot"/></section>
        <section className="import-acquis-card"><span className="import-acquis-step">3</span><div><h2>Поставете PDF-документ</h2><p>Поставете локален PDF. Оригиналната датотека се зачувува, а постојната постапка за анализа на PDF и конверзија во Word останува достапна во Работниот простор.</p></div><SourceDocumentUpload projectId={project.id} pdfOnly showOpenAction/></section>
      </div>
    </div>
  </main>;
}
