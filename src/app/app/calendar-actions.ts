"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";

import type { CalendarActionState } from "./calendar-state";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Choose a valid date.");

const eventSchema = z.object({
  eventId: z.union([z.literal(""), z.string().uuid()]),
  title: z.string().trim().min(1, "Enter an event title.").max(200),
  eventDate: dateSchema,
  eventTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Choose a valid time."),
  description: z.string().trim().max(2000),
  projectId: z.union([z.literal(""), z.string().uuid()]),
});

export async function saveCalendarEvent(_state: CalendarActionState, formData: FormData): Promise<CalendarActionState> {
  const parsed = eventSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the event details." };
  const user = await getAuthenticatedUser();
  if (!user) return { status: "error", message: "Your session has expired. Sign in again." };
  const supabase = await createSupabaseServerClient();
  const values = parsed.data;
  const payload = {
    owner_id: user.id,
    project_id: values.projectId || null,
    title: values.title,
    event_date: values.eventDate,
    event_time: values.eventTime,
    description: values.description || null,
  };
  const result = values.eventId
    ? await supabase.from("project_calendar_events").update(payload).eq("id", values.eventId).eq("owner_id", user.id).select("id").maybeSingle()
    : await supabase.from("project_calendar_events").insert(payload).select("id").single();
  if (result.error || !result.data) {
    console.error("Calendar event save failed", { userId: user.id, eventId: values.eventId || null, error: result.error });
    return { status: "error", message: "Unable to save this event. Check the selected project and try again." };
  }
  revalidatePath("/app");
  return { status: "success" };
}

const deleteSchema = z.object({ eventId: z.string().uuid() });

export async function deleteCalendarEvent(_state: CalendarActionState, formData: FormData): Promise<CalendarActionState> {
  const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Invalid calendar event." };
  const user = await getAuthenticatedUser();
  if (!user) return { status: "error", message: "Your session has expired. Sign in again." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("project_calendar_events").delete().eq("id", parsed.data.eventId).eq("owner_id", user.id).select("id").maybeSingle();
  if (error || !data) {
    console.error("Calendar event deletion failed", { userId: user.id, eventId: parsed.data.eventId, error });
    return { status: "error", message: "Unable to delete this event. Please try again." };
  }
  revalidatePath("/app");
  return { status: "success" };
}
