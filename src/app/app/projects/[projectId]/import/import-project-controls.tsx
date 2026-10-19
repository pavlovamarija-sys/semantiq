"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { createProjectForImport, type ImportProjectState } from "@/app/auth/actions";
import { Icon } from "@/app/ui/brand";

type Project = { id: string; name: string };
const initialState: ImportProjectState = { status: "idle" };

export function ImportProjectControls({ activeProjectId, projects }: { activeProjectId: string; projects: Project[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createProjectForImport, initialState);

  useEffect(() => {
    if (state.status === "success" && state.projectId) {
      setOpen(false);
      router.push(`/app/projects/${state.projectId}/import`);
      router.refresh();
    }
  }, [router, state]);

  return <>
    <div className="import-acquis-header-actions">
      <Link className="button button-outline" href={`/app/projects/${activeProjectId}`}><Icon name="file" />Назад во Работниот простор</Link>
      <button className="button button-primary" type="button" onClick={() => setOpen(true)}><Icon name="plus" />Нов проект</button>
    </div>
    <div className="import-active-project">
      <label htmlFor="import-project-select">Активен проект</label>
      <select id="import-project-select" value={activeProjectId} onChange={(event) => router.push(`/app/projects/${event.target.value}/import`)}>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
    </div>
    {open && <div className="backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="modal import-project-modal" role="dialog" aria-modal="true" aria-labelledby="new-import-project-title">
        <header><div><h2 id="new-import-project-title">Креирај проект</h2><p>Изберете го проектот во кој ќе се зачувуваат идните увози.</p></div><button type="button" aria-label="Затвори" onClick={() => setOpen(false)}>×</button></header>
        <form action={action}>
          <label htmlFor="import-project-name">Име на проектот</label>
          <input id="import-project-name" name="name" required maxLength={200} placeholder="Внесете име на проектот" />
          <label htmlFor="import-project-description">Опис <span>(незадолжително)</span></label>
          <textarea id="import-project-description" name="description" rows={3} placeholder="Додајте краток опис" />
          <label htmlFor="import-project-deadline">Краен рок <span>(незадолжително)</span></label>
          <input id="import-project-deadline" name="deadline" type="date" />
          {state.message && <p className="project-error" role="alert">{state.message}</p>}
          <div className="import-project-modal-actions"><button className="button button-outline" type="button" onClick={() => setOpen(false)}>Откажи</button><button className="button button-primary" type="submit" disabled={pending}>{pending ? "Се креира…" : "Креирај проект"}</button></div>
        </form>
      </section>
    </div>}
  </>;
}
