import { useState, type FormEvent } from "react";
import { AlertTriangle, X } from "lucide-react";
import { subjects, upsertEvent, validate, type CalendarData, type CalEvent, type Category, type ExamDetails, type ExamKind, type ExamStatus } from "../../lib/calendar";
import { categoryLabel, EXAM_KINDS, EXAM_STATUS } from "../../lib/calendarText";
import { SUBJECTS } from "../../lib/profile";
import { Drawer, field } from "./parts";

const FORM_CATEGORIES: Category[] = ["exam", "homework", "assignment", "study", "holiday", "event", "meeting", "activity", "result"];
const blankExam = (): ExamDetails => ({ kind: "unit", syllabus: [], status: "scheduled" });
const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

/** Add or edit one of the student's own items. Checks run as they type; errors block saving, warnings don't. */
export function EventForm({ initial, cal, onSave, onClose }: { initial: CalEvent; cal: CalendarData; onSave: (cal: CalendarData) => void; onClose: () => void }) {
  const [e, setE] = useState<CalEvent>(initial);
  const [allDay, setAllDay] = useState(!initial.start);
  const [syllabus, setSyllabus] = useState((initial.exam?.syllabus ?? []).join("\n"));
  const isNew = !cal.events.some((x) => x.id === initial.id);

  const draft: CalEvent = {
    ...e,
    start: allDay ? undefined : e.start || "09:00",
    end: allDay ? undefined : e.end || undefined,
    endDate: e.endDate && e.endDate !== e.date ? e.endDate : undefined,
    exam: e.category === "exam" ? { ...(e.exam ?? blankExam()), syllabus: syllabus.split("\n").map((s) => s.trim()).filter(Boolean) } : undefined,
  };
  const issues = validate(draft, cal);
  const blocked = issues.some((i) => i.level === "error");
  const ex = e.exam ?? blankExam();
  const setEx = (patch: Partial<ExamDetails>) => setE({ ...e, exam: { ...ex, ...patch } });
  const subjectList = [...new Set([...subjects(cal), ...SUBJECTS.filter((s) => s !== "Other")])];

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (blocked) return;
    onSave(upsertEvent(cal, draft));
  };

  return (
    <Drawer title={isNew ? "Add to calendar" : "Edit"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{isNew ? "Add to my calendar" : "Edit"}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close form">
            <X className="h-5 w-5" />
          </button>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">What is it?</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {FORM_CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => setE({ ...e, category: c })} aria-pressed={e.category === c} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${e.category === c ? "bg-brand text-white ring-brand" : "ring-slate-300 hover:bg-slate-50"}`}>
                {categoryLabel(c)}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm font-medium">
          Title
          <input value={e.title} onChange={(x) => setE({ ...e, title: x.target.value })} className={field} placeholder={e.category === "exam" ? "e.g. Unit test 3: Mathematics" : "e.g. Science worksheet"} autoFocus />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">
            {e.category === "homework" || e.category === "assignment" ? "Due date" : "Date"}
            <input type="date" value={e.date} onChange={(x) => setE({ ...e, date: x.target.value })} className={field} />
          </label>
          {(e.category === "holiday" || e.category === "event" || e.category === "activity") && (
            <label className="text-sm font-medium">
              Last day (optional)
              <input type="date" value={e.endDate ?? ""} min={e.date} onChange={(x) => setE({ ...e, endDate: x.target.value || undefined })} className={field} />
            </label>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allDay} onChange={(x) => setAllDay(x.target.checked)} /> All day (no time)
        </label>
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium">
              {e.category === "homework" ? "Hand in by" : "Starts"}
              <input type="time" value={e.start ?? "09:00"} onChange={(x) => setE({ ...e, start: x.target.value })} className={field} />
            </label>
            {e.category !== "homework" && (
              <label className="text-sm font-medium">
                Ends
                <input type="time" value={e.end ?? ""} onChange={(x) => setE({ ...e, end: x.target.value || undefined })} className={field} />
              </label>
            )}
          </div>
        )}

        {e.category !== "holiday" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium">
              Subject
              <input list="cal-subjects" value={e.subject ?? ""} onChange={(x) => setE({ ...e, subject: x.target.value || undefined })} className={field} />
              <datalist id="cal-subjects">
                {subjectList.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label className="text-sm font-medium">
              Room or place
              <input value={e.room ?? ""} onChange={(x) => setE({ ...e, room: x.target.value || undefined })} className={field} />
            </label>
          </div>
        )}

        {e.category === "exam" && (
          <div className="space-y-3 rounded-xl bg-rose-50/50 p-4 ring-1 ring-rose-100">
            <div className="text-sm font-semibold">Exam details</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium">
                Type
                <select value={ex.kind} onChange={(x) => setEx({ kind: x.target.value as ExamKind })} className={field}>
                  {Object.entries(EXAM_KINDS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Status
                <select value={ex.status} onChange={(x) => setEx({ status: x.target.value as ExamStatus })} className={field}>
                  {Object.entries(EXAM_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Subject code
                <input value={ex.code ?? ""} onChange={(x) => setEx({ code: x.target.value || undefined })} className={field} />
              </label>
              <label className="text-sm font-medium">
                Report by
                <input type="time" value={ex.reporting ?? ""} onChange={(x) => setEx({ reporting: x.target.value || undefined })} className={field} />
              </label>
              <label className="text-sm font-medium">
                Total marks
                <input type="number" min={0} value={ex.totalMarks ?? ""} onChange={(x) => setEx({ totalMarks: num(x.target.value) })} className={field} />
              </label>
              <label className="text-sm font-medium">
                Pass marks
                <input type="number" min={0} value={ex.passMarks ?? ""} onChange={(x) => setEx({ passMarks: num(x.target.value) })} className={field} />
              </label>
            </div>
            <label className="block text-sm font-medium">
              Chapters it covers (one per line)
              <textarea value={syllabus} onChange={(x) => setSyllabus(x.target.value)} rows={4} className={field} placeholder={"Fractions\nDecimals"} />
            </label>
            <label className="block text-sm font-medium">
              Paper type
              <input value={ex.paperType ?? ""} onChange={(x) => setEx({ paperType: x.target.value || undefined })} className={field} placeholder="e.g. Written, sections A–D" />
            </label>
            <label className="block text-sm font-medium">
              Instructions
              <textarea value={ex.instructions ?? ""} onChange={(x) => setEx({ instructions: x.target.value || undefined })} rows={2} className={field} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium">
                You may bring
                <input value={ex.materials ?? ""} onChange={(x) => setEx({ materials: x.target.value || undefined })} className={field} />
              </label>
              <label className="text-sm font-medium">
                Results on
                <input type="date" value={ex.resultDate ?? ""} onChange={(x) => setEx({ resultDate: x.target.value || undefined })} className={field} />
              </label>
            </div>
          </div>
        )}

        <label className="block text-sm font-medium">
          Notes
          <textarea value={e.notes ?? ""} onChange={(x) => setE({ ...e, notes: x.target.value || undefined })} rows={2} className={field} />
        </label>

        {issues.length > 0 && (
          <ul className="space-y-1" aria-live="polite">
            {issues.map((i) => (
              <li key={i.message} className={`flex items-start gap-2 rounded-lg p-2 text-sm ${i.level === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-900"}`}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {i.message}
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <button className="btn-primary" disabled={blocked}>
            Save
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </Drawer>
  );
}
