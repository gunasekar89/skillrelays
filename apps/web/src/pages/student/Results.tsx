import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Mic, TrendingUp } from "lucide-react";
import { PageHeader, ScoreRing, SimBadge } from "../../components/ui";
import { interviewTracks, scoreAnswers, type Answer } from "../../lib/demo";
import { load } from "../../lib/storage";

type Saved = { track: keyof typeof interviewTracks; answers: Answer[]; elapsed: number };

export default function Results() {
  const saved = load<Saved | null>("sr.interview", null);
  const [tab, setTab] = useState<"feedback" | "transcript">("feedback");

  if (!saved) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <Mic className="mx-auto h-10 w-10 text-slate-300" />
        <h1 className="mt-4 text-xl font-bold">No interview results yet</h1>
        <p className="mt-2 text-sm text-slate-500">Finish a mock interview and your feedback shows up here.</p>
        <Link to="/student/interview" className="btn-primary mt-6">
          Start a mock interview
        </Link>
      </div>
    );
  }

  const track = interviewTracks[saved.track];
  const s = scoreAnswers(saved.answers, track.questions);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`${track.role} · ${track.title}`}
        subtitle={`${saved.answers.length} of ${track.questions.length} questions answered`}
        actions={
          <>
            <SimBadge />
            <Link to="/student/interview" className="btn-primary">
              Practice again
            </Link>
          </>
        }
      />

      <div className="card grid grid-cols-2 gap-6 p-6 sm:grid-cols-3 lg:grid-cols-5">
        <ScoreRing value={s.overall} label="Overall" size={104} color="#2563EB" />
        <ScoreRing value={s.technical} label="Technical" />
        <ScoreRing value={s.communication} label="Communication" />
        <ScoreRing value={s.completeness} label="Completeness" />
        <ScoreRing value={s.problemSolving} label="Problem solving" />
      </div>

      <div className="mt-6 flex gap-2 border-b border-slate-200">
        {(["feedback", "transcript"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize ${tab === t ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-navy"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "feedback" ? (
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div className="card p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4 text-teal" /> Strengths
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {s.strengths.map((x) => (
                <li key={x}>• {x}</li>
              ))}
            </ul>
          </div>
          <div className="card p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <TrendingUp className="h-4 w-4 text-brand" /> Next steps
            </h2>
            <ol className="mt-3 space-y-2 text-sm text-slate-600">
              {s.improvements.map((x, i) => (
                <li key={x}>
                  {i + 1}. {x}
                </li>
              ))}
            </ol>
          </div>
          <p className="text-xs text-slate-500 md:col-span-2">
            Scores come from a transparent practice rubric (concept coverage, structure and depth). They are coaching signals, not a hiring decision.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {saved.answers.map((a) => (
            <div key={a.questionId} className="card p-5">
              <div className="text-sm font-semibold">{a.prompt}</div>
              <p className="mt-2 text-sm text-slate-600">{a.text || "(no answer captured)"}</p>
              <div className="mt-2 text-xs text-slate-400">{a.seconds}s</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
