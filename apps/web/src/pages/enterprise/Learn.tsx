import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Lock, Volume2 } from "lucide-react";
import { PageHeader, ScoreRing, SimBadge } from "../../components/ui";
import { generateContent, type KtSession } from "../../lib/demo";
import { load } from "../../lib/storage";
import { speak } from "../../lib/voice";

export default function Learn() {
  const session = load<KtSession | null>("sr.kt", null);
  const quiz = useMemo(() => (session ? generateContent(session.transcript).quiz : []), [session]);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  if (!session?.approved) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <Lock className="mx-auto h-10 w-10 text-slate-300" />
        <h1 className="mt-4 text-xl font-bold">No published training yet</h1>
        <p className="mt-2 text-sm text-slate-500">Employees can take the quiz after a trainer approves the KT content.</p>
        <Link to={session ? "/enterprise/content" : "/enterprise/kt"} className="btn-teal mt-6">
          {session ? "Review and approve content" : "Start a KT session"}
        </Link>
      </div>
    );
  }

  const correct = quiz.filter((q, i) => picked[i] === q.answer).length;
  const score = quiz.length ? Math.round((correct / quiz.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Knowledge check" subtitle={`${session.title} · employee view`} actions={<SimBadge />} />

      {submitted && (
        <div className="card mb-5 flex items-center gap-6 p-6">
          <ScoreRing value={score} label="Your score" size={96} />
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <BadgeCheck className="h-5 w-5 text-teal" /> {score >= 70 ? "Ready to take live calls with a buddy" : "Review the process steps and try again"}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {correct} of {quiz.length} correct. Your manager sees this on the readiness dashboard.
            </p>
          </div>
        </div>
      )}

      <ol className="space-y-4">
        {quiz.map((q, i) => (
          <li key={i} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold">
                {i + 1}. {q.q}
              </div>
              <button onClick={() => speak(`${q.q} Options: ${q.options.join(". ")}`)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand" aria-label="Read question aloud">
                <Volume2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {q.options.map((o, j) => {
                const chosen = picked[i] === j;
                const right = submitted && j === q.answer;
                const wrong = submitted && chosen && j !== q.answer;
                return (
                  <button
                    key={j}
                    disabled={submitted}
                    onClick={() => setPicked({ ...picked, [i]: j })}
                    className={`rounded-lg px-3 py-2 text-left text-sm ring-1 transition ${
                      right ? "bg-teal-50 ring-teal" : wrong ? "bg-red-50 ring-red-300" : chosen ? "bg-brand-50 ring-brand" : "ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>

      {!submitted && (
        <button onClick={() => setSubmitted(true)} disabled={Object.keys(picked).length < quiz.length} className="btn-primary mt-5">
          Submit answers
        </button>
      )}
    </div>
  );
}
