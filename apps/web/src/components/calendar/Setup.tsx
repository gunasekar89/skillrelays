import { useRef, useState } from "react";
import { AlertTriangle, Bell, Copy, Download, Plus, Trash2, Upload } from "lucide-react";
import {
  hasSample,
  mergeSchool,
  newId,
  parseIcs,
  periodClashes,
  removeSample,
  sampleTerm,
  today,
  toIcs,
  type AcademicYear,
  type CalendarData,
  type Period,
} from "../../lib/calendar";
import { formatDate, formatTime, weekdayShort } from "../../lib/calendarText";
import { loadProfile } from "../../lib/profile";
import { field } from "./parts";

const blankYear = (): AcademicYear => {
  const y = new Date().getMonth() >= 4 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  return { name: `${y}–${String(y + 1).slice(2)}`, start: `${y}-06-01`, end: `${y + 1}-04-30`, terms: [], saturdays: "off", specialWorkingDays: [] };
};

export function download(name: string, text: string, type = "text/calendar") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Read a school .ics file and merge it in; returns a sentence saying what happened. */
export async function importIcsFile(file: File, cal: CalendarData): Promise<{ cal: CalendarData; message: string }> {
  const { events, skipped } = parseIcs(await file.text());
  if (!events.length) return { cal, message: "No calendar entries were found in that file. Ask the school for its .ics calendar file." };
  const merged = mergeSchool(cal, events);
  return {
    cal: merged.cal,
    message: `Imported ${merged.added} new and updated ${merged.updated} school item${merged.added + merged.updated === 1 ? "" : "s"}${skipped ? `; ${skipped} repeating or unreadable entr${skipped === 1 ? "y was" : "ies were"} imported as one date or skipped` : ""}.`,
  };
}

export function Setup({ cal, onChange }: { cal: CalendarData; onChange: (cal: CalendarData) => void }) {
  const year = cal.year ?? blankYear();
  const setYear = (patch: Partial<AcademicYear>) => onChange({ ...cal, year: { ...year, ...patch, sample: false } });
  const [day, setDay] = useState(1);
  const [msg, setMsg] = useState("");
  const [special, setSpecial] = useState(year.specialWorkingDays.join(", "));
  const [holiday, setHoliday] = useState({ title: "", date: today(), endDate: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const clashes = periodClashes(cal.periods);
  const dayPeriods = cal.periods.filter((p) => p.day === day).sort((a, b) => a.start.localeCompare(b.start));
  const r = cal.reminders;

  const setPeriod = (id: string, patch: Partial<Period>) => onChange({ ...cal, periods: cal.periods.map((p) => (p.id === id ? { ...p, ...patch, sample: false } : p)) });
  const addPeriod = () => {
    const last = dayPeriods[dayPeriods.length - 1];
    const start = last?.end ?? "08:30";
    const [h, m] = start.split(":").map(Number);
    const endMin = h * 60 + m + 45;
    const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
    onChange({ ...cal, periods: [...cal.periods, { id: newId("p"), day, start, end, subject: "", kind: "class" }] });
  };
  const copyToWeek = () => {
    if (!window.confirm(`Copy ${weekdayShort(day)}'s periods to every other weekday (Mon–Fri)? Their current periods are replaced.`)) return;
    const others = [1, 2, 3, 4, 5].filter((d) => d !== day);
    const copies = others.flatMap((d) => dayPeriods.map((p) => ({ ...p, id: newId("p"), day: d, sample: false })));
    onChange({ ...cal, periods: [...cal.periods.filter((p) => !others.includes(p.day)), ...copies] });
  };
  const addHoliday = () => {
    if (!holiday.title.trim()) return;
    onChange({ ...cal, events: [...cal.events, { id: newId("hol"), title: holiday.title.trim(), category: "holiday", date: holiday.date, endDate: holiday.endDate > holiday.date ? holiday.endDate : undefined, source: "me" }] });
    setHoliday({ title: "", date: holiday.date, endDate: "" });
  };
  const holidays = cal.events.filter((e) => e.category === "holiday").sort((a, b) => a.date.localeCompare(b.date));
  const permission = typeof Notification === "undefined" ? "unsupported" : Notification.permission;

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="font-semibold">Your school's calendar</div>
        <p className="mt-1 text-sm text-slate-500">
          If your school shares its calendar (Google Calendar or Outlook can export an <b>.ics</b> file), import it. School items stay read-only, and importing an updated file moves any exams that changed.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const res = await importIcsFile(f, cal);
              onChange(res.cal);
              setMsg(res.message);
              e.target.value = "";
            }}
          />
          <button onClick={() => fileRef.current?.click()} className="btn-primary">
            <Upload className="h-4 w-4" /> Import school calendar (.ics)
          </button>
          <button onClick={() => download("my-school-calendar.ics", toIcs(cal))} className="btn-ghost" disabled={!cal.events.length && !cal.periods.length}>
            <Download className="h-4 w-4" /> Export to my phone's calendar
          </button>
          {hasSample(cal) ? (
            <button onClick={() => onChange(removeSample(cal))} className="btn-ghost">
              <Trash2 className="h-4 w-4" /> Remove sample term
            </button>
          ) : (
            <button onClick={() => onChange(mergeSample(cal))} className="btn-ghost">
              Load a sample term
            </button>
          )}
        </div>
        {msg && <p className="mt-3 rounded-lg bg-teal-50 p-3 text-sm text-teal-800" role="status">{msg}</p>}
        <p className="mt-3 text-xs text-slate-500">The export is a private file for your own device. Nothing is published as a public link.</p>
      </section>

      <section className="card p-5">
        <div className="font-semibold">Academic year and terms</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <label className="text-sm font-medium">
            Year
            <input value={year.name} onChange={(e) => setYear({ name: e.target.value })} className={field} />
          </label>
          <label className="text-sm font-medium">
            Starts
            <input type="date" value={year.start} onChange={(e) => setYear({ start: e.target.value })} className={field} />
          </label>
          <label className="text-sm font-medium">
            Ends
            <input type="date" value={year.end} min={year.start} onChange={(e) => setYear({ end: e.target.value })} className={field} />
          </label>
          <label className="text-sm font-medium">
            Saturdays
            <select value={year.saturdays} onChange={(e) => setYear({ saturdays: e.target.value as AcademicYear["saturdays"] })} className={field}>
              <option value="off">Holiday</option>
              <option value="working">Working day</option>
              <option value="alternate">2nd and 4th off</option>
            </select>
          </label>
        </div>
        {year.end < year.start && <p className="mt-2 text-sm text-red-600">The year ends before it starts.</p>}
        <div className="mt-4 text-sm font-medium">Terms</div>
        <ul className="mt-2 space-y-2">
          {year.terms.map((term, i) => (
            <li key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <input value={term.name} onChange={(e) => setYear({ terms: year.terms.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className={field} aria-label="Term name" />
              <input type="date" value={term.start} onChange={(e) => setYear({ terms: year.terms.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} className={`${field} hidden sm:block`} aria-label="Term starts" />
              <input type="date" value={term.end} onChange={(e) => setYear({ terms: year.terms.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} className={`${field} hidden sm:block`} aria-label="Term ends" />
              <button onClick={() => setYear({ terms: year.terms.filter((_, j) => j !== i) })} className="mt-1 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label={`Remove ${term.name}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <button onClick={() => setYear({ terms: [...year.terms, { name: `Term ${year.terms.length + 1}`, start: year.terms.at(-1)?.end ?? year.start, end: year.end }] })} className="btn-ghost mt-2 px-3 py-1.5">
          <Plus className="h-4 w-4" /> Add term
        </button>
        <p className="mt-2 text-xs text-slate-500">With terms set, classes only show inside a term. Leave terms empty to show classes all year.</p>
        <label className="mt-4 block text-sm font-medium">
          Special working days (e.g. a working Saturday), comma separated
          <input
            value={special}
            onChange={(e) => setSpecial(e.target.value)}
            onBlur={() => setYear({ specialWorkingDays: special.split(",").map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)) })}
            placeholder="2026-11-21"
            className={field}
          />
        </label>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold">Weekly class timetable</div>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Day of the week">
            {[1, 2, 3, 4, 5, 6].map((d) => (
              <button key={d} role="tab" aria-selected={day === d} onClick={() => setDay(d)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${day === d ? "bg-brand text-white" : "hover:bg-slate-100"}`}>
                {weekdayShort(d)}
                <span className="ml-1 text-xs opacity-70">{cal.periods.filter((p) => p.day === d).length || ""}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="pb-2 font-medium">Start</th>
                <th className="pb-2 font-medium">End</th>
                <th className="pb-2 font-medium">Subject or break</th>
                <th className="pb-2 font-medium">Teacher</th>
                <th className="pb-2 font-medium">Room</th>
                <th className="pb-2 font-medium">Break</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {dayPeriods.map((p) => (
                <tr key={p.id} className={p.kind === "break" ? "bg-slate-50" : ""}>
                  <td className="pr-2"><input type="time" value={p.start} onChange={(e) => setPeriod(p.id, { start: e.target.value })} className={field} aria-label="Start" /></td>
                  <td className="pr-2"><input type="time" value={p.end} onChange={(e) => setPeriod(p.id, { end: e.target.value })} className={field} aria-label="End" /></td>
                  <td className="pr-2"><input list="cal-subjects-setup" value={p.subject} onChange={(e) => setPeriod(p.id, { subject: e.target.value })} className={field} aria-label="Subject" /></td>
                  <td className="pr-2"><input value={p.teacher ?? ""} onChange={(e) => setPeriod(p.id, { teacher: e.target.value || undefined })} className={field} aria-label="Teacher" /></td>
                  <td className="pr-2"><input value={p.room ?? ""} onChange={(e) => setPeriod(p.id, { room: e.target.value || undefined })} className={field} aria-label="Room" /></td>
                  <td className="pr-2 text-center"><input type="checkbox" checked={p.kind === "break"} onChange={(e) => setPeriod(p.id, { kind: e.target.checked ? "break" : "class" })} aria-label="This is a break" /></td>
                  <td>
                    <button onClick={() => onChange({ ...cal, periods: cal.periods.filter((x) => x.id !== p.id) })} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label="Remove period">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="cal-subjects-setup">
            {["Mathematics", "English", "Science", "Social Science", "Tamil", "Hindi", "EVS", "Computer Science", "Art", "Physical Education", "Morning break", "Lunch"].map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        {!dayPeriods.length && <p className="mt-2 text-sm text-slate-500">No periods on {weekdayShort(day)} yet.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={addPeriod} className="btn-ghost px-3 py-1.5">
            <Plus className="h-4 w-4" /> Add period
          </button>
          {dayPeriods.length > 0 && (
            <button onClick={copyToWeek} className="btn-ghost px-3 py-1.5">
              <Copy className="h-4 w-4" /> Copy to Mon–Fri
            </button>
          )}
        </div>
        {clashes.length > 0 && (
          <ul className="mt-3 space-y-1">
            {clashes.slice(0, 5).map(([a, b]) => (
              <li key={a.id + b.id} className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {weekdayShort(a.day)}: {a.subject || "a period"} ({formatTime(a.start)}) overlaps {b.subject || "another period"} ({formatTime(b.start)}).
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <div className="font-semibold">Holidays</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <input value={holiday.title} onChange={(e) => setHoliday({ ...holiday, title: e.target.value })} placeholder="e.g. Pongal holidays" className={field} aria-label="Holiday name" />
          <input type="date" value={holiday.date} onChange={(e) => setHoliday({ ...holiday, date: e.target.value })} className={field} aria-label="First day" />
          <input type="date" value={holiday.endDate} min={holiday.date} onChange={(e) => setHoliday({ ...holiday, endDate: e.target.value })} className={field} aria-label="Last day (optional)" />
          <button onClick={addHoliday} className="btn-primary mt-1" disabled={!holiday.title.trim()}>
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {holidays.map((h) => (
            <li key={h.id} className="flex items-center justify-between py-2">
              <span>
                <span className="font-medium">{h.title}</span>{" "}
                <span className="text-slate-500">
                  {formatDate(h.date, { day: "numeric", month: "short" })}
                  {h.endDate ? ` – ${formatDate(h.endDate, { day: "numeric", month: "short" })}` : ""}
                </span>
              </span>
              {h.source !== "school" && (
                <button onClick={() => onChange({ ...cal, events: cal.events.filter((e) => e.id !== h.id) })} className="rounded p-1 text-slate-400 hover:text-red-600" aria-label={`Remove ${h.title}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5">
        <div className="flex items-center gap-2 font-semibold">
          <Bell className="h-4 w-4 text-brand" /> Reminders
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={r.enabled} onChange={(e) => onChange({ ...cal, reminders: { ...r, enabled: e.target.checked } })} /> Remind me
          </label>
          <span className="flex items-center gap-2">
            Exams:
            {[14, 7, 3, 1].map((n) => (
              <label key={n} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={r.examDays.includes(n)}
                  onChange={(e) => onChange({ ...cal, reminders: { ...r, examDays: e.target.checked ? [...r.examDays, n] : r.examDays.filter((x) => x !== n) } })}
                />
                {n}d
              </label>
            ))}
            before
          </span>
          <label className="flex items-center gap-2">
            Homework
            <select value={r.homeworkHours} onChange={(e) => onChange({ ...cal, reminders: { ...r, homeworkHours: Number(e.target.value) } })} className="rounded-lg border border-slate-300 px-2 py-1">
              {[6, 12, 24, 48].map((h) => (
                <option key={h} value={h}>
                  {h} hours
                </option>
              ))}
            </select>
            before
          </label>
          <label className="flex items-center gap-2">
            Quiet hours
            <input type="time" value={r.quietStart} onChange={(e) => onChange({ ...cal, reminders: { ...r, quietStart: e.target.value } })} className="rounded-lg border border-slate-300 px-2 py-1" aria-label="Quiet from" />
            to
            <input type="time" value={r.quietEnd} onChange={(e) => onChange({ ...cal, reminders: { ...r, quietEnd: e.target.value } })} className="rounded-lg border border-slate-300 px-2 py-1" aria-label="Quiet until" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          {permission === "default" && (
            <button onClick={() => Notification.requestPermission().then(() => onChange({ ...cal }))} className="btn-ghost px-3 py-1.5">
              Also show phone or desktop notifications
            </button>
          )}
          <span className="text-slate-500">
            {permission === "granted"
              ? "Browser notifications are on while SkillRelays is open (not during quiet hours)."
              : permission === "denied"
                ? "Browser notifications are blocked in this browser's settings; reminders show inside the app."
                : permission === "unsupported"
                  ? "This browser can't show notifications; reminders show inside the app."
                  : "Reminders show inside the app."}
          </span>
        </div>
        {cal.delivered.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-slate-600">Delivery log ({cal.delivered.length})</summary>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {[...cal.delivered].reverse().map((d) => (
                <li key={d.id} className="flex justify-between gap-3 text-xs text-slate-600">
                  <span>{d.title}</span>
                  <span className="shrink-0">
                    {new Date(d.at).toLocaleString()} · {d.via}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}

/** Add the sample term without touching anything the student already entered. */
export function mergeSample(cal: CalendarData): CalendarData {
  const s = sampleTerm(loadProfile().standard);
  const clean = removeSample(cal);
  return { ...clean, year: clean.year ?? s.year, periods: clean.periods.length ? clean.periods : s.periods, events: [...clean.events, ...s.events] };
}
