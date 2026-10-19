import assert from "node:assert/strict";
import test from "node:test";
import { buildCalendarDays, eventsForDate, shiftMonth } from "./calendar-model.ts";

test("month navigation crosses year boundaries", () => {
  assert.deepEqual(shiftMonth(2026, 0, -1), { year: 2025, month: 11 });
  assert.deepEqual(shiftMonth(2026, 11, 1), { year: 2027, month: 0 });
});

test("calendar exposes 42 selectable ISO dates starting on Monday", () => {
  const days = buildCalendarDays(2026, 9);
  assert.equal(days.length, 42);
  assert.equal(days[0].key, "2026-09-28");
  assert.equal(days.at(-1).key, "2026-11-08");
  assert.equal(days.find((day) => day.key === "2026-10-14")?.outside, false);
});

test("agenda selects only matching events and orders them by time", () => {
  const base = { description: null, project_id: null };
  const events = [
    { ...base, id: "2", title: "Later", event_date: "2026-10-14", event_time: "15:30:00" },
    { ...base, id: "3", title: "Other day", event_date: "2026-10-15", event_time: "08:00:00" },
    { ...base, id: "1", title: "Earlier", event_date: "2026-10-14", event_time: "09:00:00" },
  ];
  assert.deepEqual(eventsForDate(events, "2026-10-14").map((event) => event.id), ["1", "2"]);
  assert.deepEqual(eventsForDate(events, "2026-10-16"), []);
});
