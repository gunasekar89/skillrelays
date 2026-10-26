import { useEffect, useState, type ReactNode } from "react";
import { BookMarked, BookOpen, Calculator, Coffee, FlaskConical, Globe, Languages, Leaf, Monitor, Palette } from "lucide-react";
import { countdown, type CalEvent, type Category } from "../../lib/calendar";
import { categoryLabel, t } from "../../lib/calendarText";

/** One colour per category, used for the card edge, the dot and the chip. Full class names so Tailwind keeps them. */
export const COLORS: Record<Category, { dot: string; card: string; chip: string; text: string }> = {
  class: { dot: "bg-blue-500", card: "border-l-blue-500 bg-blue-50/60", chip: "bg-blue-100 text-blue-800", text: "text-blue-700" },
  exam: { dot: "bg-rose-500", card: "border-l-rose-500 bg-rose-50", chip: "bg-rose-100 text-rose-800", text: "text-rose-700" },
  homework: { dot: "bg-amber-500", card: "border-l-amber-500 bg-amber-50", chip: "bg-amber-100 text-amber-900", text: "text-amber-800" },
  assignment: { dot: "bg-orange-500", card: "border-l-orange-500 bg-orange-50", chip: "bg-orange-100 text-orange-900", text: "text-orange-800" },
  holiday: { dot: "bg-emerald-500", card: "border-l-emerald-500 bg-emerald-50", chip: "bg-emerald-100 text-emerald-800", text: "text-emerald-700" },
  event: { dot: "bg-violet-500", card: "border-l-violet-500 bg-violet-50", chip: "bg-violet-100 text-violet-800", text: "text-violet-700" },
  meeting: { dot: "bg-cyan-600", card: "border-l-cyan-600 bg-cyan-50", chip: "bg-cyan-100 text-cyan-900", text: "text-cyan-800" },
  activity: { dot: "bg-lime-600", card: "border-l-lime-600 bg-lime-50", chip: "bg-lime-100 text-lime-900", text: "text-lime-800" },
  study: { dot: "bg-indigo-500", card: "border-l-indigo-500 bg-indigo-50", chip: "bg-indigo-100 text-indigo-800", text: "text-indigo-700" },
  result: { dot: "bg-fuchsia-500", card: "border-l-fuchsia-500 bg-fuchsia-50", chip: "bg-fuchsia-100 text-fuchsia-800", text: "text-fuchsia-700" },
};

export const ALL_CATEGORIES = Object.keys(COLORS) as Category[];

export function SubjectIcon({ subject, isBreak, className = "h-4 w-4" }: { subject?: string; isBreak?: boolean; className?: string }) {
  if (isBreak) return <Coffee className={className} aria-hidden />;
  const s = (subject ?? "").toLowerCase();
  const Icon = s.includes("math")
    ? Calculator
    : s.includes("science") && !s.includes("social") && !s.includes("computer")
      ? FlaskConical
      : s.includes("evs")
        ? Leaf
        : s.includes("english")
          ? BookOpen
          : s.includes("tamil") || s.includes("hindi")
            ? Languages
            : s.includes("social")
              ? Globe
              : s.includes("computer")
                ? Monitor
                : s.includes("art")
                  ? Palette
                  : BookMarked;
  return <Icon className={className} aria-hidden />;
}

export function CategoryChip({ category, children }: { category: Category; children?: ReactNode }) {
  return <span className={`chip ${COLORS[category].chip}`}>{children ?? categoryLabel(category)}</span>;
}

export function SampleTag() {
  return (
    <span className="chip bg-slate-100 text-slate-500 ring-1 ring-slate-200" title="Part of the sample term. Remove it from Setup or the banner.">
      Sample
    </span>
  );
}

/** A live countdown to an item's start, refreshed every 30 seconds. */
export function Countdown({ event, big }: { event: CalEvent; big?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const c = countdown(event, now);
  if (c.past) return <span className="text-sm font-medium text-slate-500">Started</span>;
  const parts: [number, string][] = [
    [c.days, t("days")],
    [c.hours, t("hours")],
    [c.minutes, t("mins")],
  ];
  return (
    <div className={`flex gap-2 ${big ? "" : "text-sm"}`} role="timer" aria-label={`${c.days} days ${c.hours} hours ${c.minutes} minutes to go`}>
      {parts.map(([n, label]) => (
        <div key={label} className={`rounded-xl bg-white/80 text-center ring-1 ring-rose-200 ${big ? "min-w-[64px] px-3 py-2" : "min-w-[46px] px-2 py-1"}`}>
          <div className={`font-bold tabular-nums text-rose-700 ${big ? "text-2xl" : "text-base"}`}>{n}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
        </div>
      ))}
    </div>
  );
}

/** A right-side panel on desktop, a bottom sheet on phones. Closes on Escape and on the backdrop. */
export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-navy/30" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[440px] sm:rounded-none sm:rounded-l-2xl sm:p-6">
        {children}
      </div>
    </div>
  );
}

export const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";
