import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpenCheck, Brain, Check, CircleHelp, Lightbulb, Loader2, Mic, MicOff, RotateCcw, Sparkles, Volume2, X } from "lucide-react";
import { ScoreRing } from "./ui";
import type { Note } from "../lib/notes";
import {
  INTERVALS,
  LAST_STEP,
  REASONS,
  addMiss,
  coach,
  coachQuestion,
  explainBack,
  isDue,
  loadReviews,
  markReview,
  saveReviews,
  topReason,
  type CoachResult,
  type ExplainResult,
  type MissReason,
  type ReviewItem,
} from "../lib/study";
import { speak, speechRecognitionSupported, useSpeechToText } from "../lib/voice";

function Provider({ r }: { r: { provider: string; model?: string | null } }) {
  return (
    <div className="mt-2 text-[11px] text-slate-400">
      {r.provider}
      {r.model ? ` · ${r.model}` : ""}
    </div>
  );
}

/** A text box the learner can type into or speak into. */
function AnswerBox({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder: string; rows?: number }) {
  const stt = useSpeechToText();
  const base = useRef("");
  useEffect(() => {
    if (stt.listening) onChange(`${base.current}${stt.text} ${stt.interim}`.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stt.text, stt.interim, stt.listening]);
  const toggle = () => {
    if (stt.listening) return stt.stop();
    base.current = value ? `${value.trimEnd()} ` : "";
    stt.reset();
    stt.start();
  };
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={stt.listening ? "Listening…" : placeholder}
        className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 pr-11 text-sm focus:border-brand focus:outline-none"
      />
      {speechRecognitionSupported() && (
        <button
          type="button"
          onClick={toggle}
          className={`absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full ${stt.listening ? "bg-red-500 text-white" : "bg-slate-100 text-slate-600"}`}
          aria-label={stt.listening ? "Stop listening" : "Answer by voice"}
        >
          {stt.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

const STEP_LABELS = ["Nudge", "Where to look", "Partial answer", "Answer"];

const VERDICT_STYLE: Record<string, string> = {
  correct: "bg-teal-50 text-teal-900 ring-teal/30",
  partly: "bg-amber-50 text-amber-900 ring-amber-200",
  not_yet: "bg-slate-50 text-slate-800 ring-slate-200",
  none: "bg-slate-50 text-slate-800 ring-slate-200",
};

// ---------- Study Coach: try first, then one hint at a time ----------

export function StudyCoach({ note, initialQuestion = "" }: { note: Note; initialQuestion?: string }) {
  const [question, setQuestion] = useState(initialQuestion);
  const [asked, setAsked] = useState<string[]>([]);
  const [attempt, setAttempt] = useState("");
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<CoachResult | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [busy, setBusy] = useState<"question" | "check" | "hint" | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const finished = !!result?.answer;

  const reset = (q: string) => {
    setQuestion(q);
    setAttempt("");
    setStep(0);
    setResult(null);
    setHints([]);
    setSaved(false);
    setError("");
  };

  const newQuestion = async () => {
    setBusy("question");
    setError("");
    try {
      const { question: q } = await coachQuestion(note, asked);
      setAsked((a) => [...a, q]);
      reset(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't get a question.");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!initialQuestion) newQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async (nextStep: number, kind: "check" | "hint") => {
    setBusy(kind);
    setError("");
    try {
      const r = await coach(note, question, attempt, nextStep);
      setStep(r.step);
      setResult(r);
      if (r.hint) setHints((h) => [...h.slice(0, Math.max(0, nextStep - 1)), r.hint]);
      // Needed the answer shown: it goes on the revision list, to come back tomorrow.
      if (r.answer && r.verdict !== "correct" && !saved) {
        addMiss(note, question, r.answer);
        setSaved(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex items-start gap-2 rounded-xl bg-brand-50 p-3">
        <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          {busy === "question" ? (
            <span className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Picking a question from your notes…
            </span>
          ) : (
            <input
              value={question}
              onChange={(e) => reset(e.target.value)}
              placeholder="Type a question, or get one from your notes"
              className="w-full bg-transparent text-sm font-medium text-navy placeholder:font-normal focus:outline-none"
            />
          )}
        </div>
      </div>

      {/* Hint ladder progress */}
      <div className="mt-3 flex gap-1" aria-label={`Hint ${step} of ${LAST_STEP}`}>
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex-1">
            <div className={`h-1.5 rounded-full ${i < step ? (i === LAST_STEP - 1 ? "bg-amber-400" : "bg-brand") : "bg-slate-200"}`} />
            <div className="mt-1 text-center text-[10px] text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      <div className="mt-2">
        <AnswerBox value={attempt} onChange={setAttempt} placeholder="Your answer first, even a guess. Trying to remember is what makes it stick." />
      </div>

      {hints.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {hints.map((h, i) => (
            <li key={i} className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="font-semibold">Hint {i + 1}: </span>
                {h}
              </span>
            </li>
          ))}
        </ul>
      )}

      {result && (
        <div className={`mt-3 rounded-xl p-3 text-sm ring-1 ${VERDICT_STYLE[result.verdict]}`}>
          <p>{result.feedback}</p>
          {result.answer && (
            <p className="mt-2">
              <span className="font-semibold">Answer from your notes: </span>
              {result.answer}
            </p>
          )}
          {result.verdict === "correct" && <p className="mt-1 text-xs">{step === 0 ? "You got it without any hints." : `You got it with ${step} hint${step > 1 ? "s" : ""}.`}</p>}
          {saved && <p className="mt-1 text-xs">Added to your revision list. It will come back tomorrow.</p>}
        </div>
      )}
      {error && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {!finished ? (
          <>
            <button onClick={() => send(step, "check")} disabled={!attempt.trim() || !question.trim() || busy !== null} className="btn-primary flex-1">
              {busy === "check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Check my answer
            </button>
            <button
              onClick={() => send(step + 1, "hint")}
              disabled={!attempt.trim() || !question.trim() || busy !== null}
              className="btn-ghost"
              title={attempt.trim() ? "" : "Have a go first, then ask for a hint"}
            >
              {busy === "hint" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
              {step + 1 === LAST_STEP ? "Show answer" : "Hint"}
            </button>
          </>
        ) : (
          <button onClick={newQuestion} disabled={busy !== null} className="btn-primary flex-1">
            <Sparkles className="h-4 w-4" /> Next question
          </button>
        )}
      </div>
      {!attempt.trim() && !finished && <p className="mt-2 text-xs text-slate-400">Hints unlock once you've had a go.</p>}
      {result && <Provider r={result} />}
    </div>
  );
}

// ---------- Explain it back: say it in your own words, then see what was missed ----------

export function ExplainBack({ note, onCoach }: { note: Note; onCoach: (question: string) => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ExplainResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const check = async () => {
    setBusy(true);
    setError("");
    try {
      setResult(await explainBack(note, text));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const color = result.score >= 80 ? "#14B8A6" : result.score >= 50 ? "#F59E0B" : "#EF4444";
    return (
      <div>
        <div className="flex items-center gap-4">
          <ScoreRing value={result.score} size={76} color={color} />
          <p className="flex-1 text-sm">{result.feedback}</p>
        </div>
        <List title="You explained" items={result.covered} tone="text-teal-700" icon={<Check className="h-3.5 w-3.5" />} />
        <List title="You missed" items={result.missed} tone="text-amber-700" icon={<CircleHelp className="h-3.5 w-3.5" />} />
        <List title="Check these" items={result.mistakes} tone="text-red-600" icon={<X className="h-3.5 w-3.5" />} />
        {result.follow_up && (
          <div className="mt-3 rounded-xl bg-brand-50 p-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-brand">Follow-up question</div>
            <p className="mt-1">{result.follow_up}</p>
            <button onClick={() => onCoach(result.follow_up)} className="btn-ghost mt-2">
              <Brain className="h-4 w-4" /> Answer it with the Study Coach
            </button>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <button onClick={() => (setResult(null), setText(""))} className="btn-primary flex-1">
            <RotateCcw className="h-4 w-4" /> Explain again
          </button>
          <button onClick={() => speak(`${result.feedback} ${result.missed.length ? `You missed: ${result.missed.join(". ")}` : ""}`)} className="btn-ghost px-3" aria-label="Read feedback aloud">
            <Volume2 className="h-4 w-4" />
          </button>
        </div>
        <Provider r={result} />
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-slate-600">
        Explain <span className="font-semibold">{note.title || "this note"}</span> in your own words, as if teaching a friend. Try not to look at your notes. Tap the mic to say it out loud, like in an interview.
      </p>
      <div className="mt-3">
        <AnswerBox value={text} onChange={setText} rows={6} placeholder="Start explaining…" />
      </div>
      {error && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">{error}</p>}
      <button onClick={check} disabled={text.trim().split(/\s+/).length < 5 || busy} className="btn-primary mt-3 w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpenCheck className="h-4 w-4" />} Check my explanation
      </button>
    </div>
  );
}

function List({ title, items, tone, icon }: { title: string; items: string[]; tone: string; icon: ReactNode }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <div className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{title}</div>
      <ul className="mt-1 space-y-1">
        {items.map((x, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <span className={`mt-0.5 shrink-0 ${tone}`}>{icon}</span>
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Smart revision: missed items come back after 1, 3 and 7 days ----------

export function ReasonPicker({ onPick, picked }: { onPick: (r: MissReason) => void; picked?: MissReason | null }) {
  return (
    <div className="mt-2">
      <div className="text-xs text-slate-500">Why did you miss it?</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {REASONS.map((r) => (
          <button
            key={r.id}
            onClick={() => onPick(r.id)}
            className={`rounded-full px-2.5 py-1 text-xs ring-1 ${picked === r.id ? "bg-brand text-white ring-brand" : "ring-slate-200 hover:bg-slate-50"}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {picked && <p className="mt-1.5 text-xs text-slate-600">{REASONS.find((r) => r.id === picked)?.tip}</p>}
    </div>
  );
}

const when = (iso: string) => {
  const days = Math.round((new Date(iso).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
};

export function Revision() {
  const [items, setItems] = useState<ReviewItem[]>(loadReviews);
  const [practiseAll, setPractiseAll] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [guess, setGuess] = useState("");
  const [shown, setShown] = useState(false);
  const [missed, setMissed] = useState<ReviewItem | null>(null);
  const [reason, setReason] = useState<MissReason | null>(null);
  const [doneCount, setDoneCount] = useState(0);

  useEffect(() => saveReviews(items), [items]);

  const queue = items.filter((x) => !seen.has(x.id) && (practiseAll || isDue(x)));
  const card = missed ?? queue[0];
  const tip = topReason(items);

  const next = () => {
    setGuess("");
    setShown(false);
    setMissed(null);
    setReason(null);
    setDoneCount((n) => n + 1);
  };

  const answer = (remembered: boolean) => {
    if (!card) return;
    setSeen((s) => new Set(s).add(card.id));
    if (remembered) {
      setItems((xs) => markReview(xs, card.id, true));
      next();
    } else {
      setMissed(card); // keep it on screen while they say why
      setItems((xs) => markReview(xs, card.id, false));
    }
  };

  if (!items.length) {
    return (
      <p className="text-sm text-slate-500">
        Your revision list is empty. Questions you miss in a quiz, cards you mark "Still learning", and answers the Study Coach had to show you will appear here, and come back after 1, 3 and 7 days.
      </p>
    );
  }

  if (!card) {
    const upcoming = [...items].sort((a, b) => a.due.localeCompare(b.due));
    return (
      <div>
        <div className="py-3 text-center">
          <BookOpenCheck className="mx-auto h-9 w-9 text-teal" />
          <p className="mt-2 font-semibold">{doneCount ? `Done! You reviewed ${doneCount} item${doneCount > 1 ? "s" : ""}.` : "Nothing due today."}</p>
          <p className="text-sm text-slate-500">Come back tomorrow. Short daily reviews beat cramming.</p>
        </div>
        {tip && <p className="rounded-lg bg-brand-50 p-3 text-xs text-slate-700"><span className="font-semibold">Your most common mistake: {tip.label.toLowerCase()}.</span> {tip.tip}</p>}
        <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Coming up</div>
        <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-sm">
          {upcoming.map((x) => (
            <li key={x.id} className="flex justify-between gap-2">
              <span className="truncate">{x.front}</span>
              <span className="shrink-0 text-xs text-slate-400">{when(x.due)}</span>
            </li>
          ))}
        </ul>
        <button onClick={() => (setPractiseAll(true), setSeen(new Set()), setDoneCount(0))} className="btn-ghost mt-3 w-full">
          Practise them all now
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{queue.length + (missed ? 1 : 0)} left</span>
        <span title={`From "${card.noteTitle}". If you remember it, it comes back in ${INTERVALS[Math.min(card.box + 1, 3)]} days.`}>Step {card.box} of 3</span>
      </div>
      <p className="mt-2 rounded-xl bg-white p-4 font-medium shadow-card ring-1 ring-slate-200">{card.front}</p>
      {!shown ? (
        <>
          <div className="mt-3">
            <AnswerBox value={guess} onChange={setGuess} rows={2} placeholder="Say or type your answer first (optional)" />
          </div>
          <button onClick={() => setShown(true)} className="btn-primary mt-2 w-full">
            Show answer
          </button>
        </>
      ) : (
        <>
          <p className="mt-3 rounded-xl bg-teal-50 p-3 text-sm text-teal-900">{card.back}</p>
          {missed ? (
            <>
              <ReasonPicker picked={reason} onPick={(r) => (setReason(r), setItems((xs) => xs.map((x) => (x.id === missed.id ? { ...x, reasons: [...x.reasons, r] } : x))))} />
              <button onClick={next} className="btn-primary mt-3 w-full">
                Next
              </button>
            </>
          ) : (
            <div className="mt-3 flex gap-2">
              <button onClick={() => answer(true)} className="btn-teal flex-1">
                <Check className="h-4 w-4" /> I remembered
              </button>
              <button onClick={() => answer(false)} className="btn-ghost flex-1">
                <X className="h-4 w-4" /> I forgot
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
