// Study tools that make the learner think first: the hint-ladder coach, "explain it back", and a spaced
// revision list. Revision lives in this browser's localStorage; the coach and explain-back run on the API.
import type { Note } from "./notes";
import { learnerParams } from "./profile";

export type Verdict = "correct" | "partly" | "not_yet" | "none";
export type CoachResult = { verdict: Verdict; feedback: string; hint: string; answer: string; step: number; safety?: boolean; provider: string; model?: string | null };
export type ExplainResult = {
  score: number;
  feedback: string;
  covered: string[];
  missed: string[];
  mistakes: string[];
  follow_up: string;
  safety?: boolean;
  provider: string;
  model?: string | null;
};

export const LAST_STEP = 4;

async function post<T>(path: string, body: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("The study tools need the SkillRelays API running. Start it and try again.");
  }
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.detail ?? "Something went wrong. Try again.");
  return r.json();
}

const notePart = (note: Note) => ({ title: note.title, text: note.text.slice(0, 30000), ...learnerParams() });

export const coachQuestion = (note: Note, skip: string[]) => post<{ question: string; provider: string }>("/api/study/question", { ...notePart(note), skip });

export const coach = (note: Note, question: string, attempt: string, step: number) =>
  post<CoachResult>("/api/study/coach", { ...notePart(note), question, attempt, step });

export const explainBack = (note: Note, explanation: string) => post<ExplainResult>("/api/study/explain", { ...notePart(note), explanation });

// ---------- Smart revision: missed items come back after 1, 3 and 7 days ----------

export type MissReason = "forgot" | "mixed" | "misread" | "unclear";

export const REASONS: { id: MissReason; label: string; tip: string }[] = [
  { id: "forgot", label: "I forgot it", tip: "Short daily reviews fix forgetting. Keep your revision streak going." },
  { id: "mixed", label: "Mixed it up", tip: "Compare the two things side by side, and try Mixed practice so you learn to tell them apart." },
  { id: "misread", label: "Misread the question", tip: "Slow down: underline the key word in each question before you answer." },
  { id: "unclear", label: "Didn't understand it", tip: "Use the Study Coach or Explain it back on this topic before revising it again." },
];

export type ReviewItem = {
  id: string;
  front: string;
  back: string;
  noteId: string;
  noteTitle: string;
  box: number; // 1, 2, 3; passing box 3 means it's learned
  due: string; // ISO date the item is next due
  reasons: MissReason[];
  addedAt: string;
};

export const INTERVALS = [0, 1, 3, 7]; // days until the next review, by box

const KEY = "sr.revision";
const DAY = 86_400_000;

const dayStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const inDays = (n: number) => new Date(dayStart().getTime() + n * DAY).toISOString();

export function loadReviews(): ReviewItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as ReviewItem[];
  } catch {
    return [];
  }
}

export function saveReviews(items: ReviewItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage blocked: revision works for this visit only */
  }
}

export const isDue = (item: ReviewItem) => new Date(item.due).getTime() <= Date.now();
export const dueCount = () => loadReviews().filter(isDue).length;

/** Add a missed question, or send it back to box 1 if it's already on the list. Due tomorrow. */
export function addMiss(note: Note, front: string, back: string, reason?: MissReason) {
  const items = loadReviews();
  const existing = items.find((x) => x.front === front && x.noteId === note.id);
  if (existing) {
    existing.box = 1;
    existing.due = inDays(INTERVALS[1]);
    if (reason) existing.reasons.push(reason);
  } else {
    items.unshift({
      id: `rev-${Date.now()}-${items.length}`,
      front,
      back,
      noteId: note.id,
      noteTitle: note.title || "My notes",
      box: 1,
      due: inDays(INTERVALS[1]),
      reasons: reason ? [reason] : [],
      addedAt: new Date().toISOString(),
    });
  }
  saveReviews(items);
}

export function addReason(note: Note, front: string, reason: MissReason) {
  const items = loadReviews();
  const item = items.find((x) => x.front === front && x.noteId === note.id);
  if (item) {
    item.reasons.push(reason);
    saveReviews(items);
  }
}

/** Remembered: move up a box (1 → 3 → 7 days). Past the last box it's learned and leaves the list. */
export function markReview(items: ReviewItem[], id: string, remembered: boolean, reason?: MissReason): ReviewItem[] {
  return items.flatMap((x) => {
    if (x.id !== id) return [x];
    if (!remembered) return [{ ...x, box: 1, due: inDays(INTERVALS[1]), reasons: reason ? [...x.reasons, reason] : x.reasons }];
    if (x.box >= 3) return [];
    const box = x.box + 1;
    return [{ ...x, box, due: inDays(INTERVALS[box]) }];
  });
}

export function topReason(items: ReviewItem[]) {
  const counts = new Map<MissReason, number>();
  items.forEach((x) => x.reasons.forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1)));
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return best ? REASONS.find((r) => r.id === best[0]) : undefined;
}
