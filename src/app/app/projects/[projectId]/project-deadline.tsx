"use client";
import { useActionState } from "react";
import { updateProjectDeadline, type DeadlineState } from "./project-deadline-actions";
import { t } from "@/i18n/ui";
export function ProjectDeadline({ projectId, deadline }: { projectId: string; deadline: string | null }) {
  const [state, action, pending] = useActionState<DeadlineState, FormData>(updateProjectDeadline, { status: "idle" });
  return <form action={action} className="project-deadline-form"><input type="hidden" name="projectId" value={projectId}/><label>{t.deadline}<input type="date" name="deadline" defaultValue={deadline ?? ""}/></label><button type="submit" disabled={pending}>{pending ? t.saving : t.save}</button>{state.status === "error" && <small role="alert">{state.message}</small>}{state.status === "success" && <small>{t.deadlineSaved}</small>}</form>;
}
