export type CalendarActionState = { status: "idle" | "success" | "error"; message?: string };
export const initialCalendarActionState: CalendarActionState = { status: "idle" };
