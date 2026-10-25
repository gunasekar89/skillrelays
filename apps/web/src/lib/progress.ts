// What the student has practised, kept in this browser's localStorage: each quiz, coach question,
// explanation and review adds an activity with a 0–1 score. The student home builds today's plan,
// the streak and the weak-spot map from it.
import { loadNotes, type Note } from "./notes";
import { isDue, loadReviews } from "./study";

export type ActivityKind = "quiz" | "coach" | "explain" | "review" | "exam" | "mixed";
export type Activity = { noteId: string; kind: ActivityKind; score: number; sure?: { right: number; wrong: number }; at: string };
export type ExamGoal = { name: string; date: string };

const LOG = "sr.activity";
const GOAL = "sr.goal";
const DAY = 86_400_000;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: progress is kept for this visit only */
  }
}

export const loadActivity = () => read<Activity[]>(LOG, []);

export function logActivity(noteId: string, kind: ActivityKind, score: number, sure?: Activity["sure"]) {
  const log = loadActivity();
  log.push({ noteId, kind, score: Math.max(0, Math.min(1, score)), sure, at: new Date().toISOString() });
  write(LOG, log.slice(-500));
}

export const loadGoal = () => read<ExamGoal>(GOAL, { name: "Semester exams", date: new Date(Date.now() + 21 * DAY).toISOString().slice(0, 10) });
export const saveGoal = (goal: ExamGoal) => write(GOAL, goal);

export function daysLeft(goal: ExamGoal) {
  const today = new Date(new Date().toDateString()).getTime();
  return Math.round((new Date(`${goal.date}T00:00:00`).getTime() - today) / DAY);
}

const dayKey = (iso: string) => new Date(iso).toDateString();

/** Days in a row with at least one study activity, counting today or, if nothing yet today, yesterday. */
export function streak(log = loadActivity()) {
  const days = new Set(log.map((a) => dayKey(a.at)));
  let n = 0;
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export const studiedToday = (log = loadActivity()) => log.some((a) => dayKey(a.at) === new Date().toDateString());

export type Mastery = { note: Note; score: number | null; lastStudied: string | null; sessions: number };

/** Per note: the average of the last five scores (recent work counts, old mistakes fade). */
export function mastery(notes = loadNotes(), log = loadActivity()): Mastery[] {
  return notes
    .filter((n) => n.text.trim())
    .map((note) => {
      const mine = log.filter((a) => a.noteId === note.id);
      const recent = mine.slice(-5);
      return {
        note,
        score: recent.length ? recent.reduce((s, a) => s + a.score, 0) / recent.length : null,
        lastStudied: mine.length ? mine[mine.length - 1].at : null,
        sessions: mine.length,
      };
    });
}

/** "Sure" answers that were wrong, over all quizzes: the gap between feeling ready and being ready. */
export function calibration(log = loadActivity()) {
  const sure = log.reduce((s, a) => ({ right: s.right + (a.sure?.right ?? 0), wrong: s.wrong + (a.sure?.wrong ?? 0) }), { right: 0, wrong: 0 });
  const total = sure.right + sure.wrong;
  return total ? { total, wrong: sure.wrong, share: sure.wrong / total } : null;
}

export type PlanTask = { id: string; title: string; why: string; minutes: number; to: string; done: boolean };

/** Today's plan: due revision first, then the weakest note, a note not studied for a while, and mixed practice. */
export function todaysPlan(notes = loadNotes(), log = loadActivity()): PlanTask[] {
  const today = log.filter((a) => dayKey(a.at) === new Date().toDateString());
  const did = (kind: ActivityKind, noteId?: string) => today.some((a) => a.kind === kind && (!noteId || a.noteId === noteId));
  const tasks: PlanTask[] = [];
  const due = loadReviews().filter(isDue).length;
  if (due || did("review")) {
    tasks.push({ id: "review", title: due ? `Revise ${due} item${due > 1 ? "s" : ""} you missed before` : "Revision done", why: "Spaced reviews make memories last.", minutes: Math.max(3, Math.min(15, due * 1.5)) | 0, to: "/student/notes?tool=review", done: !due });
  }
  const ranked = mastery(notes, log).sort((a, b) => (a.score ?? -1) - (b.score ?? -1));
  const weakest = ranked[0];
  if (weakest) {
    const fresh = weakest.score === null;
    tasks.push({
      id: "coach",
      title: `${fresh ? "Start" : "Practise"} "${weakest.note.title}" with the Study coach`,
      why: fresh ? "You haven't tested yourself on this note yet." : `Current evidence suggests more practice here (${Math.round((weakest.score ?? 0) * 100)}% recently).`,
      minutes: 10,
      to: `/student/notes?note=${encodeURIComponent(weakest.note.id)}&tool=coach`,
      done: did("coach", weakest.note.id),
    });
  }
  const twoDaysAgo = new Date(Date.now() - 2 * DAY).toISOString();
  const stale = ranked
    .filter((m) => m !== weakest && m.lastStudied && m.lastStudied < twoDaysAgo)
    .sort((a, b) => (a.lastStudied ?? "").localeCompare(b.lastStudied ?? ""))[0];
  const explainNote = stale ?? (ranked.length > 1 ? ranked[1] : weakest);
  if (explainNote) {
    tasks.push({
      id: "explain",
      title: `Explain "${explainNote.note.title}" out loud`,
      why: stale ? "You haven't looked at it for a while." : "Explaining in your own words shows what you really know.",
      minutes: 5,
      to: `/student/notes?note=${encodeURIComponent(explainNote.note.id)}&tool=explain`,
      done: did("explain", explainNote.note.id),
    });
  }
  if (ranked.length >= 2) {
    tasks.push({ id: "mixed", title: "Mixed practice across your notes", why: "Mixing topics helps you tell them apart in the exam.", minutes: 8, to: "/student/notes?tool=mixed", done: did("mixed") });
  }
  return tasks;
}

/** Days with practice in the last 7: rewards a steady habit without punishing one missed day like a streak does. */
export function practiceDays(log = loadActivity()) {
  const since = Date.now() - 7 * DAY;
  return new Set(log.filter((a) => new Date(a.at).getTime() >= since).map((a) => dayKey(a.at))).size;
}

/** Plain words for a mastery score: current evidence, never a label for the student. */
export function masteryWord(score: number | null) {
  if (score === null) return "Not practised yet";
  if (score >= 0.8) return "Secure";
  if (score >= 0.5) return "Getting there";
  return "Needs more practice";
}

export type Badge = { id: string; title: string; detail: string; earned: boolean; progress: string };

/** Badges for learning habits the research rewards (fixing mistakes, explaining, testing without help), not time spent. */
export function badges(log = loadActivity()): Badge[] {
  const count = (kind: ActivityKind, min = 0) => log.filter((a) => a.kind === kind && a.score >= min).length;
  const fixed = count("review", 1);
  const explained = count("explain", 0.5);
  const coached = log.filter((a) => a.kind === "coach" && a.score >= 0.8).length;
  const exams = count("exam", 0.8);
  const days = new Set(log.map((a) => dayKey(a.at))).size;
  return [
    { id: "fixer", title: "Mistake fixer", detail: "Remember 5 questions you once got wrong", earned: fixed >= 5, progress: `${Math.min(fixed, 5)}/5` },
    { id: "explainer", title: "Explainer", detail: "Explain 3 topics in your own words (50%+)", earned: explained >= 3, progress: `${Math.min(explained, 3)}/3` },
    { id: "thinker", title: "Thinks first", detail: "Get 5 coach questions right with at most one hint", earned: coached >= 5, progress: `${Math.min(coached, 5)}/5` },
    { id: "exam", title: "Exam ready", detail: "Score 80%+ in exam mode, with no help", earned: exams >= 1, progress: `${Math.min(exams, 1)}/1` },
    { id: "steady", title: "Steady learner", detail: "Practise on 5 different days", earned: days >= 5, progress: `${Math.min(days, 5)}/5` },
  ];
}

/** A weekly note for parents in plain words, as the report suggests: what was done, what is secure, what needs practice. */
export function parentSummary(name: string, notes = loadNotes(), log = loadActivity()) {
  const since = Date.now() - 7 * DAY;
  const week = log.filter((a) => new Date(a.at).getTime() >= since);
  const m = mastery(notes, log).filter((x) => x.score !== null);
  const secure = m.filter((x) => (x.score ?? 0) >= 0.8).map((x) => x.note.title);
  const practise = m.filter((x) => (x.score ?? 0) < 0.6).map((x) => x.note.title);
  const lines = [
    `This week ${name} practised on ${practiceDays(log)} of 7 days and finished ${week.length} study activit${week.length === 1 ? "y" : "ies"}.`,
    secure.length ? `${name} is secure in ${list(secure)}.` : "",
    practise.length ? `Current practice suggests a little more work on ${list(practise)} would help.` : "",
    week.length ? "You can help by asking them to explain one topic to you in their own words." : `${name} hasn't studied with SkillRelays this week. A short 15-minute session a day helps most.`,
  ];
  return lines.filter(Boolean).join(" ");
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
