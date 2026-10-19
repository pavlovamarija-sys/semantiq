import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";
import styles from "./projects-directory.module.css";

export const dynamic = "force-dynamic";

export default async function ProjectsDirectoryPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const { data: projects, error: projectsError } = await supabase.from("projects")
    .select("id,name,status,created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (projectsError) {
    console.error("Projects directory query failed", { code: projectsError.code, message: projectsError.message, details: projectsError.details, hint: projectsError.hint });
  }
  const projectRows = projects ?? [];
  const { data: documents, error: documentsError } = await supabase.from("documents")
    .select("id,project_id,title,source_filename,created_at")
    .in("project_id", projectRows.map((project) => project.id))
    .order("created_at", { ascending: false });
  if (documentsError) console.error("Projects directory documents query failed", { code: documentsError.code, message: documentsError.message, details: documentsError.details, hint: documentsError.hint });
  const documentsByProject = new Map<string, typeof documents>();
  for (const document of documents ?? []) documentsByProject.set(document.project_id, [...(documentsByProject.get(document.project_id) ?? []), document]);

  return <main className={styles.page}>
    <header className={styles.header}><div><Link href="/app" className={styles.back}>← Контролна табла</Link><h1>Проекти</h1><p>{projectRows.length} проекти · {documents?.length ?? 0} документи</p></div><Link href="/app" className={styles.action}>Назад</Link></header>
    <section className={styles.grid} aria-label="Список на проекти">
      {projectRows.length ? projectRows.map((project) => { const projectDocuments = documentsByProject.get(project.id) ?? []; return <article className={styles.card} key={project.id}><div className={styles.cardHead}><div><h2>{project.name}</h2><span>{project.status === "completed" ? "Завршен" : "Активен"}</span></div><strong>{projectDocuments.length}</strong></div><p>Документи</p><ul>{projectDocuments.map((document) => <li key={document.id}><Link href={`/app/projects/${project.id}?document=${document.id}`}>{document.title ?? document.source_filename ?? "Документ"}</Link></li>)}</ul><Link className={styles.open} href={`/app/projects/${project.id}`}>Отвори проект →</Link></article>; }) : <div className={styles.empty}>Нема достапни проекти.</div>}
    </section>
  </main>;
}
