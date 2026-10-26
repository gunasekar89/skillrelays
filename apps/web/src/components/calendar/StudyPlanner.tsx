import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, Wand2 } from "lucide-react";
import { daysBetween, today, type CalendarData } from "../../lib/calendar";
import { formatDate } from "../../lib/calendarText";
import { acceptPlan, DEFAULT_MINUTES, evidence, plannableExams, requestPlan, type Plan } from "../../lib/planner";
import { bandOf, loadProfile } from "../../lib/profile";
import { SimBadge } from "../ui";
import { field } from "./parts";

const KIND: Record<string, { label: string; cls: string }> = {
  learn: { label: "Study", cls: "bg-indigo-100 text-indigo-800" },
  practise: { label: "Practise", cls: "bg-amber-100 text-amber-900" },
  revise: { label: "Revise", cls: "bg-teal-50 text-teal-700" },
  mock: { label: "Practice paper", cls: "bg-rose-100 text-rose-800" },
};

/** The AI study planner: plans revision for chosen exams from real exam dates, chapters and practice results. */
export function StudyPlanner({ cal, onChange, focusId }: { cal: CalendarData; onChange: (cal: CalendarData) => void; focusId?: string }) {
  const band = bandOf(loadProfile().standard);
  const options = plannableExams(cal);
  const [chosen, setChosen] = useState<string[]>(() => (focusId && options.some((e) => e.id === focusId) ? [focusId] : options.map((e) => e.id)));
  const [weekday, setWeekday] = useState(DEFAULT_MINUTES[band][0]);
  const [weekend, setWeekend] = useState(DEFAULT_MINUTES[band][1]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const ev = evidence();
  const picked = options.filter((e) => chosen.includes(e.id));
  const existing = cal.events.filter((e) => e.source === "planner" && !e.done).length;

  const generate = async () => {
    setBusy(true);
    setError("");
    setAccepted(false);
    try {
      setPlan(await requestPlan(cal, picked, weekday, weekend));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!options.length) {
    return (
      <div className="card p-8 text-center">
        <Wand2 className="mx-auto h-8 w-8 text-brand" />
        <div className="mt-3 font-semibold">No exams in the next six weeks</div>
        <p className="mt-1 text-sm text-slate-500">Add an exam with its chapters, or import your school's calendar, and the planner will make a revision plan for it.</p>
      </div>
    );
  }

  const byDay = plan ? [...new Set(plan.sessions.map((s) => s.date))].map((d) => ({ date: d, items: plan.sessions.filter((s) => s.date === d) })) : [];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="card h-fit p-5">
        <div className="flex items-center gap-2 font-semibold">
          <Wand2 className="h-4 w-4 text-brand" /> AI study planner
        </div>
        <p className="mt-1 text-sm text-slate-500">Plans short study sessions before each exam, using your exam dates, the chapters you haven't ticked yet, and your practice results.</p>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">Plan for</legend>
          <ul className="mt-2 space-y-1.5">
            {options.map((e) => {
              const todo = (e.exam?.syllabus ?? []).filter((c) => !e.exam?.done?.includes(c)).length;
              return (
                <li key={e.id}>
                  <label className="flex items-start gap-2 rounded-lg p-2 text-sm hover:bg-slate-50">
                    <input type="checkbox" className="mt-0.5" checked={chosen.includes(e.id)} onChange={(x) => setChosen(x.target.checked ? [...chosen, e.id] : chosen.filter((id) => id !== e.id))} />
                    <span>
                      <span className="font-medium">{e.title}</span>
                      <span className="block text-xs text-slate-500">
                        {formatDate(e.date, { weekday: "short", day: "numeric", month: "short" })} · in {daysBetween(today(), e.date)} days · {e.exam?.syllabus.length ? `${todo} of ${e.exam.syllabus.length} chapters left` : "no chapters added"}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">
            School days (min)
            <input type="number" min={0} max={480} step={5} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className={field} />
          </label>
          <label className="text-sm font-medium">
            Weekends, holidays
            <input type="number" min={0} max={600} step={5} value={weekend} onChange={(e) => setWeekend(Number(e.target.value))} className={field} />
          </label>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          <div className="font-semibold text-slate-700">Practice results the plan uses</div>
          {ev.length ? (
            <ul className="mt-1 space-y-0.5">
              {ev.map((x) => (
                <li key={x.subject}>
                  {x.subject}: {Math.round((x.score ?? 0) * 100)}% over {x.sessions} session{x.sessions === 1 ? "" : "s"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1">None yet. The plan won't guess at weak spots: every chapter gets the same time until you practise in My notes.</p>
          )}
        </div>
        <button onClick={generate} disabled={busy || !picked.length} className="btn-primary mt-4 w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {plan ? "Make a new plan" : "Make my plan"}
        </button>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </div>

      <div className="space-y-4">
        {!plan && !busy && (
          <div className="card grid min-h-[240px] place-items-center p-8 text-center text-sm text-slate-500">
            Pick your exams and how much time you have, then make your plan. You can look it over before anything goes into your calendar.
          </div>
        )}
        {busy && (
          <div className="card grid min-h-[240px] place-items-center p-8 text-sm text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        )}
        {plan && !busy && (
          <>
            <div className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">Your plan</div>
                {plan.provider.startsWith("Simulated") ? <SimBadge /> : <span className="chip bg-teal-50 text-teal-700">{plan.provider}</span>}
              </div>
              <p className="mt-2 text-sm leading-relaxed">{plan.summary}</p>
              <p className="mt-2 text-xs text-slate-500">
                {plan.sessions.length} sessions of {plan.session_minutes} minutes, with a {plan.break_minutes}-minute break between sessions.
              </p>
              {plan.warnings.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {plan.warnings.map((w) => (
                    <li key={w} className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {w}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    onChange(acceptPlan(cal, plan));
                    setAccepted(true);
                  }}
                  disabled={accepted || !plan.sessions.length}
                  className="btn-teal"
                >
                  <CheckCircle2 className="h-4 w-4" /> {accepted ? "Added to your calendar" : "Add to my calendar"}
                </button>
                {existing > 0 && !accepted && <span className="text-xs text-slate-500">Replaces the {existing} unfinished study sessions from your last plan.</span>}
              </div>
            </div>
            {byDay.map(({ date, items }) => (
              <div key={date} className="card p-4">
                <div className="text-sm font-semibold">
                  {formatDate(date)} <span className="font-normal text-slate-500">· {items.reduce((s, i) => s + i.minutes, 0)} min</span>
                </div>
                <ul className="mt-2 space-y-2">
                  {items.map((s, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-xl p-2 ring-1 ring-slate-100">
                      <span className={`chip mt-0.5 shrink-0 ${KIND[s.kind].cls}`}>{KIND[s.kind].label}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {s.subject} · {s.chapter}
                        </div>
                        <div className="text-xs text-slate-500">
                          {s.minutes} min · {s.why}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
