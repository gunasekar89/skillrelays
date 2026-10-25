import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Award, CalendarClock, CheckCircle2, Circle, Copy, Flame, Gauge, NotebookPen, Pencil, Send, Settings, Target } from "lucide-react";
import { PageHeader, StatCard } from "../../components/ui";
import { ensureSample, loadNotes } from "../../lib/notes";
import { badges, calibration, daysLeft, loadActivity, loadGoal, mastery, masteryWord, parentSummary, practiceDays, saveGoal, todaysPlan, type ExamGoal } from "../../lib/progress";
import { bandOf, DEFAULT_PROFILE, hasProfile, loadProfile, saveProfile, type Profile } from "../../lib/profile";
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

function ProfileForm({ initial, onDone, first }: { initial: Profile; onDone: () => void; first?: boolean }) {
  const [p, setP] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    saveProfile(p);
    ensureSample(bandOf(p.standard));
    onDone();
  };
  const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none";
  return (
    <form onSubmit={submit} className="card mb-6 p-6">
      <div className="font-semibold">{first ? "Welcome! Tell us a little about you" : "Your profile and settings"}</div>
      <p className="mt-1 text-sm text-slate-500">This sets how the AI helps you. Younger students get guided practice; the AI replies in the language you pick.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium">
          Name
          <input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} className={field} />
        </label>
        <label className="text-sm font-medium">
          Class
          <select
            value={String(p.standard)}
            onChange={(e) => setP({ ...p, standard: e.target.value === "college" ? "college" : Number(e.target.value) })}
            className={field}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Standard {n}
              </option>
            ))}
            <option value="college">College</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Board
          <select value={p.board} onChange={(e) => setP({ ...p, board: e.target.value as Profile["board"] })} className={field}>
            <option>CBSE</option>
            <option>State Board</option>
            <option>Other</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          AI replies in
          <select value={p.language} onChange={(e) => setP({ ...p, language: e.target.value as Profile["language"] })} className={field}>
            <option value="en">English</option>
            <option value="ta">தமிழ் (Tamil)</option>
          </select>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-5 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={p.largeText} onChange={(e) => setP({ ...p, largeText: e.target.checked })} /> Larger text
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={p.highContrast} onChange={(e) => setP({ ...p, highContrast: e.target.checked })} /> High contrast
        </label>
        <button className="btn-primary ml-auto">{first ? "Start studying" : "Save"}</button>
        {!first && (
          <button type="button" onClick={onDone} className="btn-ghost">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export default function StudentDashboard() {
  const [profileOpen, setProfileOpen] = useState(() => !hasProfile());
  const [firstVisit] = useState(() => !hasProfile());
  const [copied, setCopied] = useState(false);
  const [, refresh] = useState(0);
  const profile = loadProfile();
  // Demo shortcut: see the app as a younger or older student without filling in the profile again.
  const viewAs = (standard: number) => {
    saveProfile({ ...profile, standard });
    ensureSample(bandOf(standard));
    refresh((n) => n + 1);
  };
  const [goal, setGoal] = useState<ExamGoal>(loadGoal);
  const [editing, setEditing] = useState(false);
  const notes = loadNotes();
  const log = loadActivity();
  const plan = todaysPlan(notes, log);
  const notesMastery = mastery(notes, log).sort((a, b) => (a.score ?? -1) - (b.score ?? -1));
  const bySubject = [...new Set(notesMastery.map((m) => m.note.subject || "Other notes"))].map((subject) => ({
    subject,
    items: notesMastery.filter((m) => (m.note.subject || "Other notes") === subject),
  }));
  const earned = badges(log);
  const summary = parentSummary(profile.name || "Your child", notes, log);
  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the text is on screen to copy by hand */
    }
  };
  const strong = notesMastery.filter((m) => (m.score ?? 0) >= 0.8).length;
  const due = dueCount();
  const days = daysLeft(goal);
  const cal = calibration(log);
  const doneTasks = plan.filter((t) => t.done).length;
  const tip = TIPS[new Date().getDate() % TIPS.length];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Hi ${profile.name || DEFAULT_PROFILE.name}, ready to study?`}
        actions={
          !profileOpen && (
            <button onClick={() => setProfileOpen(true)} className="btn-ghost">
              <Settings className="h-4 w-4" /> Profile and settings
            </button>
          )
        }
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

      {profileOpen && <ProfileForm initial={profile} first={firstVisit && !hasProfile()} onDone={() => setProfileOpen(false)} />}

      {!profileOpen && (
        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          See the app as
          {[
            { n: 2, label: "Standard 2 (guided)" },
            { n: 5, label: "Standard 5" },
            { n: 9, label: "Standard 9" },
          ].map(({ n, label }) => (
            <button
              key={n}
              onClick={() => viewAs(n)}
              className={`rounded-full px-3 py-1 ring-1 ${profile.standard === n ? "bg-brand text-white ring-brand" : "ring-slate-300 hover:bg-slate-100"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Practice this week" value={`${practiceDays(log)} / 7 days`} icon={<Flame className="h-4 w-4" />} hint="A little most days works best" />
        <StatCard label="Revision due" value={due} icon={<CalendarClock className="h-4 w-4" />} hint="Missed questions coming back" />
        <StatCard label="Notes secure" value={`${strong} / ${notesMastery.length}`} icon={<NotebookPen className="h-4 w-4" />} hint="80% or more in recent practice" />
        <StatCard
          label="Confidence check"
          value={cal ? `${Math.round((1 - cal.share) * 100)}%` : "—"}
          icon={<Gauge className="h-4 w-4" />}
          hint={cal ? `Of answers you were sure about, this many were right` : "Take a quiz to see it"}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
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

          <div className="mt-6 border-t border-slate-100 pt-5">
            <div className="font-semibold">This week, for your parents</div>
            <p className="mt-1 text-xs text-slate-500">A plain-words summary you can share. Read it first: you decide what to send.</p>
            <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed">{summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={copySummary} className="btn-ghost">
                <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy"}
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent(summary)}`} target="_blank" rel="noreferrer" className="btn-ghost">
                <Send className="h-4 w-4" /> Share on WhatsApp
              </a>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-6">
            <div className="font-semibold">Where to practise</div>
            <p className="mt-1 text-xs text-slate-500">Based on your recent practice. It changes as you learn, so it's never a label.</p>
            {bySubject.map((g) => (
              <div key={g.subject} className="mt-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.subject}</div>
                <ul className="mt-2 space-y-3">
                  {g.items.map((m) => (
                    <li key={m.note.id}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <Link to={`/student/notes?note=${encodeURIComponent(m.note.id)}&tool=coach`} className="truncate font-medium hover:text-brand">
                          {m.note.title || "Untitled note"}
                        </Link>
                        <span className="shrink-0 text-xs text-slate-500">{masteryWord(m.score)}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100">
                        <div className={`h-2 rounded-full ${tone(m.score)}`} style={{ width: m.score === null ? "4%" : `${Math.max(4, m.score * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <Link to="/student/notes" className="btn-ghost mt-5 w-full">
              Open my notes
            </Link>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-2 font-semibold">
              <Award className="h-4 w-4 text-amber-500" /> Learning badges
            </div>
            <p className="mt-1 text-xs text-slate-500">Earned for good study habits, not for time on the app.</p>
            <ul className="mt-3 space-y-2">
              {earned.map((b) => (
                <li key={b.id} className={`flex items-center gap-3 rounded-lg p-2 text-sm ${b.earned ? "bg-amber-50" : ""}`}>
                  <Award className={`h-5 w-5 shrink-0 ${b.earned ? "text-amber-500" : "text-slate-300"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{b.title}</div>
                    <div className="text-xs text-slate-500">{b.detail}</div>
                  </div>
                  <span className="text-xs text-slate-500">{b.earned ? "Earned" : b.progress}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
