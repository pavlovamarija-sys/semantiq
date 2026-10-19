"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCalendarEvent, saveCalendarEvent } from "./calendar-actions";
import { initialCalendarActionState } from "./calendar-state";
import { buildCalendarDays, eventsForDate, shiftMonth, type CalendarEvent } from "./calendar-model";
import styles from "./projects-dashboard.module.css";
import { MK_LOCALE, t } from "@/i18n/ui";

type ProjectOption = { id: string; name: string };

function Arrow({ direction }: { direction: "left" | "right" }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={direction === "left" ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"}/></svg>;
}

function Plus() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>;
}

export function ProjectsCalendar({ initialToday, events, deadlines, projects, loadError }: { initialToday: string; events: CalendarEvent[]; deadlines: { id: string; name: string; deadline_date: string }[]; projects: ProjectOption[]; loadError?: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedDate, setSelectedDate] = useState(initialToday);
  const [view, setView] = useState({ year: Number(initialToday.slice(0, 4)), month: Number(initialToday.slice(5, 7)) - 1 });
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [saveState, saveAction, saving] = useActionState(saveCalendarEvent, initialCalendarActionState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteCalendarEvent, initialCalendarActionState);
  const days = useMemo(() => buildCalendarDays(view.year, view.month), [view]);
  const deadlineEvents = useMemo(() => deadlines.map((deadline) => ({ id: `deadline-${deadline.id}`, title: `${t.deadline}: ${deadline.name}`, event_date: deadline.deadline_date, event_time: "00:00:00", description: t.projectDeadline, project_id: deadline.id, deadline: true })), [deadlines]);
  const allEvents = useMemo(() => [...events, ...deadlineEvents], [events, deadlineEvents]);
  const selectedEvents = useMemo(() => eventsForDate(allEvents, selectedDate), [allEvents, selectedDate]);
  const datesWithEvents = useMemo(() => new Set(allEvents.map((event) => event.event_date)), [allEvents]);
  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const monthTitle = new Intl.DateTimeFormat(MK_LOCALE, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(view.year, view.month, 1)));
  const selectedLabel = new Intl.DateTimeFormat(MK_LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${selectedDate}T00:00:00Z`));

  useEffect(() => {
    if (saveState.status === "success" || deleteState.status === "success") {
      dialogRef.current?.close();
      router.refresh();
    }
  }, [saveState, deleteState, router]);

  function changeMonth(amount: number) { setView((current) => shiftMonth(current.year, current.month, amount)); }
  function selectDate(key: string) {
    setSelectedDate(key);
    setView({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) - 1 });
  }
  function showEditor(event: CalendarEvent | null) {
    setEditing(event);
    dialogRef.current?.showModal();
  }
  function goToday() {
    setSelectedDate(initialToday);
    setView({ year: Number(initialToday.slice(0, 4)), month: Number(initialToday.slice(5, 7)) - 1 });
  }

  return <>
    <section className={styles.calendarCard} aria-label={`${t.calendar}: ${monthTitle}`}>
      <div className={styles.calendarMain}>
        <div className={styles.calendarHeader}><h2>{monthTitle}</h2><div className={styles.calendarActions}>
          <button type="button" onClick={() => changeMonth(-1)} aria-label={t.previousMonth}><Arrow direction="left"/></button>
          <button type="button" onClick={() => changeMonth(1)} aria-label={t.nextMonth}><Arrow direction="right"/></button>
          <button type="button" className={styles.todayButton} onClick={goToday}>{t.today}</button>
        </div></div>
        <div className={styles.weekdays}>{["Пон", "Вто", "Сре", "Чет", "Пет", "Саб", "Нед"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className={styles.calendarGrid}>{days.map((day) => <div key={day.key} className={`${day.outside ? styles.outside : ""} ${day.key === initialToday ? styles.today : ""} ${day.key === selectedDate ? styles.selected : ""}`}>
          <button type="button" onClick={() => selectDate(day.key)} aria-label={`Избери ${day.key}`} aria-pressed={day.key === selectedDate}><span>{day.day}</span>{datesWithEvents.has(day.key) && <i aria-label="Има настани"/>}</button>
        </div>)}</div>
      </div>
      <aside className={styles.agenda}>
        <div className={styles.agendaHeading}><div><strong>{selectedDate === initialToday ? t.today : t.agenda}</strong><span>{selectedLabel}</span></div><button type="button" onClick={() => showEditor(null)} aria-label={`${t.addEvent}: ${selectedDate}`}><Plus/></button></div>
        {loadError ? <div className={styles.agendaEmpty}><span role="status">{loadError}</span></div> : selectedEvents.length ? <ul>{selectedEvents.map((event, index) => <li key={event.id}>
          <i data-color={index % 3}/>{event.deadline ? <a href={`/app/projects/${event.project_id}`} className={styles.agendaEventLink}><strong>{event.title}</strong><span>{t.openProject}</span></a> : <button type="button" onClick={() => showEditor(event)}><strong>{event.title}</strong><span>{event.project_id ? projectNames.get(event.project_id) ?? t.project : event.description || t.calendarEvent}</span></button>}<time>{event.deadline ? t.due : event.event_time.slice(0, 5)}</time>
        </li>)}</ul> : <div className={styles.agendaEmpty}><span>{t.noEvents}</span><button type="button" onClick={() => showEditor(null)}>{t.addEvent}</button></div>}
      </aside>
    </section>
    <dialog ref={dialogRef} className={styles.eventDialog} onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current.close(); }}>
      <div className={styles.eventDialogHeader}><div><strong>{editing ? t.editEvent : t.newEvent}</strong><span>{editing ? t.updateSelectedEvent : t.addToCalendar}</span></div><button type="button" onClick={() => dialogRef.current?.close()} aria-label={t.close}>×</button></div>
      <form action={saveAction} key={`${editing?.id ?? "new"}-${selectedDate}`} className={styles.eventForm}>
        <input type="hidden" name="eventId" value={editing?.id ?? ""}/>
        <label>{t.title}<input name="title" required maxLength={200} defaultValue={editing?.title ?? ""}/></label>
        <div><label>{t.date}<input name="eventDate" type="date" required defaultValue={editing?.event_date ?? selectedDate}/></label><label>{t.time}<input name="eventTime" type="time" required defaultValue={editing?.event_time.slice(0, 5) ?? "09:00"}/></label></div>
        <label>{t.project} <span>({t.optional})</span><select name="projectId" defaultValue={editing?.project_id ?? ""}><option value="">{t.noAssociatedProject}</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
        <label>{t.description} <span>({t.optional})</span><textarea name="description" maxLength={2000} rows={3} defaultValue={editing?.description ?? ""}/></label>
        {saveState.status === "error" && <p role="alert">{saveState.message}</p>}
        <div className={styles.eventFormActions}><button type="button" onClick={() => dialogRef.current?.close()}>{t.cancel}</button><button type="submit" disabled={saving}>{saving ? t.saving : editing ? t.saveChanges : t.addEvent}</button></div>
      </form>
      {editing && <form action={deleteAction} className={styles.deleteEventForm}><input type="hidden" name="eventId" value={editing.id}/>{deleteState.status === "error" && <p role="alert">{deleteState.message}</p>}<button type="submit" disabled={deleting}>{deleting ? t.deleting : t.deleteEvent}</button></form>}
    </dialog>
  </>;
}
