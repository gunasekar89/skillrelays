// The student's academic calendar: the school year and terms, the weekly class timetable, exams with
// their full details, homework, holidays and events, kept in this browser's localStorage. Dates are
// local calendar dates ("YYYY-MM-DD") and times are local clock times ("HH:MM"), never UTC instants,
// so a 9:00 class stays at 9:00 whatever the device's timezone does.
//
// Items come from three sources. "school" items arrive from the school's calendar file (ICS import) and
// are read-only here: a student can't move an official exam. "me" items are the student's own, and
// "planner" items are study sessions the student accepted from the AI study planner.

export type Category = "class" | "exam" | "homework" | "assignment" | "holiday" | "event" | "meeting" | "activity" | "study" | "result";
export type Source = "school" | "me" | "planner";
export type ExamKind = "unit" | "monthly" | "quarterly" | "half-yearly" | "annual" | "practical" | "project" | "other";
export type ExamStatus = "scheduled" | "rescheduled" | "completed" | "cancelled";

export type ExamDetails = {
  kind: ExamKind;
  code?: string;
  reporting?: string; // HH:MM
  totalMarks?: number;
  passMarks?: number;
  paperType?: string;
  syllabus: string[]; // chapters or topics the exam covers
  done?: string[]; // chapters the student has finished studying
  instructions?: string;
  materials?: string; // what may be brought in
  status: ExamStatus;
  previousDate?: string; // set when an exam is moved, so the change can be shown and announced
  resultDate?: string;
};

export type CalEvent = {
  id: string;
  title: string;
  category: Category;
  date: string; // YYYY-MM-DD
  endDate?: string; // last day, for holidays and events that span days
  start?: string; // HH:MM; absent means all day
  end?: string;
  subject?: string;
  room?: string;
  teacher?: string;
  notes?: string;
  source: Source;
  done?: boolean; // homework handed in, study session finished
  exam?: ExamDetails;
  noteId?: string; // a note to study for this item
  sample?: boolean; // part of the labelled sample term, removable in one go
};

export type Period = { id: string; day: number; start: string; end: string; subject: string; teacher?: string; room?: string; kind: "class" | "break"; sample?: boolean };
export type Term = { name: string; start: string; end: string };
export type AcademicYear = { name: string; start: string; end: string; terms: Term[]; saturdays: "off" | "working" | "alternate"; specialWorkingDays: string[]; sample?: boolean };
export type ReminderSettings = { enabled: boolean; examDays: number[]; homeworkHours: number; quietStart: string; quietEnd: string };
export type Delivery = { id: string; at: string; title: string; via: "in-app" | "browser" };

export type CalendarData = {
  year: AcademicYear | null;
  periods: Period[];
  events: CalEvent[];
  cancelled: string[]; // `${periodId}@${date}`: one class that isn't happening
  reminders: ReminderSettings;
  delivered: Delivery[];
};

const KEY = "sr.calendar";
const DAY = 86_400_000;

export const DEFAULT_REMINDERS: ReminderSettings = { enabled: true, examDays: [7, 3, 1], homeworkHours: 24, quietStart: "21:30", quietEnd: "07:00" };

export const emptyCalendar = (): CalendarData => ({ year: null, periods: [], events: [], cancelled: [], reminders: DEFAULT_REMINDERS, delivered: [] });

export function loadCalendar(): CalendarData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...emptyCalendar(), ...(JSON.parse(raw) as Partial<CalendarData>) };
  } catch {
    /* fall through to an empty calendar */
  }
  return emptyCalendar();
}

export function saveCalendar(cal: CalendarData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cal));
  } catch {
    /* storage blocked: changes last for this visit */
  }
  window.dispatchEvent(new Event("sr-calendar"));
}

// ---------- Dates ----------

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** A local date at midnight. Built from parts, because new Date("2026-11-16") is UTC midnight. */
export const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s: string, n: number) => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const today = () => ymd(new Date());
export const daysBetween = (from: string, to: string) => Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / DAY);
export const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
/** Monday = 1 … Sunday = 7. */
export const weekday = (s: string) => parseDate(s).getDay() || 7;
export const startOfWeek = (s: string) => addDays(s, 1 - weekday(s));

export function datesIn(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Every date of the month grid that holds `s`, Monday first, padded to whole weeks. */
export function monthGrid(s: string): string[] {
  const d = parseDate(s);
  const first = ymd(new Date(d.getFullYear(), d.getMonth(), 1));
  const last = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  return datesIn(startOfWeek(first), addDays(startOfWeek(last), 6));
}

// ---------- What happens on a day ----------

export type Occurrence = CalEvent & { periodId?: string; isBreak?: boolean; cancelledClass?: boolean };

const covers = (e: CalEvent, date: string) => e.date <= date && date <= (e.endDate || e.date);

export const holidayOn = (cal: CalendarData, date: string) => cal.events.find((e) => e.category === "holiday" && covers(e, date));

/** Is the school open? Sundays and holidays are off; Saturdays follow the school's rule; special working days override. */
export function isSchoolDay(cal: CalendarData, date: string): boolean {
  const y = cal.year;
  if (y && (date < y.start || date > y.end)) return false;
  if (y?.specialWorkingDays.includes(date)) return true;
  if (holidayOn(cal, date)) return false;
  if (y && y.terms.length && !y.terms.some((t) => t.start <= date && date <= t.end)) return false;
  const wd = weekday(date);
  if (wd === 7) return false;
  if (wd === 6) {
    const rule = y?.saturdays ?? "off";
    if (rule === "off") return false;
    // Alternate Saturdays: the 2nd and 4th Saturday of the month are off, the common Indian school rule.
    if (rule === "alternate") {
      const nth = Math.ceil(parseDate(date).getDate() / 7);
      return nth !== 2 && nth !== 4;
    }
  }
  return true;
}

/** The timetable day a date follows: a special working Saturday runs that Saturday's periods, or Monday's if it has none. */
function timetableDay(cal: CalendarData, date: string) {
  const wd = weekday(date);
  if (cal.year?.specialWorkingDays.includes(date) && !cal.periods.some((p) => p.day === wd)) return 1;
  return wd;
}

/** Everything on one day, in time order: classes from the weekly timetable (unless school is closed), then dated items. */
export function dayItems(cal: CalendarData, date: string): Occurrence[] {
  const items: Occurrence[] = [];
  if (isSchoolDay(cal, date)) {
    const td = timetableDay(cal, date);
    for (const p of cal.periods.filter((p) => p.day === td)) {
      items.push({
        id: `${p.id}@${date}`,
        periodId: p.id,
        isBreak: p.kind === "break",
        title: p.kind === "break" ? p.subject || "Break" : p.subject,
        category: "class",
        date,
        start: p.start,
        end: p.end,
        subject: p.kind === "break" ? undefined : p.subject,
        teacher: p.teacher,
        room: p.room,
        source: "school",
        cancelledClass: cal.cancelled.includes(`${p.id}@${date}`),
        sample: p.sample,
      });
    }
  }
  items.push(...cal.events.filter((e) => covers(e, date)));
  return items.sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "") || order(a) - order(b));
}

const CATEGORY_ORDER: Category[] = ["holiday", "exam", "result", "event", "meeting", "activity", "homework", "assignment", "class", "study"];
const order = (e: CalEvent) => CATEGORY_ORDER.indexOf(e.category);

export type Filters = { categories: Category[]; subject: string; query: string };
export const NO_FILTERS: Filters = { categories: [], subject: "", query: "" };

export function matches(e: CalEvent, f: Filters) {
  if (f.categories.length && !f.categories.includes(e.category)) return false;
  if (f.subject && e.subject !== f.subject) return false;
  const q = f.query.trim().toLowerCase();
  if (q && ![e.title, e.subject, e.room, e.teacher, e.notes, ...(e.exam?.syllabus ?? [])].some((x) => x?.toLowerCase().includes(q))) return false;
  return true;
}

/** Dated items (not the repeating classes) from `from` onwards, soonest first. */
export function upcoming(cal: CalendarData, from = today(), days = 60, f: Filters = NO_FILTERS): CalEvent[] {
  const to = addDays(from, days);
  return cal.events
    .filter((e) => (e.endDate || e.date) >= from && e.date <= to && matches(e, f))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? ""));
}

export const exams = (cal: CalendarData) => cal.events.filter((e) => e.category === "exam").sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? ""));

export const nextExam = (cal: CalendarData, from = today()) => exams(cal).find((e) => e.date >= from && e.exam?.status !== "cancelled" && e.exam?.status !== "completed");

export const subjects = (cal: CalendarData) =>
  [...new Set([...cal.periods.filter((p) => p.kind === "class").map((p) => p.subject), ...cal.events.map((e) => e.subject ?? "")].filter(Boolean))].sort();

/** Where "now" is in a day's list: the item running now and the next one to start. */
export function nowAndNext(items: Occurrence[], at = nowMinutes()) {
  const timed = items.filter((i) => i.start && !i.cancelledClass);
  const current = timed.find((i) => minutes(i.start!) <= at && at < minutes(i.end ?? i.start!) + (i.end ? 0 : 1));
  const next = timed.find((i) => minutes(i.start!) > at);
  return { current, next };
}

export type Countdown = { days: number; hours: number; minutes: number; past: boolean };

export function countdown(e: CalEvent, now = new Date()): Countdown {
  const at = parseDate(e.date);
  const [h, m] = (e.start ?? "09:00").split(":").map(Number);
  at.setHours(h, m);
  const diff = at.getTime() - now.getTime();
  const total = Math.max(0, Math.floor(diff / 60_000));
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60, past: diff <= 0 };
}

// ---------- Checks ----------

export type Issue = { level: "error" | "warning"; message: string };

/** Problems with an item before it is saved. Errors block the save; warnings are for the student to judge. */
export function validate(e: CalEvent, cal: CalendarData): Issue[] {
  const issues: Issue[] = [];
  if (!e.title.trim()) issues.push({ level: "error", message: "Give it a title." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) issues.push({ level: "error", message: "Pick a date." });
  if (e.endDate && e.endDate < e.date) issues.push({ level: "error", message: "The last day is before the first day." });
  if (e.start && e.end && minutes(e.end) <= minutes(e.start)) issues.push({ level: "error", message: "The end time must be after the start time." });
  if (e.exam) {
    const { totalMarks, passMarks, reporting } = e.exam;
    if (totalMarks !== undefined && passMarks !== undefined && passMarks > totalMarks) issues.push({ level: "error", message: "Pass marks can't be more than total marks." });
    if (reporting && e.start && minutes(reporting) > minutes(e.start)) issues.push({ level: "error", message: "Reporting time should be before the exam starts." });
    if (!e.subject) issues.push({ level: "warning", message: "Add the subject so the study planner can plan for it." });
    if (!e.exam.syllabus.length) issues.push({ level: "warning", message: "Add the chapters it covers so the study planner knows what to revise." });
  }
  if (issues.some((i) => i.level === "error")) return issues;
  const hol = holidayOn(cal, e.date);
  if (hol && e.category !== "holiday" && e.source !== "me") issues.push({ level: "warning", message: `${e.date} is a holiday (${hol.title}).` });
  if (e.category === "exam" && e.date >= today()) {
    const sameDay = exams(cal).filter((x) => x.id !== e.id && x.date === e.date && x.exam?.status !== "cancelled");
    const clash = sameDay.find((x) => overlaps(x, e));
    if (clash) issues.push({ level: "warning", message: `It overlaps with ${clash.title} at the same time.` });
    else if (sameDay.length) issues.push({ level: "warning", message: `You already have ${sameDay.map((x) => x.title).join(" and ")} that day.` });
  }
  return issues;
}

const overlaps = (a: CalEvent, b: CalEvent) => {
  if (!a.start || !b.start) return true;
  const span = (e: CalEvent) => [minutes(e.start!), e.end ? minutes(e.end) : minutes(e.start!) + 60];
  const [[as, ae], [bs, be]] = [span(a), span(b)];
  return as < be && bs < ae;
};

/** Timetable periods on the same day that overlap each other. */
export function periodClashes(periods: Period[]): [Period, Period][] {
  const out: [Period, Period][] = [];
  for (let i = 0; i < periods.length; i++)
    for (let j = i + 1; j < periods.length; j++) {
      const [a, b] = [periods[i], periods[j]];
      if (a.day === b.day && minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end)) out.push([a, b]);
    }
  return out;
}

/** Busy patches in the coming weeks: exams bunched together, several deadlines on one day, exams with no study day before them. */
export function workload(cal: CalendarData, from = today(), days = 30): Issue[] {
  const issues: Issue[] = [];
  const list = upcoming(cal, from, days).filter((e) => e.exam?.status !== "cancelled");
  const ex = list.filter((e) => e.category === "exam");
  for (let i = 0; i + 2 < ex.length; i++) {
    if (daysBetween(ex[i].date, ex[i + 2].date) <= 2) {
      issues.push({ level: "warning", message: `Three exams within three days from ${ex[i].date}: ${ex.slice(i, i + 3).map((e) => e.subject || e.title).join(", ")}. Start revising early.` });
      break;
    }
  }
  for (let i = 0; i + 1 < ex.length; i++) {
    if (ex[i].date === ex[i + 1].date) issues.push({ level: "warning", message: `Two exams on ${ex[i].date}: ${ex[i].subject || ex[i].title} and ${ex[i + 1].subject || ex[i + 1].title}.` });
    else if (daysBetween(ex[i].date, ex[i + 1].date) === 1)
      issues.push({ level: "warning", message: `No gap between ${ex[i].subject || ex[i].title} and ${ex[i + 1].subject || ex[i + 1].title}: revise ${ex[i + 1].subject || "the second one"} before the first exam.` });
  }
  const due = new Map<string, CalEvent[]>();
  for (const e of list.filter((e) => (e.category === "homework" || e.category === "assignment") && !e.done)) due.set(e.date, [...(due.get(e.date) ?? []), e]);
  for (const [date, items] of due) if (items.length >= 3) issues.push({ level: "warning", message: `${items.length} homework deadlines on ${date}. Spread the work over the days before.` });
  return issues;
}

// ---------- Changes ----------

export const newId = (prefix = "ev") => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Only the student's own items and accepted study sessions can be changed here; school items are read-only. */
export const canEdit = (e: Pick<CalEvent, "source">) => e.source !== "school";

export function upsertEvent(cal: CalendarData, e: CalEvent): CalendarData {
  const old = cal.events.find((x) => x.id === e.id);
  if (old && !canEdit(old)) throw new Error("School items are read-only. Ask your teacher if something is wrong.");
  // Moving an exam keeps where it was, so the change shows and the reminders announce it.
  if (old?.exam && e.exam && old.date !== e.date && e.exam.status !== "cancelled") e = { ...e, exam: { ...e.exam, status: "rescheduled", previousDate: old.date } };
  return { ...cal, events: old ? cal.events.map((x) => (x.id === e.id ? e : x)) : [...cal.events, e] };
}

export function removeEvent(cal: CalendarData, id: string): CalendarData {
  const old = cal.events.find((x) => x.id === id);
  if (old && !canEdit(old)) throw new Error("School items are read-only.");
  return { ...cal, events: cal.events.filter((x) => x.id !== id) };
}

export const toggleDone = (cal: CalendarData, id: string): CalendarData => ({ ...cal, events: cal.events.map((x) => (x.id === id ? { ...x, done: !x.done } : x)) });

export const toggleCancelled = (cal: CalendarData, occurrenceId: string): CalendarData => ({
  ...cal,
  cancelled: cal.cancelled.includes(occurrenceId) ? cal.cancelled.filter((x) => x !== occurrenceId) : [...cal.cancelled, occurrenceId],
});

/** Mark a chapter of an exam's syllabus as studied (or not). Allowed on school exams: it is the student's progress, not the exam. */
export const toggleChapter = (cal: CalendarData, examId: string, chapter: string): CalendarData => ({
  ...cal,
  events: cal.events.map((x) => {
    if (x.id !== examId || !x.exam) return x;
    const done = x.exam.done ?? [];
    return { ...x, exam: { ...x.exam, done: done.includes(chapter) ? done.filter((c) => c !== chapter) : [...done, chapter] } };
  }),
});

// ---------- Reminders ----------

export type Reminder = { id: string; title: string; body: string; date: string; eventId: string; kind: "exam" | "homework" | "change" | "holiday" | "meeting" | "result" };

/** Reminders due now: exams N days away, homework due soon, moved exams, holidays and meetings tomorrow. Ids are stable so each is shown once. */
export function dueReminders(cal: CalendarData, now = new Date()): Reminder[] {
  const s = cal.reminders;
  if (!s.enabled) return [];
  const t = ymd(now);
  const out: Reminder[] = [];
  for (const e of upcoming(cal, t, 31)) {
    const d = daysBetween(t, e.date);
    const label = e.subject && !e.title.includes(e.subject) ? `${e.title} (${e.subject})` : e.title;
    if (e.category === "exam" && e.exam?.status !== "cancelled" && e.exam?.status !== "completed") {
      const step = s.examDays.filter((n) => d <= n).sort((a, b) => a - b)[0];
      if (step !== undefined && d >= 0) out.push({ id: `exam:${e.id}:${step}:${e.date}`, kind: "exam", eventId: e.id, date: e.date, title: d === 0 ? `${label} is today` : d === 1 ? `${label} is tomorrow` : `${label} in ${d} days`, body: e.start ? `Starts at ${e.start}${e.room ? ` in ${e.room}` : ""}.` : "Check your exam details." });
    }
    if (e.exam?.status === "rescheduled" && e.exam.previousDate) out.push({ id: `change:${e.id}:${e.date}`, kind: "change", eventId: e.id, date: e.date, title: `${label} has moved`, body: `New date ${e.date}${e.start ? ` at ${e.start}` : ""} (was ${e.exam.previousDate}).` });
    if ((e.category === "homework" || e.category === "assignment") && !e.done) {
      const dueAt = parseDate(e.date);
      const [h, m] = (e.start ?? "23:59").split(":").map(Number);
      dueAt.setHours(h, m);
      const hours = (dueAt.getTime() - now.getTime()) / 3_600_000;
      if (hours > 0 && hours <= s.homeworkHours) out.push({ id: `hw:${e.id}:${e.date}`, kind: "homework", eventId: e.id, date: e.date, title: `${label} is due ${d === 0 ? "today" : "tomorrow"}`, body: e.start ? `Hand it in by ${e.start}.` : "Hand it in on time." });
    }
    if (d === 1 && (e.category === "holiday" || e.category === "meeting" || e.category === "result"))
      out.push({ id: `${e.category}:${e.id}:${e.date}`, kind: e.category === "holiday" ? "holiday" : e.category === "meeting" ? "meeting" : "result", eventId: e.id, date: e.date, title: `Tomorrow: ${e.title}`, body: e.start ? `At ${e.start}.` : "" });
  }
  return out;
}

export function inQuietHours(s: ReminderSettings, now = new Date()) {
  const [a, b, n] = [minutes(s.quietStart), minutes(s.quietEnd), nowMinutes(now)];
  return a <= b ? a <= n && n < b : n >= a || n < b;
}

/** Reminders not yet delivered, recorded in the delivery log so the same one never fires twice. */
export function deliver(cal: CalendarData, via: Delivery["via"], now = new Date()): { cal: CalendarData; fresh: Reminder[] } {
  const seen = new Set(cal.delivered.map((d) => d.id));
  const fresh = dueReminders(cal, now).filter((r) => !seen.has(r.id));
  if (!fresh.length) return { cal, fresh };
  const log = [...cal.delivered, ...fresh.map((r) => ({ id: r.id, at: now.toISOString(), title: r.title, via }))].slice(-200);
  return { cal: { ...cal, delivered: log }, fresh };
}

// ---------- Calendar files (ICS) ----------

const unescapeIcs = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
const escapeIcs = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** A DTSTART/DTEND value as a local date and time. UTC ("Z") times are converted to this device's time. */
function icsDate(value: string, params: string): { date: string; time?: string } {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) throw new Error(`Unreadable date ${value}`);
  const [, y, mo, d, h, mi, , z] = m;
  if (!h || params.includes("VALUE=DATE")) return { date: `${y}-${mo}-${d}` };
  if (z) {
    const local = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
    return { date: ymd(local), time: `${pad(local.getHours())}:${pad(local.getMinutes())}` };
  }
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
}

/** Guess what kind of school item a calendar entry is from its words. */
export function guessCategory(text: string): Category {
  const t = text.toLowerCase();
  if (/holiday|vacation|leave|break\b|diwali|pongal|deepavali|christmas|independence day|republic day/.test(t)) return "holiday";
  if (/result|report card/.test(t)) return "result";
  if (/exam|test|assessment|viva|practical|quarterly|half[- ]yearly|annual/.test(t)) return "exam";
  if (/homework|worksheet/.test(t)) return "homework";
  if (/assignment|project|submission/.test(t)) return "assignment";
  if (/ptm|parent|meeting/.test(t)) return "meeting";
  if (/sports|competition|club|annual day|trip|cultural/.test(t)) return "activity";
  return "event";
}

/** Read a school calendar file (.ics, as Google Calendar and Outlook export). Imported items are read-only school items. */
export function parseIcs(text: string): { events: CalEvent[]; skipped: number } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const events: CalEvent[] = [];
  let skipped = 0;
  let cur: Record<string, { value: string; params: string }> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT" && cur) {
      try {
        if (!cur.DTSTART) throw new Error("no start");
        const start = icsDate(cur.DTSTART.value, cur.DTSTART.params);
        const end = cur.DTEND ? icsDate(cur.DTEND.value, cur.DTEND.params) : undefined;
        const title = unescapeIcs(cur.SUMMARY?.value ?? "Untitled");
        const notes = cur.DESCRIPTION ? unescapeIcs(cur.DESCRIPTION.value) : undefined;
        const category = guessCategory(`${cur.CATEGORIES?.value ?? ""} ${title}`);
        // All-day DTEND is exclusive: a one-day holiday ends the next day.
        const endDate = end && !start.time ? addDays(end.date, -1) : end?.date;
        const uid = cur.UID?.value ?? `${start.date}-${title}`;
        events.push({
          id: `ics-${uid}`.slice(0, 120),
          title,
          category,
          date: start.date,
          endDate: endDate && endDate > start.date ? endDate : undefined,
          start: start.time,
          end: end?.time,
          room: cur.LOCATION ? unescapeIcs(cur.LOCATION.value) : undefined,
          notes,
          source: "school",
          exam: category === "exam" ? { kind: "other", syllabus: [], status: "scheduled" } : undefined,
        });
        if (cur.RRULE) skipped++; // repeating entries: only the first date is imported
      } catch {
        skipped++;
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [name, ...params] = line.slice(0, i).split(";");
      cur[name.toUpperCase()] = { value: line.slice(i + 1), params: params.join(";").toUpperCase() };
    }
  }
  return { events, skipped };
}

/** Merge imported school items: same id replaces (so re-importing an updated file moves exams), new ones are added. */
export function mergeSchool(cal: CalendarData, incoming: CalEvent[]): { cal: CalendarData; added: number; updated: number } {
  let added = 0;
  let updated = 0;
  let next = cal;
  for (const e of incoming) {
    const old = next.events.find((x) => x.id === e.id);
    if (!old) {
      added++;
      next = { ...next, events: [...next.events, e] };
      continue;
    }
    updated++;
    const merged: CalEvent = { ...e, done: old.done, exam: e.exam && { ...e.exam, done: old.exam?.done, syllabus: e.exam.syllabus.length ? e.exam.syllabus : old.exam?.syllabus ?? [] } };
    if (old.exam && merged.exam && old.date !== merged.date) merged.exam = { ...merged.exam, status: "rescheduled", previousDate: old.date };
    next = { ...next, events: next.events.map((x) => (x.id === e.id ? merged : x)) };
  }
  return { cal: next, added, updated };
}

const icsStamp = (date: string, time?: string) => date.replace(/-/g, "") + (time ? `T${time.replace(":", "")}00` : "");
const DAYS = ["", "MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/** The calendar as an .ics file for the student's own phone calendar: dated items, plus classes as weekly repeats. */
export function toIcs(cal: CalendarData, name = "My school calendar"): string {
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SkillRelays//Student calendar//EN", `X-WR-CALNAME:${escapeIcs(name)}`];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  for (const e of cal.events) {
    out.push("BEGIN:VEVENT", `UID:${e.id}@skillrelays`, `DTSTAMP:${stamp}`, `SUMMARY:${escapeIcs(e.title)}`);
    if (e.start) {
      out.push(`DTSTART:${icsStamp(e.date, e.start)}`, `DTEND:${icsStamp(e.date, e.end ?? e.start)}`);
    } else {
      out.push(`DTSTART;VALUE=DATE:${icsStamp(e.date)}`, `DTEND;VALUE=DATE:${icsStamp(addDays(e.endDate || e.date, 1))}`);
    }
    if (e.room) out.push(`LOCATION:${escapeIcs(e.room)}`);
    const desc = [e.subject && `Subject: ${e.subject}`, e.exam?.syllabus.length && `Syllabus: ${e.exam.syllabus.join(", ")}`, e.notes].filter(Boolean).join("\n");
    if (desc) out.push(`DESCRIPTION:${escapeIcs(desc)}`);
    out.push(`CATEGORIES:${e.category.toUpperCase()}`, "END:VEVENT");
  }
  const y = cal.year;
  if (y) {
    for (const p of cal.periods.filter((p) => p.kind === "class")) {
      let first = y.start;
      while (weekday(first) !== p.day) first = addDays(first, 1);
      const exdates = datesIn(y.start, y.end).filter((d) => weekday(d) === p.day && !isSchoolDay(cal, d));
      out.push("BEGIN:VEVENT", `UID:${p.id}@skillrelays`, `DTSTAMP:${stamp}`, `SUMMARY:${escapeIcs(p.subject)}`, `DTSTART:${icsStamp(first, p.start)}`, `DTEND:${icsStamp(first, p.end)}`, `RRULE:FREQ=WEEKLY;BYDAY=${DAYS[p.day]};UNTIL=${icsStamp(y.end)}T235959`);
      if (exdates.length) out.push(`EXDATE:${exdates.map((d) => icsStamp(d, p.start)).join(",")}`);
      if (p.room) out.push(`LOCATION:${escapeIcs(p.room)}`);
      out.push("END:VEVENT");
    }
  }
  out.push("END:VCALENDAR");
  return out.join("\r\n");
}

// ---------- Sample term ----------

/**
 * A labelled sample term for demos and first-time students, built around today and sized to the student's standard.
 * Every item carries `sample: true` and shows a "Sample" tag; "Remove sample" takes it all out again.
 */
export function sampleTerm(standard: number | "college", now = today()): CalendarData {
  const young = standard !== "college" && standard <= 3;
  const middle = standard !== "college" && standard >= 4 && standard <= 7;
  const subs = young ? ["English", "Mathematics", "EVS", "Tamil", "Art"] : middle ? ["English", "Mathematics", "Science", "Social Science", "Tamil"] : ["English", "Mathematics", "Science", "Social Science", "Tamil", "Computer Science"];
  const teachers: Record<string, string> = { English: "Ms. Priya", Mathematics: "Mr. Arun", Science: "Ms. Kavitha", EVS: "Ms. Kavitha", "Social Science": "Mr. Rahman", Tamil: "Ms. Meena", "Computer Science": "Mr. Joseph", Art: "Ms. Divya" };
  const monday = startOfWeek(now);
  const year: AcademicYear = {
    name: `${parseDate(now).getFullYear()}–${String(parseDate(now).getFullYear() + 1).slice(2)}`,
    start: addDays(monday, -120),
    end: addDays(monday, 180),
    terms: [
      { name: "Term 2", start: addDays(monday, -40), end: addDays(monday, 45) },
      { name: "Term 3", start: addDays(monday, 60), end: addDays(monday, 170) },
    ],
    saturdays: "alternate",
    specialWorkingDays: [],
    sample: true,
  };
  const slots = young
    ? [["08:45", "09:25"], ["09:25", "10:05"], ["10:05", "10:20", "Morning break"], ["10:20", "11:00"], ["11:00", "11:40"], ["11:40", "12:20", "Lunch"], ["12:20", "13:00"]]
    : [["08:30", "09:15"], ["09:15", "10:00"], ["10:00", "10:15", "Morning break"], ["10:15", "11:00"], ["11:00", "11:45"], ["11:45", "12:30"], ["12:30", "13:15", "Lunch"], ["13:15", "14:00"], ["14:00", "14:45"]];
  const periods: Period[] = [];
  for (let day = 1; day <= 6; day++) {
    let k = day;
    for (const [i, [start, end, brk]] of (day === 6 ? slots.slice(0, 4) : slots).entries()) {
      if (brk) periods.push({ id: `p-s-${day}-${i}`, day, start, end, subject: brk, kind: "break", sample: true });
      else {
        const subject = subs[k++ % subs.length];
        periods.push({ id: `p-s-${day}-${i}`, day, start, end, subject, teacher: teachers[subject], room: young ? "Class 2A" : `Room ${standard === "college" ? "L2" : `${standard}B`}`, kind: "class", sample: true });
      }
    }
  }
  const ex = (subject: string, offset: number, kind: ExamKind, title: string, syllabus: string[], start = "09:30", end = "12:30"): CalEvent => ({
    id: `ev-s-exam-${subject}-${kind}`.replace(/\s+/g, "-").toLowerCase(),
    title,
    category: "exam",
    date: addDays(monday, offset),
    start,
    end,
    subject,
    room: "Exam Hall A",
    source: "school",
    sample: true,
    exam: { kind, code: `${subject.slice(0, 3).toUpperCase()}-${kind === "unit" ? "UT3" : "HY"}`, reporting: start === "09:30" ? "09:00" : undefined, totalMarks: kind === "unit" ? 25 : 80, passMarks: kind === "unit" ? 9 : 28, paperType: kind === "unit" ? "Written, short answers" : "Written, sections A–D", syllabus, done: [], instructions: "Bring your hall ticket. Write your roll number on every page.", materials: subject === "Mathematics" ? "Pen, pencil, ruler, geometry box" : "Pen, pencil", status: "scheduled", resultDate: addDays(monday, offset + 14) },
  });
  const chapters: Record<string, string[]> = young
    ? { Mathematics: ["Numbers up to 100", "Addition", "Subtraction"], EVS: ["Things around us", "Plants", "Animals"], English: ["Reading: The Little Seed", "Naming words"] }
    : middle
      ? { Mathematics: ["Fractions", "Decimals", "Data handling"], Science: ["Food: where does it come from", "Components of food", "Separation of substances"], English: ["Grammar: tenses", "Letter writing", "Prose: chapter 4"] }
      : { Mathematics: ["Polynomials", "Linear equations", "Coordinate geometry", "Triangles"], Science: ["Life processes", "Chemical reactions", "Light: reflection"], English: ["First Flight ch 1–3", "Letter writing", "Grammar"], "Social Science": ["Nationalism in India", "Resources and development"] };
  const examSubjects = Object.keys(chapters);
  const events: CalEvent[] = [
    ex(examSubjects[0], 3, "unit", `Unit test 3: ${examSubjects[0]}`, chapters[examSubjects[0]], "12:00", "12:45"),
    ...examSubjects.map((s, i) => ex(s, 14 + i * 2, "half-yearly", `Half-yearly exam: ${s}`, chapters[s])),
    { id: "ev-s-hol-1", title: "Deepavali holidays", category: "holiday", date: addDays(monday, 8), endDate: addDays(monday, 9), source: "school", sample: true },
    { id: "ev-s-ptm", title: "Parent-teacher meeting", category: "meeting", date: addDays(monday, 5), start: "10:00", end: "12:00", notes: "Parents meet class teachers to discuss Term 2 progress.", source: "school", sample: true },
    { id: "ev-s-sports", title: "Inter-house sports day", category: "activity", date: addDays(monday, 11), start: "08:30", end: "13:00", source: "school", sample: true },
    { id: "ev-s-hw-1", title: `${subs[1]} worksheet`, category: "homework", subject: subs[1], date: addDays(now, 1), start: "08:30", notes: "Do questions 1–10 on page 42.", source: "school", sample: true },
    { id: "ev-s-hw-2", title: `${subs[0]} reading log`, category: "homework", subject: subs[0], date: addDays(now, 2), notes: "Read one story and write three new words.", source: "school", sample: true },
    { id: "ev-s-proj", title: young ? "Leaf collection chart" : "Science model project", category: "assignment", subject: young ? "EVS" : "Science", date: addDays(monday, 12), notes: "Bring it to class and present it in 2 minutes.", source: "school", sample: true },
    { id: "ev-s-result", title: "Half-yearly results and report cards", category: "result", date: addDays(monday, 14 + examSubjects.length * 2 + 12), source: "school", sample: true },
    { id: "ev-s-term", title: "Term 3 begins", category: "event", date: year.terms[1].start, source: "school", sample: true },
  ];
  return { ...emptyCalendar(), year, periods, events };
}

export function removeSample(cal: CalendarData): CalendarData {
  return { ...cal, year: cal.year?.sample ? null : cal.year, periods: cal.periods.filter((p) => !p.sample), events: cal.events.filter((e) => !e.sample) };
}

export const hasSample = (cal: CalendarData) => !!cal.year?.sample || cal.periods.some((p) => p.sample) || cal.events.some((e) => e.sample);
