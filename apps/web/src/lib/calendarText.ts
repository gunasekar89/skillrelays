// Calendar labels in English and Tamil. The student's profile language picks one; add a language by adding a column.
import { loadProfile } from "./profile";
import type { Category, ExamKind, ExamStatus } from "./calendar";

const TEXT = {
  calendar: ["My calendar", "என் நாட்காட்டி"],
  day: ["Day", "நாள்"],
  week: ["Week", "வாரம்"],
  month: ["Month", "மாதம்"],
  agenda: ["Agenda", "நிகழ்ச்சி நிரல்"],
  year: ["Year", "கல்வியாண்டு"],
  exams: ["Exams", "தேர்வுகள்"],
  plan: ["Study plan", "படிப்புத் திட்டம்"],
  setup: ["Setup", "அமைப்பு"],
  today: ["Today", "இன்று"],
  add: ["Add", "சேர்"],
  search: ["Search", "தேடு"],
  now: ["Now", "இப்போது"],
  next: ["Next", "அடுத்து"],
  nextExam: ["Next exam", "அடுத்த தேர்வு"],
  dueSoon: ["Due soon", "விரைவில் சமர்ப்பிக்க"],
  noSchool: ["No school today", "இன்று பள்ளி இல்லை"],
  nothing: ["Nothing planned", "எதுவும் திட்டமிடவில்லை"],
  days: ["days", "நாட்கள்"],
  hours: ["hrs", "மணி"],
  mins: ["min", "நிமி"],
  syllabus: ["Syllabus", "பாடத்திட்டம்"],
  instructions: ["Instructions", "அறிவுறுத்தல்கள்"],
  reminders: ["Reminders", "நினைவூட்டல்கள்"],
  revise: ["Revise", "மீள்பார்வை"],
  all: ["All", "அனைத்தும்"],
} as const;

const CATEGORY: Record<Category, [string, string]> = {
  class: ["Class", "வகுப்பு"],
  exam: ["Exam", "தேர்வு"],
  homework: ["Homework", "வீட்டுப்பாடம்"],
  assignment: ["Assignment / project", "ஒப்படைப்பு"],
  holiday: ["Holiday", "விடுமுறை"],
  event: ["School event", "பள்ளி நிகழ்வு"],
  meeting: ["Meeting", "கூட்டம்"],
  activity: ["Activity / sports", "செயல்பாடு"],
  study: ["Study session", "படிப்பு நேரம்"],
  result: ["Results", "முடிவுகள்"],
};

export const EXAM_KINDS: Record<ExamKind, string> = {
  unit: "Unit test",
  monthly: "Monthly test",
  quarterly: "Quarterly exam",
  "half-yearly": "Half-yearly exam",
  annual: "Annual exam",
  practical: "Practical exam",
  project: "Project / viva",
  other: "Other",
};

export const EXAM_STATUS: Record<ExamStatus, string> = { scheduled: "Scheduled", rescheduled: "Rescheduled", completed: "Completed", cancelled: "Cancelled" };

const lang = () => (loadProfile().language === "ta" ? 1 : 0);

export const t = (key: keyof typeof TEXT) => TEXT[key][lang()];
export const categoryLabel = (c: Category) => CATEGORY[c][lang()];
export const locale = () => (lang() ? "ta-IN" : "en-IN");

/** A local date string formatted in the learner's language, e.g. "Monday, 16 November". */
export function formatDate(s: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) {
  const [y, m, d] = s.split("-").map(Number);
  return new Intl.DateTimeFormat(locale(), opts).format(new Date(y, m - 1, d));
}

/** "08:30" as "8:30 am" (or the Tamil equivalent). */
export function formatTime(hhmm?: string) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return new Intl.DateTimeFormat(locale(), { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, h, m));
}

export const weekdayShort = (i: number) => new Intl.DateTimeFormat(locale(), { weekday: "short" }).format(new Date(2026, 10, 15 + i)); // 16 Nov 2026 is a Monday
