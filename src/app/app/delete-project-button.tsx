"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { deleteProject, type DeleteProjectState } from "@/app/auth/actions";
import { Icon } from "@/app/ui/brand";

const initialState: DeleteProjectState = { status: "idle" };

export function DeleteProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(deleteProject, initialState);

  useEffect(() => {
    if (state.status !== "success") return;
    dialogRef.current?.close();
    router.refresh();
  }, [router, state.status]);

  return <>
    <button className="project-delete-button" type="button" aria-label={`Избриши ${projectName}`} title="Избриши проект" onClick={() => dialogRef.current?.showModal()}>
      <Icon name="trash" className="h-4 w-4" />
    </button>
    <dialog ref={dialogRef} className="delete-project-dialog" onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current.close(); }}>
      <form action={formAction} className="delete-project-dialog-content">
        <input type="hidden" name="projectId" value={projectId} />
        <h2>Да се избрише овој проект?</h2>
        <p>This action cannot be undone.</p>
        {state.status === "error" && <p className="delete-project-error" role="alert">{state.message}</p>}
        <div className="delete-project-dialog-actions">
          <button className="button delete-project-cancel" type="button" disabled={pending} onClick={() => dialogRef.current?.close()}>Откажи</button>
          <button className="button delete-project-confirm" type="submit" disabled={pending}>{pending ? "Се брише…" : "Избриши"}</button>
        </div>
      </form>
    </dialog>
  </>;
}
