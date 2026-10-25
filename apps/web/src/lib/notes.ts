// A learner's own notebook: typed text plus an optional handwritten page, kept in this browser's
// localStorage. The AI tools (summarize, tidy up, flashcards, quiz, handwriting) run on the API.
import { learnerParams } from "./profile";

export type Note = {
  id: string;
  title: string;
  text: string;
  ink?: string; // PNG data URL of the handwritten page
  subject?: string;
  chapter?: string;
  updatedAt: string;
};

export type Flashcard = { front: string; back: string };
export type QuizQuestion = { question: string; options: string[]; answer: number; explanation: string };
export type NoteAction = "summarize" | "tidy" | "simplify" | "flashcards" | "quiz";
export type NoteAiResult = { action: NoteAction; text: string; cards: Flashcard[]; questions: QuizQuestion[]; provider: string; model?: string | null };

const KEY = "sr.notes";

const sample = (): Note => ({
  id: "note-sample",
  title: "GCU orientation — my notes",
  text: [
    "Garden City University orientation",
    "- GCU is a private univercity in Bengaluru",
    "- campus is in Bengaluru, admisions start with the online form",
    "- library open 8 am to 10 pm on weekdays",
    "placement cell: helps studnets get jobs with partner companies",
    "scholarships are given for high entrance test scores",
    "",
    "to ask: hostel fee and transport routes",
  ].join("\n"),
  updatedAt: new Date().toISOString(),
});

const studySample = (): Note => ({
  id: "note-sample-biology",
  title: "Photosynthesis",
  subject: "Science",
  chapter: "Ch 1: Nutrition in plants",
  text: [
    "Photosynthesis",
    "- Photosynthesis is how green plants make food from light, water and carbon dioxide",
    "- It happens in the chloroplasts, which contain the green pigment chlorophyll",
    "- Light reactions: take place in the thylakoid membranes and split water, releasing oxygen",
    "- Calvin cycle: takes place in the stroma and uses carbon dioxide to make glucose",
    "- The overall equation is 6CO2 + 6H2O + light energy gives C6H12O6 + 6O2",
    "Factors that affect the rate",
    "- Light intensity, carbon dioxide concentration and temperature limit the rate",
    "- Most plant enzymes work best at about 25 to 35 degrees Celsius",
  ].join("\n"),
  updatedAt: new Date().toISOString(),
});

export function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Note[];
  } catch {
    /* fall through to the sample */
  }
  return [studySample(), sample()];
}

export function saveNotes(notes: Note[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    /* storage full (large handwriting pages) or blocked: keep working in memory */
  }
}

export const newNote = (): Note => ({ id: `note-${Date.now()}`, title: "Untitled note", text: "", updatedAt: new Date().toISOString() });

async function post<T>(path: string, body: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("The AI tools need the SkillRelays API running. Start it and try again.");
  }
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.detail ?? "Something went wrong. Try again.");
  return r.json();
}

export const noteAi = (action: NoteAction, note: Note) =>
  post<NoteAiResult>("/api/notes/ai", { action, title: note.title, text: note.text.slice(0, 30000), ...learnerParams() });

export const readHandwriting = (image: string) => post<{ text: string; provider: string; model?: string | null }>("/api/notes/handwriting", { image });
