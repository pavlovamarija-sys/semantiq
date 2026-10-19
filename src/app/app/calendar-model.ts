export type CalendarEvent = {
  id: string;
  title: string;
  event_date: string;
  event_time: string;
  description: string | null;
  project_id: string | null;
  deadline?: boolean;
};

export type CalendarDay = { key: string; day: number; outside: boolean };

export function shiftMonth(year: number, month: number, amount: number) {
  const value = new Date(Date.UTC(year, month + amount, 1));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() };
}

export function buildCalendarDays(year: number, month: number): CalendarDay[] {
  const first = new Date(Date.UTC(year, month, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, month, 1 - mondayOffset));
  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(start);
    value.setUTCDate(start.getUTCDate() + index);
    const key = `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
    return { key, day: value.getUTCDate(), outside: value.getUTCMonth() !== month };
  });
}

export function eventsForDate(events: CalendarEvent[], date: string) {
  return events
    .filter((event) => event.event_date === date)
    .toSorted((left, right) => left.event_time.localeCompare(right.event_time));
}
