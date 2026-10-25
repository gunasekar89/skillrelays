// A learner's own notebook: typed text plus an optional handwritten page, kept in this browser's
// localStorage. The AI tools (summarize, tidy up, flashcards, quiz, handwriting) run on the API.
import { bandOf, learnerParams, loadProfile, type Band } from "./profile";

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

const evsSample = (): Note => ({
  id: "note-sample-evs",
  title: "Living and non-living things",
  subject: "EVS",
  chapter: "Ch 2: Things around us",
  text: [
    "Living and non-living things",
    "- Living things grow, eat, breathe and move on their own",
    "- Plants, animals and people are living things",
    "- Non-living things do not grow, eat or breathe",
    "- A stone, a chair and a pencil are non-living things",
    "- Plants make their own food using sunlight and water",
    "- Animals need food, water and air to live",
  ].join("\n"),
  updatedAt: new Date().toISOString(),
});

const fractionsSample = (): Note => ({
  id: "note-sample-fractions",
  title: "Fractions",
  subject: "Mathematics",
  chapter: "Ch 7: Fractions",
  text: [
    "Fractions",
    "- A fraction is a part of a whole, written as numerator over denominator, like 3/4",
    "- The denominator is the number of equal parts the whole is cut into",
    "- The numerator is the number of parts we take",
    "- Equivalent fractions show the same amount, like 1/2 = 2/4 = 4/8",
    "- To add fractions with the same denominator, add the numerators and keep the denominator: 1/5 + 2/5 = 3/5",
    "- A proper fraction is less than 1, and an improper fraction like 7/4 is more than 1",
    "- 7/4 as a mixed fraction is 1 3/4",
  ].join("\n"),
  updatedAt: new Date().toISOString(),
});

const studySample = (): Note => ({
  id: "note-sample-biology",
  title: "Photosynthesis",
  subject: "Science",
  chapter: "Ch 6: Life processes",
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

// One school sample per stage, so every standard has something to practise on from the first visit.
const SCHOOL_SAMPLES: Record<Exclude<Band, "college">, () => Note> = { "1-3": evsSample, "4-7": fractionsSample, "8-10": studySample };

const isStudent = () => window.location.pathname.startsWith("/student");

/** Students start with the sample for their own stage first; Enterprise keeps the GCU notes. */
function defaultNotes(): Note[] {
  if (!isStudent()) return [studySample(), sample()];
  const band = bandOf(loadProfile().standard);
  const all = Object.entries(SCHOOL_SAMPLES).map(([b, make]) => ({ b, note: make() }));
  return [...all.filter((x) => x.b === band), ...all.filter((x) => x.b !== band)].map((x) => x.note);
}

export function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Note[];
  } catch {
    /* fall through to the sample */
  }
  return defaultNotes();
}

/** Make sure the sample for this stage is in the notebook (for students whose notebook predates it). */
export function ensureSample(band: Band) {
  if (band === "college") return;
  const notes = loadNotes();
  const note = SCHOOL_SAMPLES[band]();
  if (notes.some((n) => n.id === note.id)) return;
  saveNotes([note, ...notes]);
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
