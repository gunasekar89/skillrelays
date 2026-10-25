import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Filter, Plus, Search, Settings2, Sparkles, Upload, Wand2, X } from "lucide-react";
import { PageHeader } from "../../components/ui";
import { ALL_CATEGORIES, CategoryChip, COLORS, Countdown, SampleTag, SubjectIcon } from "../../components/calendar/parts";
import { EventDrawer, noteFor } from "../../components/calendar/EventDrawer";
import { EventForm } from "../../components/calendar/EventForm";
import { importIcsFile, mergeSample, Setup } from "../../components/calendar/Setup";
import { StudyPlanner } from "../../components/calendar/StudyPlanner";
import {
  addDays,
  dayItems,
  daysBetween,
  dueReminders,
  exams,
  hasSample,
  holidayOn,
  isSchoolDay,
  loadCalendar,
  matches,
  minutes,
  monthGrid,
  newId,
  nextExam,
  NO_FILTERS,
  nowAndNext,
  nowMinutes,
  parseDate,
  removeSample,
  saveCalendar,
  startOfWeek,
  subjects,
  toggleDone,
  today,
  upcoming,
  workload,
  ymd,
  type CalendarData,
  type CalEvent,
  type Category,
  type Filters,
  type Occurrence,
} from "../../lib/calendar";
import { categoryLabel, EXAM_KINDS, EXAM_STATUS, formatDate, formatTime, t, weekdayShort } from "../../lib/calendarText";

type View = "day" | "week" | "month" | "agenda" | "year" | "exams" | "plan" | "setup";
const VIEWS: View[] = ["day", "week", "month", "agenda", "year", "exams", "plan", "setup"];

const isEmpty = (cal: CalendarData) => !cal.year && !cal.periods.length && !cal.events.length;

export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const [cal, setCal] = useState<CalendarData>(loadCalendar);
  const view = (VIEWS.includes(params.get("view") as View) ? params.get("view") : "day") as View;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? params.get("date")! : today();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [open, setOpen] = useState<Occurrence | null>(null);
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [planFor, setPlanFor] = useState<string | undefined>();
  const [importMsg, setImportMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (next: CalendarData) => {
    setCal(next);
    saveCalendar(next);
  };
  const go = (patch: { view?: View; date?: string }) => {
    const next = new URLSearchParams(params);
    if (patch.view) next.set("view", patch.view);
    if (patch.date) next.set("date", patch.date);
    next.delete("item");
    setParams(next, { replace: true });
  };

  // A reminder or the student home can open one item directly.
  useEffect(() => {
    const id = params.get("item");
    if (!id) return;
    const e = cal.events.find((x) => x.id === id);
    if (e) setOpen(e);
  }, [params, cal.events]);

  useEffect(() => {
    const onChange = () => setCal(loadCalendar());
    window.addEventListener("sr-calendar", onChange);
    return () => window.removeEventListener("sr-calendar", onChange);
  }, []);

  const step = view === "week" ? 7 : view === "month" ? 31 : view === "year" ? 365 : 1;
  const shift = (dir: 1 | -1) => {
    if (view === "month") {
      const d = parseDate(date);
      go({ date: ymd(new Date(d.getFullYear(), d.getMonth() + dir, 1)) });
    } else go({ date: addDays(date, dir * step) });
  };

  // Keyboard: ← → move, T today, D/W/M/A views, N new item. Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (open || editing || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (e.key === "ArrowLeft") shift(-1);
      else if (e.key === "ArrowRight") shift(1);
      else if (k === "t") go({ date: today() });
      else if (k === "d") go({ view: "day" });
      else if (k === "w") go({ view: "week" });
      else if (k === "m") go({ view: "month" });
      else if (k === "a") go({ view: "agenda" });
      else if (k === "n") newItem();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const newItem = (category: Category = "homework", on = date) => setEditing({ id: newId(), title: "", category, date: on, source: "me" });
  const openPlan = (examId?: string) => {
    setPlanFor(examId);
    setOpen(null);
    go({ view: "plan" });
  };

  const importFile = async (f: File) => {
    const res = await importIcsFile(f, cal);
    update(res.cal);
    setImportMsg(res.message);
  };

  const title =
    view === "week"
      ? `${formatDate(startOfWeek(date), { day: "numeric", month: "short" })} – ${formatDate(addDays(startOfWeek(date), 6), { day: "numeric", month: "short", year: "numeric" })}`
      : view === "month"
        ? formatDate(date, { month: "long", year: "numeric" })
        : view === "year"
          ? cal.year
            ? `Academic year ${cal.year.name}`
            : formatDate(date, { year: "numeric" })
          : view === "day"
            ? formatDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
            : "";
  const navigable = ["day", "week", "month", "year"].includes(view);
  const load = workload(cal);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t("calendar")}
        subtitle={cal.year ? `Academic year ${cal.year.name}${cal.year.terms.find((x) => x.start <= today() && today() <= x.end) ? ` · ${cal.year.terms.find((x) => x.start <= today() && today() <= x.end)!.name}` : ""}` : "Your timetable, exams, homework and holidays in one place"}
        actions={
          !isEmpty(cal) && (
            <>
              <button onClick={() => newItem()} className="btn-primary">
                <Plus className="h-4 w-4" /> {t("add")}
              </button>
              <button onClick={() => go({ view: "plan" })} className="btn-ghost">
                <Wand2 className="h-4 w-4" /> {t("plan")}
              </button>
            </>
          )
        }
      />

      <input ref={fileRef} type="file" accept=".ics,text/calendar" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />

      {isEmpty(cal) && view !== "setup" ? (
        <div className="card p-8">
          <CalendarDays className="h-10 w-10 text-brand" />
          <h2 className="mt-3 text-xl font-bold">Set up your school calendar</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Add your class timetable, exams with their chapters, homework and holidays. Then see today's classes at a glance, count down to exams and let the AI plan your revision.</p>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <button onClick={() => go({ view: "setup" })} className="rounded-2xl p-4 text-left ring-1 ring-slate-200 hover:bg-slate-50">
              <Settings2 className="h-5 w-5 text-brand" />
              <div className="mt-2 font-semibold">Enter my timetable</div>
              <div className="text-sm text-slate-500">Copy it from your school diary: periods, terms and holidays.</div>
            </button>
            <button onClick={() => fileRef.current?.click()} className="rounded-2xl p-4 text-left ring-1 ring-slate-200 hover:bg-slate-50">
              <Upload className="h-5 w-5 text-brand" />
              <div className="mt-2 font-semibold">Import my school's calendar</div>
              <div className="text-sm text-slate-500">An .ics file from Google Calendar or Outlook.</div>
            </button>
            <button onClick={() => update(mergeSample(cal))} className="rounded-2xl p-4 text-left ring-1 ring-slate-200 hover:bg-slate-50">
              <Sparkles className="h-5 w-5 text-brand" />
              <div className="mt-2 font-semibold">Try a sample term</div>
              <div className="text-sm text-slate-500">A labelled example for your standard. Remove it in one click.</div>
            </button>
          </div>
          {importMsg && <p className="mt-4 rounded-lg bg-teal-50 p-3 text-sm text-teal-800">{importMsg}</p>}
        </div>
      ) : (
        <>
          {hasSample(cal) && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-slate-100 px-4 py-2.5 text-sm text-slate-700">
              <SampleTag /> You're looking at a sample term so you can try the calendar. Items you add yourself are kept when you remove it.
              <button onClick={() => update(removeSample(cal))} className="ml-auto font-medium text-brand hover:underline">
                Remove sample
              </button>
            </div>
          )}
          {importMsg && (
            <p className="mb-4 flex items-center justify-between rounded-lg bg-teal-50 p-3 text-sm text-teal-800">
              {importMsg}
              <button onClick={() => setImportMsg("")} aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </p>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200" role="tablist" aria-label="Calendar view">
              {VIEWS.map((v) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => go({ view: v })} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${view === v ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                  {t(v)}
                </button>
              ))}
            </div>
            {navigable && (
              <div className="flex items-center gap-1">
                <button onClick={() => shift(-1)} className="rounded-lg p-2 hover:bg-white" aria-label="Previous">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={() => go({ date: today() })} className="btn-ghost px-3 py-1.5">
                  {t("today")}
                </button>
                <button onClick={() => shift(1)} className="rounded-lg p-2 hover:bg-white" aria-label="Next">
                  <ChevronRight className="h-4 w-4" />
                </button>
                <span className="ml-2 font-semibold" aria-live="polite">
                  {title}
                </span>
              </div>
            )}
            {["week", "month", "agenda"].includes(view) && (
              <div className="ml-auto flex items-center gap-2">
                <label className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} placeholder={t("search")} aria-label="Search the calendar" className="w-40 rounded-lg border border-slate-300 py-2 pl-8 pr-2 text-sm focus:border-brand focus:outline-none sm:w-52" />
                </label>
                <button onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} className={`btn-ghost px-3 py-2 ${filters.categories.length || filters.subject ? "ring-brand" : ""}`}>
                  <Filter className="h-4 w-4" />
                  <span className="sr-only">Filters</span>
                </button>
              </div>
            )}
          </div>

          {showFilters && ["week", "month", "agenda"].includes(view) && (
            <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
              {ALL_CATEGORIES.filter((c) => c !== "class").map((c) => {
                const on = filters.categories.includes(c);
                return (
                  <button key={c} aria-pressed={on} onClick={() => setFilters({ ...filters, categories: on ? filters.categories.filter((x) => x !== c) : [...filters.categories, c] })} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ${on ? "bg-navy text-white ring-navy" : "ring-slate-300 hover:bg-slate-50"}`}>
                    <span className={`h-2 w-2 rounded-full ${COLORS[c].dot}`} /> {categoryLabel(c)}
                  </button>
                );
              })}
              <select value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1 text-sm" aria-label="Subject">
                <option value="">All subjects</option>
                {subjects(cal).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              {(filters.categories.length > 0 || filters.subject || filters.query) && (
                <button onClick={() => setFilters(NO_FILTERS)} className="text-sm font-medium text-brand">
                  Clear
                </button>
              )}
            </div>
          )}

          {load.length > 0 && ["day", "week", "month", "agenda", "exams"].includes(view) && (
            <details className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
              <summary className="flex cursor-pointer items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" /> {load.length} busy patch{load.length > 1 ? "es" : ""} coming up
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-6">
                {load.map((i) => (
                  <li key={i.message}>{i.message}</li>
                ))}
              </ul>
              <button onClick={() => openPlan()} className="mt-2 font-medium text-brand hover:underline">
                Plan revision around it
              </button>
            </details>
          )}

          {view === "day" && <DayView cal={cal} date={date} onOpen={setOpen} onChange={update} onAdd={() => newItem("homework", date)} />}
          {view === "week" && <WeekView cal={cal} date={date} filters={filters} onOpen={setOpen} onDay={(d) => go({ view: "day", date: d })} />}
          {view === "month" && <MonthView cal={cal} date={date} filters={filters} onOpen={setOpen} onDay={(d) => go({ view: "day", date: d })} />}
          {view === "agenda" && <AgendaView cal={cal} filters={filters} onOpen={setOpen} />}
          {view === "year" && <YearView cal={cal} date={date} onDay={(d) => go({ view: "day", date: d })} />}
          {view === "exams" && <ExamsView cal={cal} onOpen={setOpen} onAdd={() => newItem("exam", today())} />}
          {view === "plan" && <StudyPlanner key={planFor ?? "all"} cal={cal} onChange={update} focusId={planFor} />}
          {view === "setup" && <Setup cal={cal} onChange={update} />}

          {navigable && <p className="mt-6 hidden text-xs text-slate-400 md:block">Keys: ← → move · T today · D W M A change view · N add</p>}
        </>
      )}

      {view === "setup" && isEmpty(cal) && <Setup cal={cal} onChange={update} />}

      {open && !editing && (
        <EventDrawer
          item={open}
          cal={cal}
          onChange={update}
          onEdit={(e) => setEditing(e)}
          onPlan={() => openPlan(open.id)}
          onClose={() => {
            setOpen(null);
            if (params.get("item")) go({});
          }}
        />
      )}
      {editing && (
        <EventForm
          initial={editing}
          cal={cal}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            update(next);
            const saved = next.events.find((e) => e.id === editing.id);
            setEditing(null);
            setOpen(saved ?? null);
          }}
        />
      )}
    </div>
  );
}

// ---------- Event card ----------

function ItemCard({ item, onOpen, state, compact }: { item: Occurrence; onOpen: (o: Occurrence) => void; state?: "past" | "now" | "next"; compact?: boolean }) {
  const c = COLORS[item.category];
  const muted = item.cancelledClass || item.done || item.exam?.status === "cancelled";
  return (
    <button
      onClick={() => onOpen(item)}
      className={`group w-full rounded-xl border-l-4 text-left ring-1 transition hover:shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${item.isBreak ? "border-l-slate-300 bg-slate-50 ring-slate-100" : `${c.card} ring-slate-200/60`} ${compact ? "px-2 py-1" : "px-3 py-2.5"} ${state === "now" ? "ring-2 ring-brand" : ""} ${state === "past" || muted ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-2">
        {!compact && (
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${item.isBreak ? "bg-slate-200 text-slate-500" : `bg-white ${c.text}`}`}>
            <SubjectIcon subject={item.subject} isBreak={item.isBreak} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className={`truncate font-medium ${compact ? "text-xs" : "text-sm"} ${muted ? "line-through" : ""}`}>{item.title}</div>
          {!compact && (
            <div className="truncate text-xs text-slate-500">
              {[item.start && `${formatTime(item.start)}${item.end ? `–${formatTime(item.end)}` : ""}`, item.room, item.teacher].filter(Boolean).join(" · ") || categoryLabel(item.category)}
            </div>
          )}
        </div>
        {!compact && state === "now" && <span className="chip bg-brand text-white">{t("now")}</span>}
        {!compact && state === "next" && <span className="chip bg-brand-50 text-brand">{t("next")}</span>}
        {!compact && item.cancelledClass && <span className="chip bg-slate-200 text-slate-600">Cancelled</span>}
        {!compact && item.done && <CheckCircle2 className="h-4 w-4 text-teal" />}
        {!compact && item.exam?.status === "rescheduled" && <span className="chip bg-amber-100 text-amber-900">Moved</span>}
        {!compact && !item.isBreak && item.category !== "class" && (
          <span className="hidden sm:inline-flex">
            <CategoryChip category={item.category} />
          </span>
        )}
      </div>
    </button>
  );
}

// ---------- Day ----------

function DayView({ cal, date, onOpen, onChange, onAdd }: { cal: CalendarData; date: string; onOpen: (o: Occurrence) => void; onChange: (c: CalendarData) => void; onAdd: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const items = dayItems(cal, date);
  const isToday = date === ymd(now);
  const at = nowMinutes(now);
  const { current, next } = isToday ? nowAndNext(items, at) : { current: undefined, next: undefined };
  const holiday = holidayOn(cal, date);
  const allDay = items.filter((i) => !i.start);
  const timed = items.filter((i) => i.start);
  const state = (i: Occurrence): "past" | "now" | "next" | undefined => {
    if (i === current) return "now";
    if (i === next) return "next";
    if (date < ymd(now) || (isToday && minutes(i.end ?? i.start!) <= at)) return "past";
    return undefined;
  };
  const exam = nextExam(cal, date);
  const due = upcoming(cal, date, 3).filter((e) => (e.category === "homework" || e.category === "assignment") && e.date >= date);
  const reminders = isToday ? dueReminders(cal, now) : [];
  // AI revision suggestion: the next exam's subject first, then today's subjects, each linked to a real note.
  const suggestSubjects = [...new Set([exam?.subject, ...timed.filter((i) => i.periodId && !i.isBreak).map((i) => i.subject)].filter(Boolean) as string[])];
  const suggestion = suggestSubjects.map((s) => ({ subject: s, note: noteFor({ subject: s }) })).find((x) => x.note);
  const studyToday = items.filter((i) => i.category === "study");

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-lg font-bold">{formatDate(date)}</div>
            <div className="text-sm text-slate-500">{holiday ? `${categoryLabel("holiday")}: ${holiday.title}` : isSchoolDay(cal, date) ? `${timed.filter((i) => i.periodId && !i.isBreak).length} classes` : t("noSchool")}</div>
          </div>
          <button onClick={onAdd} className="btn-ghost px-3 py-1.5">
            <Plus className="h-4 w-4" /> {t("add")}
          </button>
        </div>

        {isToday && (current || next) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {current && (
              <div className="rounded-xl bg-brand p-4 text-white">
                <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{t("now")}</div>
                <div className="mt-1 text-lg font-bold">{current.title}</div>
                <div className="text-sm opacity-90">
                  until {formatTime(current.end)} {current.room && `· ${current.room}`}
                </div>
              </div>
            )}
            {next && (
              <div className="rounded-xl bg-brand-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-brand">{t("next")}</div>
                <div className="mt-1 text-lg font-bold">{next.title}</div>
                <div className="text-sm text-slate-600">
                  {formatTime(next.start)} · in {minutes(next.start!) - at} min {next.room && `· ${next.room}`}
                </div>
              </div>
            )}
          </div>
        )}

        {allDay.length > 0 && (
          <div className="mt-4 space-y-2">
            {allDay.map((i) => (
              <ItemCard key={i.id} item={i} onOpen={onOpen} />
            ))}
          </div>
        )}

        {timed.length ? (
          <ol className="relative mt-4 space-y-2" aria-label="Today's timeline">
            {timed.map((i, idx) => {
              const showNow = isToday && minutes(i.start!) > at && (idx === 0 || minutes(timed[idx - 1].start!) <= at);
              return (
                <li key={i.id}>
                  {showNow && !current && (
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-brand" aria-hidden>
                      <span className="h-2 w-2 rounded-full bg-brand" />
                      <span className="h-px flex-1 bg-brand/40" />
                      {formatTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`)}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <div className="w-16 shrink-0 pt-2.5 text-right text-xs font-medium tabular-nums text-slate-500">{formatTime(i.start)}</div>
                    <div className="min-w-0 flex-1">
                      <ItemCard item={i} onOpen={onOpen} state={state(i)} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          !allDay.length && (
            <div className="mt-6 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
              {t("nothing")}. {cal.periods.length ? "" : "Add your weekly timetable in Setup to see classes here."}
            </div>
          )
        )}
      </div>

      <div className="space-y-5">
        {exam ? (
          <button onClick={() => onOpen(exam)} className="card block w-full bg-gradient-to-br from-rose-50 to-amber-50 p-5 text-left">
            <div className="label">{t("nextExam")}</div>
            <div className="mt-1 font-bold">{exam.title}</div>
            <div className="text-sm text-slate-600">
              {formatDate(exam.date, { weekday: "short", day: "numeric", month: "short" })}
              {exam.start && ` · ${formatTime(exam.start)}`}
              {exam.room && ` · ${exam.room}`}
            </div>
            <div className="mt-3">
              <Countdown event={exam} />
            </div>
            {exam.exam?.syllabus.length ? (
              <div className="mt-3">
                <div className="h-2 rounded-full bg-white">
                  <div className="h-2 rounded-full bg-teal" style={{ width: `${Math.max(3, (100 * (exam.exam.done?.length ?? 0)) / exam.exam.syllabus.length)}%` }} />
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {exam.exam.done?.length ?? 0} of {exam.exam.syllabus.length} chapters studied
                </div>
              </div>
            ) : null}
          </button>
        ) : (
          <div className="card p-5 text-sm text-slate-500">No upcoming exams in your calendar.</div>
        )}

        {suggestion && (
          <div className="card p-5">
            <div className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4 text-brand" /> {t("revise")}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {exam?.subject === suggestion.subject ? `${suggestion.subject} exam is coming up.` : `You have ${suggestion.subject} today.`} Ten minutes testing yourself on "{suggestion.note!.title}" helps it stick.
            </p>
            <Link to={`/student/notes?note=${encodeURIComponent(suggestion.note!.id)}&tool=coach`} className="btn-primary mt-3 w-full">
              Practise with the Study coach
            </Link>
          </div>
        )}

        {studyToday.length > 0 && (
          <div className="card p-5">
            <div className="font-semibold">{t("plan")}</div>
            <ul className="mt-2 space-y-1.5">
              {studyToday.map((s) => (
                <li key={s.id} className="flex items-start gap-2 text-sm">
                  <button onClick={() => onChange(toggleDone(cal, s.id))} aria-pressed={!!s.done} aria-label={s.done ? "Mark as not done" : "Mark as done"}>
                    <CheckCircle2 className={`mt-0.5 h-4 w-4 ${s.done ? "text-teal" : "text-slate-300"}`} />
                  </button>
                  <button onClick={() => onOpen(s)} className={`text-left ${s.done ? "text-slate-400 line-through" : ""}`}>
                    {s.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="card p-5">
          <div className="font-semibold">{t("dueSoon")}</div>
          {due.length ? (
            <ul className="mt-2 space-y-2">
              {due.map((h) => (
                <li key={h.id} className="flex items-start gap-2 text-sm">
                  <button onClick={() => onChange(toggleDone(cal, h.id))} aria-pressed={!!h.done} aria-label={h.done ? "Mark as not handed in" : "Mark as handed in"}>
                    <CheckCircle2 className={`mt-0.5 h-4 w-4 ${h.done ? "text-teal" : "text-slate-300"}`} />
                  </button>
                  <button onClick={() => onOpen(h)} className="min-w-0 text-left">
                    <div className={`font-medium ${h.done ? "text-slate-400 line-through" : ""}`}>{h.title}</div>
                    <div className="text-xs text-slate-500">
                      {h.date === date ? t("today") : formatDate(h.date, { weekday: "short", day: "numeric", month: "short" })}
                      {h.start && ` · ${formatTime(h.start)}`}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-slate-500">Nothing due in the next 3 days.</p>
          )}
        </div>

        {reminders.length > 0 && (
          <div className="card p-5">
            <div className="font-semibold">{t("reminders")}</div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {reminders.map((r) => (
                <li key={r.id}>
                  <div className="font-medium">{r.title}</div>
                  {r.body && <div className="text-xs text-slate-500">{r.body}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Week ----------

const HOUR_PX = 56;
const spanEnd = (x: Occurrence) => (x.end ? minutes(x.end) : minutes(x.start!) + 30);

/** Side-by-side columns for items that overlap in time, like a homework deadline during a class. */
function lanes(items: Occurrence[]) {
  const sorted = [...items].sort((a, b) => minutes(a.start!) - minutes(b.start!));
  const out: { item: Occurrence; lane: number; of: number }[] = [];
  let cluster: { item: Occurrence; lane: number; of: number }[] = [];
  let ends: number[] = [];
  let clusterEnd = -1;
  const close = () => cluster.forEach((c) => (c.of = ends.length));
  for (const item of sorted) {
    const start = minutes(item.start!);
    if (start >= clusterEnd) {
      close();
      cluster = [];
      ends = [];
    }
    let lane = ends.findIndex((e) => e <= start);
    if (lane < 0) lane = ends.push(0) - 1;
    ends[lane] = spanEnd(item);
    clusterEnd = Math.max(clusterEnd, spanEnd(item));
    const placed = { item, lane, of: 1 };
    cluster.push(placed);
    out.push(placed);
  }
  close();
  return out;
}

function WeekView({ cal, date, filters, onOpen, onDay }: { cal: CalendarData; date: string; filters: Filters; onOpen: (o: Occurrence) => void; onDay: (d: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i));
  const filtering = filters.categories.length > 0 || !!filters.subject || !!filters.query;
  const perDay = days.map((d) => dayItems(cal, d).filter((i) => (i.periodId ? !filtering || matches(i, filters) : matches(i, filters))));
  const timed = perDay.flat().filter((i) => i.start);
  const first = Math.min(8, ...timed.map((i) => Math.floor(minutes(i.start!) / 60)));
  const last = Math.max(16, ...timed.map((i) => Math.ceil(minutes(i.end ?? i.start!) / 60) + (i.end ? 0 : 1)));
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const nowTop = ((nowMinutes() - first * 60) / 60) * HOUR_PX;

  return (
    <div className="card overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-slate-100">
          <div />
          {days.map((d, i) => {
            const isToday = d === today();
            const allDay = perDay[i].filter((x) => !x.start);
            return (
              <div key={d} className={`border-l border-slate-100 p-2 ${isSchoolDay(cal, d) ? "" : "bg-slate-50"}`}>
                <button onClick={() => onDay(d)} className="flex items-baseline gap-1.5 rounded px-1 hover:bg-slate-100">
                  <span className="text-xs font-medium uppercase text-slate-500">{weekdayShort(i + 1)}</span>
                  <span className={`grid h-7 w-7 place-items-center rounded-full text-sm font-semibold ${isToday ? "bg-brand text-white" : ""}`}>{parseDate(d).getDate()}</span>
                </button>
                <div className="mt-1 space-y-1">
                  {allDay.map((x) => (
                    <ItemCard key={x.id} item={x} onOpen={onOpen} compact />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="relative grid grid-cols-[56px_repeat(7,minmax(0,1fr))]" style={{ height: hours.length * HOUR_PX }}>
          <div>
            {hours.map((h) => (
              <div key={h} className="pr-2 text-right text-[11px] text-slate-400" style={{ height: HOUR_PX }}>
                {formatTime(`${String(h).padStart(2, "0")}:00`)}
              </div>
            ))}
          </div>
          {days.map((d, i) => (
            <div key={d} className={`relative border-l border-slate-100 ${isSchoolDay(cal, d) ? "" : "bg-slate-50/60"}`}>
              {hours.map((h) => (
                <div key={h} className="border-t border-slate-100" style={{ height: HOUR_PX }} />
              ))}
              {lanes(perDay[i].filter((x) => x.start)).map(({ item: x, lane, of }) => {
                const top = ((minutes(x.start!) - first * 60) / 60) * HOUR_PX;
                const height = Math.max(14, ((spanEnd(x) - minutes(x.start!)) / 60) * HOUR_PX - 2);
                const c = COLORS[x.category];
                return (
                  <button
                    key={x.id}
                    onClick={() => onOpen(x)}
                    title={`${x.title} ${formatTime(x.start)}`}
                    className={`absolute overflow-hidden rounded-md border-l-4 px-1.5 text-left leading-tight ring-1 ring-white hover:z-10 hover:shadow-card focus-visible:ring-2 focus-visible:ring-brand ${height < 22 ? "py-0 text-[10px]" : "py-0.5 text-[11px]"} ${x.isBreak ? "border-l-slate-300 bg-slate-100 text-slate-500" : `${c.card}`} ${x.cancelledClass ? "line-through opacity-50" : ""}`}
                    style={{ top, height, left: `calc(${(100 * lane) / of}% + 2px)`, width: `calc(${100 / of}% - 4px)` }}
                  >
                    <div className="truncate font-semibold">{x.title}</div>
                    {height > 34 && <div className="truncate text-slate-500">{[formatTime(x.start), x.room].filter(Boolean).join(" · ")}</div>}
                  </button>
                );
              })}
              {d === today() && nowTop > 0 && nowTop < hours.length * HOUR_PX && <div className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-rose-500" style={{ top: nowTop }} aria-hidden />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Month ----------

function MonthView({ cal, date, filters, onOpen, onDay }: { cal: CalendarData; date: string; filters: Filters; onOpen: (o: Occurrence) => void; onDay: (d: string) => void }) {
  const grid = monthGrid(date);
  const month = parseDate(date).getMonth();
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-slate-100 text-center text-xs font-medium uppercase text-slate-500">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="py-2">
            {weekdayShort(i + 1)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.map((d) => {
          const items = cal.events.filter((e) => e.date <= d && d <= (e.endDate || e.date) && matches(e, filters));
          const school = isSchoolDay(cal, d);
          const inMonth = parseDate(d).getMonth() === month;
          const shown = items.slice(0, 3);
          return (
            <div key={d} className={`min-h-[76px] border-b border-l border-slate-100 p-1 sm:min-h-[108px] sm:p-1.5 ${inMonth ? "" : "opacity-40"} ${holidayOn(cal, d) ? "bg-emerald-50/60" : school ? "" : "bg-slate-50"}`}>
              <button onClick={() => onDay(d)} aria-label={formatDate(d)} className={`grid h-7 w-7 place-items-center rounded-full text-sm font-medium hover:bg-slate-200 ${d === today() ? "bg-brand text-white hover:bg-brand" : ""}`}>
                {parseDate(d).getDate()}
              </button>
              <div className="mt-1 hidden space-y-1 sm:block">
                {shown.map((e) => (
                  <ItemCard key={e.id} item={e} onOpen={onOpen} compact />
                ))}
                {items.length > shown.length && (
                  <button onClick={() => onDay(d)} className="px-1 text-[11px] font-medium text-slate-500 hover:text-brand">
                    +{items.length - shown.length} more
                  </button>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                {items.slice(0, 4).map((e) => (
                  <span key={e.id} className={`h-1.5 w-1.5 rounded-full ${COLORS[e.category].dot}`} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 p-3 text-xs text-slate-500">
      {ALL_CATEGORIES.map((c) => (
        <span key={c} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${COLORS[c].dot}`} /> {categoryLabel(c)}
        </span>
      ))}
    </div>
  );
}

// ---------- Agenda ----------

function AgendaView({ cal, filters, onOpen }: { cal: CalendarData; filters: Filters; onOpen: (o: Occurrence) => void }) {
  const list = upcoming(cal, today(), 90, filters);
  const dates = [...new Set(list.map((e) => (e.date < today() ? today() : e.date)))];
  if (!list.length) return <div className="card p-8 text-center text-sm text-slate-500">{filters.query || filters.categories.length || filters.subject ? "Nothing matches your search." : "Nothing coming up in the next 90 days."}</div>;
  return (
    <div className="card divide-y divide-slate-100">
      {dates.map((d) => (
        <div key={d} className="grid gap-2 p-4 sm:grid-cols-[160px_minmax(0,1fr)]">
          <div>
            <div className="font-semibold">{d === today() ? t("today") : formatDate(d, { weekday: "long" })}</div>
            <div className="text-xs text-slate-500">
              {formatDate(d, { day: "numeric", month: "long" })} · {daysBetween(today(), d) === 0 ? "" : `in ${daysBetween(today(), d)} days`}
            </div>
          </div>
          <div className="space-y-2">
            {list
              .filter((e) => (e.date < today() ? today() : e.date) === d)
              .map((e) => (
                <ItemCard key={e.id} item={e} onOpen={onOpen} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Academic year ----------

function YearView({ cal, date, onDay }: { cal: CalendarData; date: string; onDay: (d: string) => void }) {
  const start = cal.year ? parseDate(cal.year.start) : new Date(parseDate(date).getFullYear(), 0, 1);
  const months = Array.from({ length: 12 }, (_, i) => ymd(new Date(start.getFullYear(), start.getMonth() + i, 1)));
  const ex = exams(cal);
  return (
    <div className="space-y-5">
      {cal.year && (
        <div className="card p-5">
          <div className="font-semibold">Terms</div>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100">
            {cal.year.terms.map((term, i) => {
              const total = daysBetween(cal.year!.start, cal.year!.end) || 1;
              return (
                <div
                  key={term.name}
                  title={`${term.name}: ${term.start} – ${term.end}`}
                  className={i % 2 ? "bg-teal" : "bg-brand"}
                  style={{ marginLeft: i === 0 ? `${(100 * daysBetween(cal.year!.start, term.start)) / total}%` : `${(100 * Math.max(0, daysBetween(cal.year!.terms[i - 1].end, term.start))) / total}%`, width: `${(100 * daysBetween(term.start, term.end)) / total}%` }}
                />
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
            {cal.year.terms.map((term) => (
              <span key={term.name}>
                <b>{term.name}</b> {formatDate(term.start, { day: "numeric", month: "short" })} – {formatDate(term.end, { day: "numeric", month: "short" })}
              </span>
            ))}
            {!cal.year.terms.length && <span>No terms set. Add them in Setup.</span>}
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((m) => {
          const mon = parseDate(m).getMonth();
          return (
            <div key={m} className="card p-3">
              <div className="mb-2 text-sm font-semibold">{formatDate(m, { month: "long", year: "numeric" })}</div>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
                {Array.from({ length: 7 }, (_, i) => (
                  <div key={i} className="text-slate-400">
                    {weekdayShort(i + 1).slice(0, 2)}
                  </div>
                ))}
                {monthGrid(m).map((d) => {
                  if (parseDate(d).getMonth() !== mon) return <div key={d} />;
                  const hol = holidayOn(cal, d);
                  const exam = ex.find((e) => e.date === d && e.exam?.status !== "cancelled");
                  return (
                    <button
                      key={d}
                      onClick={() => onDay(d)}
                      title={[hol?.title, exam?.title].filter(Boolean).join(" · ") || undefined}
                      className={`aspect-square rounded ${exam ? "bg-rose-500 font-bold text-white" : hol ? "bg-emerald-100 text-emerald-800" : isSchoolDay(cal, d) ? "hover:bg-slate-100" : "text-slate-300"} ${d === today() ? "ring-2 ring-brand" : ""}`}
                    >
                      {parseDate(d).getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-rose-500" /> Exam</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-100" /> Holiday</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded ring-2 ring-brand" /> Today</span>
        <span className="flex items-center gap-1.5 text-slate-300">12</span> No school
      </div>
    </div>
  );
}

// ---------- Exams ----------

function ExamsView({ cal, onOpen, onAdd }: { cal: CalendarData; onOpen: (o: Occurrence) => void; onAdd: () => void }) {
  const all = exams(cal);
  const coming = all.filter((e) => e.date >= today());
  const past = all.filter((e) => e.date < today()).reverse();
  const row = (e: CalEvent): ReactNode => {
    const ex = e.exam!;
    const studied = ex.syllabus.length ? (ex.done?.length ?? 0) / ex.syllabus.length : null;
    return (
      <button key={e.id} onClick={() => onOpen(e)} className="grid w-full gap-3 p-4 text-left hover:bg-slate-50 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-center">
        <div>
          <div className="text-2xl font-bold leading-none">{parseDate(e.date).getDate()}</div>
          <div className="text-xs text-slate-500">{formatDate(e.date, { weekday: "short", month: "short" })}</div>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{e.title}</span>
            <span className="chip bg-slate-100 text-slate-600">{EXAM_KINDS[ex.kind]}</span>
            {ex.status !== "scheduled" && <span className={`chip ${ex.status === "rescheduled" ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-600"}`}>{EXAM_STATUS[ex.status]}</span>}
            {e.sample && <SampleTag />}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {[e.start && `${formatTime(e.start)}–${formatTime(e.end)}`, e.room, ex.totalMarks !== undefined && `${ex.totalMarks} marks`, ex.syllabus.length && `${ex.syllabus.length} chapters`].filter(Boolean).join(" · ")}
          </div>
          {studied !== null && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 w-40 rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-teal" style={{ width: `${Math.max(3, studied * 100)}%` }} />
              </div>
              <span className="text-xs text-slate-500">{Math.round(studied * 100)}% studied</span>
            </div>
          )}
        </div>
        {e.date >= today() && ex.status !== "cancelled" && <Countdown event={e} />}
      </button>
    );
  };
  return (
    <div className="space-y-5">
      <div className="card">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div className="font-semibold">Upcoming exams</div>
          <button onClick={onAdd} className="btn-ghost px-3 py-1.5">
            <Plus className="h-4 w-4" /> Add exam
          </button>
        </div>
        <div className="divide-y divide-slate-100">{coming.length ? coming.map(row) : <p className="p-6 text-center text-sm text-slate-500">No upcoming exams.</p>}</div>
      </div>
      {past.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer p-4 font-semibold">Past exams ({past.length})</summary>
          <div className="divide-y divide-slate-100">{past.map(row)}</div>
        </details>
      )}
    </div>
  );
}
