import { Link } from "react-router-dom";
import { Award, CalendarClock, Mic, Target, TrendingUp } from "lucide-react";
import { PageHeader, StatCard } from "../../components/ui";
import { interviewTracks, scoreAnswers, type Answer } from "../../lib/demo";
import { load } from "../../lib/storage";
import { dueCount } from "../../lib/study";

export default function StudentDashboard() {
  const saved = load<{ track: keyof typeof interviewTracks; answers: Answer[] } | null>("sr.interview", null);
  const due = dueCount();
  const last = saved ? scoreAnswers(saved.answers, interviewTracks[saved.track].questions).overall : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Welcome back, Sneha 👋" subtitle="Target role: Cloud DevOps Engineer" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Interviews completed" value={saved ? 1 : 0} icon={<Mic className="h-4 w-4" />} />
        <StatCard label="Last score" value={last !== null ? `${last}%` : "—"} icon={<Award className="h-4 w-4" />} />
        <StatCard label="Focus areas" value={3} icon={<Target className="h-4 w-4" />} hint="Kubernetes, incidents, rollouts" />
        <StatCard label="Learning goals" value={2} icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      <div className="card mt-6 flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="min-w-[240px] flex-1">
          <div className="font-semibold">Your learning journey</div>
          <div className="mt-3 h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-gradient-to-r from-brand to-teal" style={{ width: saved ? "60%" : "15%" }} />
          </div>
          <div className="mt-1 text-xs text-slate-500">{saved ? "60" : "15"}% of your Kubernetes track</div>
        </div>
        <Link to="/student/interview" className="btn-primary">
          Continue practicing
        </Link>
      </div>

      <div className="card mt-4 flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex min-w-[240px] flex-1 items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-amber-50 text-amber-600">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold">{due ? `${due} revision item${due > 1 ? "s" : ""} due today` : "Revision is up to date"}</div>
            <div className="text-sm text-slate-500">Questions you missed come back after 1, 3 and 7 days, so they stick.</div>
          </div>
        </div>
        <Link to={due ? "/student/notes?tool=review" : "/student/notes"} className={due ? "btn-primary" : "btn-ghost"}>
          {due ? "Revise now" : "Study my notes"}
        </Link>
      </div>

      <h2 className="mb-3 mt-8 font-semibold">Recommended for you</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { title: "Practice a DevOps interview", text: "Voice interview on Kubernetes and rollouts.", to: "/student/interview" },
          { title: "Behavioral warm-up", text: "Two STAR-style questions to build confidence.", to: "/student/interview" },
          { title: "Review your last feedback", text: "See your scores and next steps.", to: "/student/results" },
        ].map((r) => (
          <div key={r.title} className="card flex flex-col p-5">
            <div className="font-semibold">{r.title}</div>
            <p className="mt-1 flex-1 text-sm text-slate-500">{r.text}</p>
            <Link to={r.to} className="btn-ghost mt-4">
              Open
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
