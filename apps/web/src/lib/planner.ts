// The AI study planner, client side: gathers the real inputs (upcoming exams and their chapters from the
// calendar, the student's own practice results, holidays) and asks the API for a day-by-day plan. Nothing is
// added to the calendar until the student accepts the plan.
import { addDays, exams, holidayOn, newId, today, type CalEvent, type CalendarData } from "./calendar";
import { loadNotes } from "./notes";
import { bandOf, loadProfile, type Band } from "./profile";
import { loadActivity, mastery } from "./progress";

export type PlanSession = { date: string; exam_id: string; subject: string; chapter: string; kind: "learn" | "practise" | "revise" | "mock"; minutes: number; why: string };
export type Plan = { sessions: PlanSession[]; warnings: string[]; summary: string; session_minutes: number; break_minutes: number; unplanned: number; provider: string; model?: string | null };
export type Evidence = { subject: string; score: number | null; sessions: number };

/** Daily study time to start from, by stage. The student can change it. */
export const DEFAULT_MINUTES: Record<Band, [number, number]> = { "1-3": [20, 30], "4-7": [45, 60], "8-10": [90, 150], college: [120, 180] };

/** Exams the planner can plan for: upcoming, not cancelled, in the next six weeks. */
export const plannableExams = (cal: CalendarData, from = today()) =>
  exams(cal).filter((e) => e.date > from && e.date <= addDays(from, 42) && e.exam?.status !== "cancelled" && e.exam?.status !== "completed");

/** Practice results per subject from quizzes, coach and explain-it-back: only subjects with real results are sent. */
export function evidence(): Evidence[] {
  const bySubject = new Map<string, { total: number; n: number; sessions: number }>();
  for (const m of mastery(loadNotes(), loadActivity())) {
    if (!m.note.subject || m.score === null) continue;
    const cur = bySubject.get(m.note.subject) ?? { total: 0, n: 0, sessions: 0 };
    bySubject.set(m.note.subject, { total: cur.total + m.score, n: cur.n + 1, sessions: cur.sessions + m.sessions });
  }
  return [...bySubject].map(([subject, v]) => ({ subject, score: v.total / v.n, sessions: v.sessions }));
}

export async function requestPlan(cal: CalendarData, chosen: CalEvent[], weekdayMinutes: number, weekendMinutes: number): Promise<Plan> {
  const from = today();
  const last = chosen.reduce((d, e) => (e.date > d ? e.date : d), from);
  const free: string[] = [];
  for (let d = from; d < last; d = addDays(d, 1)) if (holidayOn(cal, d)) free.push(d);
  const profile = loadProfile();
  const body = {
    today: from,
    exams: chosen.map((e) => ({ id: e.id, title: e.title, subject: e.subject ?? "", date: e.date, chapters: (e.exam?.syllabus ?? []).map((c) => ({ name: c, done: e.exam?.done?.includes(c) ?? false })) })),
    weekday_minutes: weekdayMinutes,
    weekend_minutes: weekendMinutes,
    free_dates: free,
    evidence: evidence(),
    band: bandOf(profile.standard),
    language: profile.language,
  };
  let r: Response;
  try {
    r = await fetch("/api/calendar/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("The study planner needs the SkillRelays API running. Start it and try again.");
  }
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.detail?.[0]?.msg ?? "The planner couldn't make a plan. Check the exam dates and try again.");
  return r.json();
}

const KIND_TITLE: Record<PlanSession["kind"], string> = { learn: "Study", practise: "Practise", revise: "Revise", mock: "Practice paper" };

/** Accept a plan: replaces earlier planner sessions that aren't done yet, keeps finished ones. */
export function acceptPlan(cal: CalendarData, plan: Plan): CalendarData {
  const kept = cal.events.filter((e) => e.source !== "planner" || e.done);
  const notes = loadNotes();
  const added: CalEvent[] = plan.sessions.map((s) => ({
    id: newId("study"),
    title: `${KIND_TITLE[s.kind]}: ${s.subject} · ${s.chapter}`,
    category: "study",
    date: s.date,
    subject: s.subject,
    notes: `${s.minutes} min. ${s.why}`,
    source: "planner",
    noteId: notes.find((n) => n.subject === s.subject && (n.chapter?.toLowerCase().includes(s.chapter.toLowerCase()) || n.title.toLowerCase().includes(s.chapter.toLowerCase())))?.id ?? notes.find((n) => n.subject === s.subject)?.id,
  }));
  return { ...cal, events: [...kept, ...added] };
}
