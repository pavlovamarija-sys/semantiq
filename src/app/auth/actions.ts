"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { revalidatePath } from "next/cache";

const emailAddress = z.string().trim().toLowerCase().pipe(z.email().max(254));
const credentials = z.object({ email: emailAddress, password: z.string().min(1).max(1024) });
const registration = credentials.extend({ confirmPassword: z.string() })
  .refine((value) => value.password.length >= 8 && value.password === value.confirmPassword);

export async function signIn(formData: FormData) {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) redirect("/login?error=invalid-input");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    logAuthError("password sign-in", error);
    redirect(`/login?error=${signInErrorCode(error)}`);
  }
  redirect("/app");
}

export async function signInFromHome(formData: FormData) {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) redirect("/?error=invalid-input");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    logAuthError("homepage password sign-in", error);
    redirect(`/?error=${signInErrorCode(error)}`);
  }
  redirect("/app");
}

export async function requestPasswordReset(formData: FormData) {
  const email = emailAddress.safeParse(formData.get("email"));
  if (!email.success) redirect("/forgot-password?error=invalid-email");
  const supabase = await createSupabaseServerClient();
  const redirectTo = new URL("/auth/recovery/callback", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").toString();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo });
  if (error) {
    logAuthError("password recovery request", error);
    const code = error.code === "over_email_send_rate_limit" ? "rate-limit" : error.status && error.status >= 500 ? "unavailable" : "request";
    redirect(`/forgot-password?error=${code}`);
  }
  redirect("/forgot-password?notice=sent");
}

type SupabaseAuthError = { name?: string; message?: string; code?: string; status?: number; cause?: unknown };

function logAuthError(operation: string, error: SupabaseAuthError) {
  console.error(`[Auth] ${operation} failed ${JSON.stringify({
    name: error.name ?? "UnknownAuthError",
    code: error.code ?? "unknown",
    status: error.status ?? null,
    message: error.message ?? "No error message",
    cause: error.cause instanceof Error ? { name: error.cause.name, message: error.cause.message } : null,
  })}`);
}

function signInErrorCode(error: SupabaseAuthError) {
  if (error.code === "email_not_confirmed") return "email-not-confirmed";
  if (error.code === "user_banned") return "account-disabled";
  if (error.code === "over_request_rate_limit") return "rate-limit";
  if (error.status && error.status >= 500) return "unavailable";
  return "credentials";
}

export async function updatePassword(formData: FormData) {
  const passwords = z.object({ password: z.string().min(8).max(1024), confirmPassword: z.string().min(8).max(1024) })
    .refine((value) => value.password === value.confirmPassword)
    .safeParse({ password: formData.get("password"), confirmPassword: formData.get("confirmPassword") });
  if (!passwords.success) redirect("/reset-password?error=password-mismatch");
  const user = await getAuthenticatedUser(); if (!user) redirect("/reset-password?error=session");
  const supabase = await createSupabaseServerClient(); const { error } = await supabase.auth.updateUser({ password: passwords.data.password });
  if (error) { logAuthError("password update", error); redirect("/reset-password?error=update"); } redirect("/app");
}

export async function signUp(formData: FormData) {
  const parsed = registration.safeParse({ email: formData.get("email"), password: formData.get("password"), confirmPassword: formData.get("confirmPassword") });
  if (!parsed.success) redirect("/signup?error=invalid-input");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: new URL("/auth/callback", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").toString() },
  });
  if (error) redirect("/signup?error=signup");
  if (!data.session) redirect("/login?notice=confirm-email");
  redirect("/app");
}

export async function signOut() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("Unable to sign out. Please try again.");
  redirect("/login?notice=signed-out");
}

async function insertProject(name: string, userId: string, description?: string, deadlineDate?: string | null) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("projects").insert({
    name,
    description: description || null,
    source_language: "en",
    target_language: "mk",
    status: "active",
    owner_id: userId,
    deadline_date: deadlineDate || null,
  }).select("id").single();
  if (error || !data) throw new Error("Unable to create project.");
  return data.id;
}

export async function createProject(formData: FormData) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const name = z.string().trim().min(1).max(200).safeParse(formData.get("name"));
  if (!name.success) redirect("/app?error=project-name");

  const deadline = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).safeParse(formData.get("deadline"));
  if (!deadline.success) redirect("/app?error=project-deadline");
  try { await insertProject(name.data, user.id, undefined, deadline.data || null); } catch { redirect("/app?error=project-create"); }
  revalidatePath("/app");
  redirect("/app");
}

export type ImportProjectState = { status: "idle" | "success" | "error"; message?: string; projectId?: string };

export async function createProjectForImport(_state: ImportProjectState, formData: FormData): Promise<ImportProjectState> {
  const user = await getAuthenticatedUser();
  if (!user) return { status: "error", message: "Your session has expired. Sign in and try again." };
  const name = z.string().trim().min(1).max(200).safeParse(formData.get("name"));
  if (!name.success) return { status: "error", message: "Enter a project name." };
  const description = z.string().trim().max(2000).optional().safeParse(formData.get("description") || undefined);
  if (!description.success) return { status: "error", message: "The description is too long." };
  try {
    const deadline = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).safeParse(formData.get("deadline"));
    if (!deadline.success) return { status: "error", message: "Choose a valid deadline." };
    const projectId = await insertProject(name.data, user.id, description.data, deadline.data || null);
    revalidatePath("/app");
    revalidatePath(`/app/projects/${projectId}/import`);
    return { status: "success", projectId };
  } catch {
    return { status: "error", message: "Unable to create the project. Please try again." };
  }
}

export type DeleteProjectState = { status: "idle" | "success" | "error"; message?: string };

export async function deleteProject(_state: DeleteProjectState, formData: FormData): Promise<DeleteProjectState> {
  const user = await getAuthenticatedUser();
  if (!user) return { status: "error", message: "Your session has expired. Sign in and try again." };

  const projectId = z.uuid().safeParse(formData.get("projectId"));
  if (!projectId.success) return { status: "error", message: "Unable to identify this project." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("projects").delete().eq("id", projectId.data).select("id").maybeSingle();
  if (error) return { status: "error", message: "Unable to delete this project. It may contain related work or you may not have permission." };
  if (!data) return { status: "error", message: "Project not found or you do not have permission to delete it." };

  revalidatePath("/app");
  return { status: "success" };
}
