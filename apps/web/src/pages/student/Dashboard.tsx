import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, CheckCircle2, Circle, Flame, Gauge, NotebookPen, Pencil, Target } from "lucide-react";
import { PageHeader, StatCard } from "../../components/ui";
import { loadNotes } from "../../lib/notes";
import { calibration, daysLeft, loadActivity, loadGoal, mastery, saveGoal, streak, todaysPlan, type ExamGoal } from "../../lib/progress";
import { dueCount } from "../../lib/study";

// One research-backed habit a day, so the "why" behind the tools is visible.
const TIPS = [
  "Testing yourself beats re-reading. Close your notes and try the Study coach before you look anything up.",
  "Little and often wins. Three 20-minute sessions on different days beat one hour the night before.",
  "Mix your topics. Mixed practice feels harder, but it trains you to pick the right idea in the exam.",
  "Explain it to a friend, or to the mic. If you can't say it simply, that's the part to study.",
  "Feeling sure isn't the same as knowing. Watch the answers you were sure about but got wrong.",
  "Sleep is part of studying. Memories made today are strengthened tonight.",
  "Mistakes are useful. Note why you got something wrong, and you're less likely to repeat it.",
];

const tone = (score: number | null) => (score === null ? "bg-slate-200" : score >= 0.8 ? "bg-teal-500" : score >= 0.5 ? "bg-amber-400" : "bg-red-400");

export default function StudentDashboard() {
  const [goal, setGoal] = useState<ExamGoal>(loadGoal);
  const [editing, setEditing] = useState(false);
  const notes = loadNotes();
  const log = loadActivity();
  const plan = todaysPlan(notes, log);
  const notesMastery = mastery(notes, log).sort((a, b) => (a.score ?? -1) - (b.score ?? -1));
  const strong = notesMastery.filter((m) => (m.score ?? 0) >= 0.8).length;
  const due = dueCount();
  const days = daysLeft(goal);
  const cal = calibration(log);
  const doneTasks = plan.filter((t) => t.done).length;
  const tip = TIPS[new Date().getDate() % TIPS.length];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Hi Sneha, ready to study?"
        subtitle={
          editing ? (
            <form
              className="mt-1 flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveGoal(goal);
                setEditing(false);
              }}
            >
              <input value={goal.name} onChange={(e) => setGoal({ ...goal, name: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1 text-sm" aria-label="Exam name" />
              <input type="date" value={goal.date} onChange={(e) => setGoal({ ...goal, date: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1 text-sm" aria-label="Exam date" />
              <button className="btn-primary px-3 py-1">Save</button>
            </form>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Target className="h-4 w-4 text-brand" />
              {goal.name}: {days > 1 ? `${days} days to go` : days === 1 ? "tomorrow" : days === 0 ? "today" : "done"}
              <button onClick={() => setEditing(true)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-navy" aria-label="Change exam">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </span>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Study streak" value={`${streak(log)} day${streak(log) === 1 ? "" : "s"}`} icon={<Flame className="h-4 w-4" />} hint="Days in a row with practice" />
        <StatCard label="Revision due" value={due} icon={<CalendarClock className="h-4 w-4" />} hint="Missed questions coming back" />
        <StatCard label="Notes mastered" value={`${strong} / ${notesMastery.length}`} icon={<NotebookPen className="h-4 w-4" />} hint="80% or more in recent practice" />
        <StatCard
          label="Confidence check"
          value={cal ? `${Math.round((1 - cal.share) * 100)}%` : "—"}
          icon={<Gauge className="h-4 w-4" />}
          hint={cal ? `Of answers you were sure about, this many were right` : "Take a quiz to see it"}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Today's plan</div>
            <span className="text-xs text-slate-500">
              {doneTasks} of {plan.length} done · about {plan.filter((t) => !t.done).reduce((s, t) => s + t.minutes, 0)} min left
            </span>
          </div>
          {plan.length ? (
            <ul className="mt-4 space-y-2">
              {plan.map((t) => (
                <li key={t.id} className={`flex items-center gap-3 rounded-xl p-3 ring-1 ${t.done ? "bg-teal-50/60 ring-teal/20" : "ring-slate-200"}`}>
                  {t.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-teal" /> : <Circle className="h-5 w-5 shrink-0 text-slate-300" />}
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium ${t.done ? "text-slate-500 line-through" : ""}`}>{t.title}</div>
                    <div className="text-xs text-slate-500">
                      {t.why} · {t.minutes} min
                    </div>
                  </div>
                  {!t.done && (
                    <Link to={t.to} className="btn-primary px-3 py-1.5 text-sm">
                      Start
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Add your first notes to get a daily plan. <Link to="/student/notes" className="font-medium text-brand">Open my notes</Link>
            </p>
          )}
          <p className="mt-4 rounded-lg bg-brand-50 p-3 text-xs text-slate-700">
            <span className="font-semibold">Study tip: </span>
            {tip}
          </p>
        </div>

        <div className="card h-fit p-6">
          <div className="font-semibold">Weak spots</div>
          <p className="mt-1 text-xs text-slate-500">From your recent quizzes, coach answers, explanations and exams. Weakest first.</p>
          <ul className="mt-4 space-y-3">
            {notesMastery.map((m) => (
              <li key={m.note.id}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <Link to={`/student/notes?note=${encodeURIComponent(m.note.id)}&tool=coach`} className="truncate font-medium hover:text-brand">
                    {m.note.title || "Untitled note"}
                  </Link>
                  <span className="shrink-0 text-xs text-slate-500">{m.score === null ? "Not tested yet" : `${Math.round(m.score * 100)}%`}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full ${tone(m.score)}`} style={{ width: m.score === null ? "4%" : `${Math.max(4, m.score * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <Link to="/student/notes" className="btn-ghost mt-5 w-full">
            Open my notes
          </Link>
        </div>
      </div>
    </div>
  );
}
