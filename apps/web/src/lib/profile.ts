// The student's learner profile: school stage, board, language and display settings, kept in this
// browser. The stage sets how much freedom the AI tools give (younger students get guided practice
// only), and the language is the one the AI answers in.

export type Standard = number | "college"; // 1–10
export type Band = "1-3" | "4-7" | "8-10" | "college";
export type Profile = {
  name: string;
  standard: Standard;
  board: "CBSE" | "State Board" | "Other";
  language: "en" | "ta";
  largeText: boolean;
  highContrast: boolean;
};

const KEY = "sr.profile";

export const DEFAULT_PROFILE: Profile = { name: "Sneha", standard: 9, board: "CBSE", language: "en", largeText: false, highContrast: false };

export const SUBJECTS = ["Science", "Mathematics", "English", "Tamil", "Social Science", "Hindi", "Computer Science", "Other"];

export function hasProfile() {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    /* fall through to the default */
  }
  return DEFAULT_PROFILE;
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: settings last for this visit */
  }
  applyDisplay(p);
  window.dispatchEvent(new Event("sr-profile"));
}

export function bandOf(standard: Standard): Band {
  if (standard === "college") return "college";
  return standard <= 3 ? "1-3" : standard <= 7 ? "4-7" : "8-10";
}

export const standardLabel = (s: Standard) => (s === "college" ? "College" : `Standard ${s}`);

/** Language and stage for the AI, only on the student side; Enterprise keeps its defaults. */
export function learnerParams(): { language?: Profile["language"]; band?: Band } {
  if (!window.location.pathname.startsWith("/student")) return {};
  const p = loadProfile();
  return { language: p.language, band: bandOf(p.standard) };
}

/** What a stage may use. Standards 1–3 practise with guided questions only: no free-typed questions to the AI. */
export function permissions(band: Band) {
  return { askFreely: band !== "1-3", typeOwnQuestion: band !== "1-3" };
}

export function applyDisplay(p: Profile = loadProfile()) {
  const root = document.documentElement;
  const student = window.location.pathname.startsWith("/student");
  root.classList.toggle("text-large", student && p.largeText);
  root.classList.toggle("hc", student && p.highContrast);
}
