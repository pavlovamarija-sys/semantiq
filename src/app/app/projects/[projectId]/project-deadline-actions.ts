"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";
export type DeadlineState = { status: "idle" | "success" | "error"; message?: string };
export async function updateProjectDeadline(_state: DeadlineState, formData: FormData): Promise<DeadlineState> {
  const projectId = z.uuid().safeParse(formData.get("projectId")); const deadline = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).safeParse(formData.get("deadline") ?? "");
  if (!projectId.success || !deadline.success) return { status: "error", message: "Choose a valid deadline." };
  const user = await getAuthenticatedUser(); if (!user) return { status: "error", message: "Your session has expired." }; const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("projects").update({ deadline_date: deadline.data || null }).eq("id", projectId.data).eq("owner_id", user.id);
  if (error) { console.error("Project deadline update failed", { code: error.code, message: error.message }); return { status: "error", message: "Unable to save the deadline." }; }
  revalidatePath("/app"); revalidatePath(`/app/projects/${projectId.data}`); return { status: "success" };
}
