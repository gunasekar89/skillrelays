import { Link } from "react-router-dom";
import { AlertTriangle, Ban, CheckCircle2, Circle, Clock, MapPin, Pencil, Trash2, User, Wand2, X } from "lucide-react";
import { canEdit, removeEvent, toggleCancelled, toggleChapter, toggleDone, type CalendarData, type CalEvent, type Occurrence } from "../../lib/calendar";
import { EXAM_KINDS, EXAM_STATUS, formatDate, formatTime, t } from "../../lib/calendarText";
import { loadNotes } from "../../lib/notes";
import { CategoryChip, COLORS, Countdown, Drawer, SampleTag, SubjectIcon } from "./parts";

/** The note to study for an item: the one linked to it, else one for the same subject. */
export function noteFor(e: Pick<CalEvent, "noteId" | "subject">) {
  const notes = loadNotes();
  return notes.find((n) => n.id === e.noteId) ?? (e.subject ? notes.find((n) => n.subject === e.subject) : undefined);
}

export function EventDrawer({
  item,
  cal,
  onChange,
  onEdit,
  onPlan,
  onClose,
}: {
  item: Occurrence;
  cal: CalendarData;
  onChange: (cal: CalendarData) => void;
  onEdit: (e: CalEvent) => void;
  onPlan: () => void;
  onClose: () => void;
}) {
  // Re-read the item from the calendar so ticks show straight away.
  const live: Occurrence = cal.events.find((e) => e.id === item.id) ?? { ...item, cancelledClass: cal.cancelled.includes(item.id) };
  const ex = live.exam;
  const note = noteFor(live);
  const editable = !live.periodId && canEdit(live);
  const time = live.start ? `${formatTime(live.start)}${live.end ? ` – ${formatTime(live.end)}` : ""}` : "All day";
  const dates = live.endDate ? `${formatDate(live.date, { day: "numeric", month: "short" })} – ${formatDate(live.endDate, { day: "numeric", month: "short", year: "numeric" })}` : formatDate(live.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const doneCount = ex ? ex.syllabus.filter((c) => ex.done?.includes(c)).length : 0;

  return (
    <Drawer title={live.title} onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white ${COLORS[live.category].dot}`}>
            <SubjectIcon subject={live.subject} isBreak={live.isBreak} className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold leading-snug">{live.title}</h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <CategoryChip category={live.category} />
              {ex && <span className="chip bg-slate-100 text-slate-700">{EXAM_KINDS[ex.kind]}</span>}
              {ex && ex.status !== "scheduled" && <span className={`chip ${ex.status === "cancelled" ? "bg-slate-200 text-slate-600" : ex.status === "rescheduled" ? "bg-amber-100 text-amber-900" : "bg-teal-50 text-teal-700"}`}>{EXAM_STATUS[ex.status]}</span>}
              {live.cancelledClass && <span className="chip bg-slate-200 text-slate-600">Cancelled</span>}
              {live.sample && <SampleTag />}
              {live.source === "school" && !live.periodId && <span className="chip bg-slate-100 text-slate-500">From school · read-only</span>}
              {live.source === "planner" && <span className="chip bg-indigo-50 text-indigo-700">From your study plan</span>}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close details">
          <X className="h-5 w-5" />
        </button>
      </div>

      {ex?.status === "rescheduled" && ex.previousDate && (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Moved from {formatDate(ex.previousDate, { day: "numeric", month: "long" })} to {formatDate(live.date, { day: "numeric", month: "long" })}.
        </p>
      )}

      {ex && ex.status !== "cancelled" && ex.status !== "completed" && (
        <div className="mt-4 rounded-2xl bg-gradient-to-br from-rose-50 to-amber-50 p-4 ring-1 ring-rose-100">
          <div className="label">Time to go</div>
          <div className="mt-2">
            <Countdown event={live} big />
          </div>
        </div>
      )}

      <dl className="mt-5 space-y-2.5 text-sm">
        <div className="flex gap-3">
          <Clock className="h-4 w-4 shrink-0 text-slate-400" />
          <div>
            <div className="font-medium">{dates}</div>
            <div className="text-slate-600">
              {time}
              {ex?.reporting && <> · report by {formatTime(ex.reporting)}</>}
            </div>
          </div>
        </div>
        {live.room && (
          <div className="flex gap-3">
            <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
            <span>{live.room}</span>
          </div>
        )}
        {live.teacher && (
          <div className="flex gap-3">
            <User className="h-4 w-4 shrink-0 text-slate-400" />
            <span>{live.teacher}</span>
          </div>
        )}
      </dl>

      {ex && (
        <div className="mt-5 grid grid-cols-3 gap-2 text-center text-sm">
          {[
            ["Code", ex.code || "—"],
            ["Total marks", ex.totalMarks ?? "—"],
            ["Pass marks", ex.passMarks ?? "—"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-slate-50 p-2">
              <div className="text-[11px] text-slate-500">{k}</div>
              <div className="font-semibold">{v}</div>
            </div>
          ))}
        </div>
      )}

      {ex && (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">{t("syllabus")}</div>
            {ex.syllabus.length > 0 && (
              <span className="text-xs text-slate-500">
                {doneCount} of {ex.syllabus.length} studied
              </span>
            )}
          </div>
          {ex.syllabus.length ? (
            <ul className="mt-2 space-y-1">
              {ex.syllabus.map((c) => {
                const done = ex.done?.includes(c);
                return (
                  <li key={c}>
                    <button onClick={() => onChange(toggleChapter(cal, live.id, c))} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50" aria-pressed={done}>
                      {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-teal" /> : <Circle className="h-4 w-4 shrink-0 text-slate-300" />}
                      <span className={done ? "text-slate-500 line-through" : ""}>{c}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-slate-500">No chapters added yet.{editable ? " Edit the exam to add them." : " Ask your teacher which chapters it covers."}</p>
          )}
          <p className="mt-1 text-xs text-slate-500">Tick a chapter once you've studied it. The study planner uses this.</p>
        </div>
      )}

      {ex && (ex.paperType || ex.instructions || ex.materials || ex.resultDate) && (
        <div className="mt-5 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
          <div className="font-semibold">{t("instructions")}</div>
          {ex.paperType && <p><span className="text-slate-500">Paper: </span>{ex.paperType}</p>}
          {ex.instructions && <p className="whitespace-pre-line">{ex.instructions}</p>}
          {ex.materials && <p><span className="text-slate-500">You may bring: </span>{ex.materials}</p>}
          {ex.resultDate && <p><span className="text-slate-500">Results: </span>{formatDate(ex.resultDate, { day: "numeric", month: "long" })}</p>}
        </div>
      )}

      {live.notes && <p className="mt-5 whitespace-pre-line rounded-xl bg-slate-50 p-4 text-sm">{live.notes}</p>}

      <div className="mt-6 flex flex-wrap gap-2">
        {(live.category === "homework" || live.category === "assignment" || live.category === "study") && (
          <button onClick={() => onChange(toggleDone(cal, live.id))} className={live.done ? "btn-ghost" : "btn-teal"}>
            <CheckCircle2 className="h-4 w-4" /> {live.done ? "Mark as not done" : live.category === "study" ? "Mark as done" : "Mark as handed in"}
          </button>
        )}
        {ex && ex.status !== "cancelled" && ex.status !== "completed" && (
          <button onClick={onPlan} className="btn-primary">
            <Wand2 className="h-4 w-4" /> Plan my revision
          </button>
        )}
        {note && !live.isBreak && (
          <Link to={`/student/notes?note=${encodeURIComponent(note.id)}&tool=coach`} className="btn-ghost">
            {t("revise")}: {note.title}
          </Link>
        )}
        {live.periodId && !live.isBreak && (
          <button onClick={() => onChange(toggleCancelled(cal, live.id))} className="btn-ghost">
            <Ban className="h-4 w-4" /> {live.cancelledClass ? "Class is on again" : "Class cancelled today"}
          </button>
        )}
        {editable && (
          <>
            <button onClick={() => onEdit(live)} className="btn-ghost">
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Delete "${live.title}"?`)) {
                  onChange(removeEvent(cal, live.id));
                  onClose();
                }
              }}
              className="btn-ghost text-red-600"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </>
        )}
      </div>
    </Drawer>
  );
}
