import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, FileText, HelpCircle, ListChecks, Mic, Quote, ScrollText, Wrench } from "lucide-react";
import { PageHeader, SimBadge } from "../../components/ui";
import { generateContent, type KtSession } from "../../lib/demo";
import { publishSession } from "../../lib/knowledge";
import { load, save } from "../../lib/storage";
import { formatClock } from "../../lib/voice";

const tabs = [
  { key: "summary", label: "Summary", icon: <FileText className="h-4 w-4" /> },
  { key: "runbook", label: "Process steps", icon: <Wrench className="h-4 w-4" /> },
  { key: "faq", label: "FAQ", icon: <HelpCircle className="h-4 w-4" /> },
  { key: "quiz", label: "Assessment", icon: <ListChecks className="h-4 w-4" /> },
  { key: "transcript", label: "Transcript", icon: <ScrollText className="h-4 w-4" /> },
] as const;

export default function Content() {
  const [session, setSession] = useState(() => load<KtSession | null>("sr.kt", null));
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("summary");
  const content = useMemo(() => (session ? generateContent(session.transcript) : null), [session]);

  if (!session || !content) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <Mic className="mx-auto h-10 w-10 text-slate-300" />
        <h1 className="mt-4 text-xl font-bold">No training content yet</h1>
        <p className="mt-2 text-sm text-slate-500">Record or upload a KT session and the drafts appear here for review.</p>
        <Link to="/enterprise/kt" className="btn-teal mt-6">
          Start a KT session
        </Link>
      </div>
    );
  }

  const approve = () => {
    const next = { ...session, approved: true };
    save("sr.kt", next);
    publishSession(next);
    setSession(next);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={session.title}
        subtitle={
          <>
            Trainer: {session.trainer} · {session.source === "live" ? "Recorded live" : session.source === "upload" ? "Uploaded transcript" : "Sample session"}
            {session.durationSec ? ` · ${formatClock(session.durationSec)}` : ""}
          </>
        }
        actions={
          <>
            <SimBadge />
            {session.approved ? (
              <span className="chip bg-teal-50 px-3 py-1.5 text-sm text-teal-700">
                <BadgeCheck className="h-4 w-4" /> Approved and published
              </span>
            ) : (
              <span className="chip bg-amber-50 px-3 py-1.5 text-sm text-amber-700">Draft · needs trainer review</span>
            )}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="card">
          <div className="flex overflow-x-auto border-b border-slate-100">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${tab === t.key ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-navy"}`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {tab === "summary" && (
              <div>
                <h2 className="font-semibold">Training summary</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{content.summary}</p>
                <h3 className="mt-6 font-semibold">Key topics covered</h3>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-slate-600">
                  {content.topics.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
                {content.openQuestions.length > 0 && (
                  <>
                    <h3 className="mt-6 font-semibold">Unanswered questions</h3>
                    <ul className="mt-2 space-y-2 text-sm">
                      {content.openQuestions.map((q) => (
                        <li key={q} className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                          {q}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {tab === "runbook" && (
              <div>
                <h2 className="font-semibold">Process steps draft</h2>
                {content.runbook.length ? (
                  <ol className="mt-3 space-y-3">
                    {content.runbook.map((r, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand">{i + 1}</span>
                        <div>
                          <div className="text-sm">{r.step}</div>
                          <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                            <Quote className="h-3 w-3" /> Source: transcript {r.source}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No step-by-step instructions were found in this session.</p>
                )}
              </div>
            )}

            {tab === "faq" && (
              <div>
                <h2 className="font-semibold">Frequently asked questions</h2>
                {content.faq.length ? (
                  <dl className="mt-3 space-y-4">
                    {content.faq.map((f) => (
                      <div key={f.q}>
                        <dt className="text-sm font-semibold">{f.q}</dt>
                        <dd className="mt-1 text-sm text-slate-600">{f.a}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No questions were asked during this session.</p>
                )}
              </div>
            )}

            {tab === "quiz" && (
              <div>
                <h2 className="font-semibold">Assessment quiz ({content.quiz.length} questions)</h2>
                <ol className="mt-3 space-y-5">
                  {content.quiz.map((q, i) => (
                    <li key={i}>
                      <div className="text-sm font-medium">
                        {i + 1}. {q.q}
                      </div>
                      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                        {q.options.map((o, j) => (
                          <li key={j} className={`rounded-lg px-3 py-2 text-sm ring-1 ${j === q.answer ? "bg-teal-50 ring-teal" : "ring-slate-200"}`}>
                            {o}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {tab === "transcript" && <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{session.transcript}</p>}
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <div className="label">Review</div>
            <p className="mt-2 text-sm text-slate-600">Check each tab. Every process step links back to the transcript it came from. Nothing reaches employees until you approve it. Approving also adds it to the AI assistant's documents.</p>
            {session.approved ? (
              <div className="mt-4 grid gap-2">
                <Link to="/enterprise/assistant" className="btn-primary w-full">
                  Ask the AI assistant
                </Link>
                <Link to="/enterprise/learn" className="btn-teal w-full">
                  Open employee quiz
                </Link>
              </div>
            ) : (
              <button onClick={approve} className="btn-primary mt-4 w-full">
                <BadgeCheck className="h-4 w-4" /> Approve & publish
              </button>
            )}
          </div>
          <div className="card p-5">
            <div className="label">Generated assets</div>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex justify-between">
                <span>Topics</span>
                <span className="font-semibold">{content.topics.length}</span>
              </li>
              <li className="flex justify-between">
                <span>Process steps</span>
                <span className="font-semibold">{content.runbook.length}</span>
              </li>
              <li className="flex justify-between">
                <span>FAQ entries</span>
                <span className="font-semibold">{content.faq.length}</span>
              </li>
              <li className="flex justify-between">
                <span>Quiz questions</span>
                <span className="font-semibold">{content.quiz.length}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
