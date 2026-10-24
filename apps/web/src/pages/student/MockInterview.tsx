import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Check, Clock, Keyboard, Mic, MicOff, SkipForward, Square, Volume2 } from "lucide-react";
import { PageHeader, SimBadge, SpeakingBars } from "../../components/ui";
import { interviewTracks, interviewerReply, type Answer } from "../../lib/demo";
import { save } from "../../lib/storage";
import { formatClock, speak, speechRecognitionSupported, stopSpeaking, useSpeechToText } from "../../lib/voice";

type Turn = { who: "ai" | "you"; text: string };
type Phase = "setup" | "ai-speaking" | "listening" | "done";

export default function MockInterview() {
  const nav = useNavigate();
  const [trackKey, setTrackKey] = useState<keyof typeof interviewTracks>("kubernetes");
  const [voiceOn, setVoiceOn] = useState(true);
  const [phase, setPhase] = useState<Phase>("setup");
  const [index, setIndex] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const answerStart = useRef(0);
  const stt = useSpeechToText();
  const sttSupported = speechRecognitionSupported();
  const logEnd = useRef<HTMLDivElement>(null);

  const track = interviewTracks[trackKey];
  const question = track.questions[index];

  useEffect(() => {
    if (phase === "setup" || phase === "done") return;
    const t = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, stt.interim]);
  useEffect(() => () => stopSpeaking(), []);

  // The interviewer says something, then hands the floor back to the candidate.
  const aiSay = (text: string, then: () => void) => {
    setTurns((t) => [...t, { who: "ai", text }]);
    setPhase("ai-speaking");
    if (voiceOn) speak(text, then);
    else window.setTimeout(then, 600);
  };

  const listen = () => {
    stt.reset();
    answerStart.current = Date.now();
    setPhase("listening");
    if (voiceOn && sttSupported) stt.start();
  };

  const begin = () => {
    setTurns([]);
    setAnswers([]);
    setIndex(0);
    setElapsed(0);
    aiSay(`Hi Sneha, I'm your interviewer today. We'll do ${track.questions.length} questions for a ${track.role} role. Answer out loud, take your time. First question. ${track.questions[0].prompt}`, listen);
  };

  const submitAnswer = (skipped = false) => {
    stt.stop();
    const text = skipped ? "" : `${stt.text} ${stt.interim}`.trim();
    const seconds = Math.round((Date.now() - answerStart.current) / 1000);
    const next = [...answers];
    if (!skipped) {
      next.push({ questionId: question.id, prompt: question.prompt, text, seconds });
      setTurns((t) => [...t, { who: "you", text: text || "(no answer captured)" }]);
    } else {
      setTurns((t) => [...t, { who: "you", text: "(skipped)" }]);
    }
    setAnswers(next);

    const last = index === track.questions.length - 1;
    const reaction = skipped ? "No problem, let's move on." : interviewerReply(text, question);
    if (last) {
      aiSay(`${reaction} That's the end of the interview. Nice work. I'll put your feedback together now.`, () => finish(next));
    } else {
      const nq = track.questions[index + 1];
      setIndex(index + 1);
      aiSay(`${reaction} Next question. ${nq.prompt}`, listen);
    }
  };

  const finish = (final: Answer[]) => {
    stopSpeaking();
    stt.stop();
    setPhase("done");
    save("sr.interview", { track: trackKey, answers: final, elapsed });
    nav("/student/results");
  };

  if (phase === "setup") {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Mock interview setup" subtitle="A voice conversation with an AI interviewer. Audio only, nothing is uploaded." actions={<SimBadge />} />
        <div className="card p-6">
          <div className="label">Interview type</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {Object.entries(interviewTracks).map(([key, t]) => (
              <button
                key={key}
                onClick={() => setTrackKey(key as keyof typeof interviewTracks)}
                className={`rounded-xl p-4 text-left ring-1 transition ${trackKey === key ? "bg-brand-50 ring-brand" : "ring-slate-200 hover:bg-slate-50"}`}
                aria-pressed={trackKey === key}
              >
                <div className="font-semibold">{t.title}</div>
                <div className="text-sm text-slate-500">
                  {t.role} · {t.questions.length} questions
                </div>
              </button>
            ))}
          </div>
          <label className="mt-6 flex items-center gap-3 text-sm">
            <input type="checkbox" checked={voiceOn} onChange={(e) => setVoiceOn(e.target.checked)} className="h-4 w-4 accent-brand" />
            Use voice (the interviewer speaks, and you answer with your microphone)
          </label>
          {voiceOn && !sttSupported && (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Your browser doesn't support live speech-to-text. The interviewer will still speak, and you can type your answers. Chrome or Edge gives the full
              voice experience.
            </p>
          )}
          <button onClick={begin} className="btn-primary mt-6 px-6 py-3">
            <Mic className="h-4 w-4" /> Start interview
          </button>
        </div>
      </div>
    );
  }

  const listening = phase === "listening";
  const liveText = `${stt.text} ${stt.interim}`.trim();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={track.title}
        subtitle={`${track.role} · Question ${index + 1} of ${track.questions.length}`}
        actions={
          <>
            <SimBadge />
            <span className="chip bg-white text-navy ring-1 ring-slate-200">
              <Clock className="h-3 w-3" /> {formatClock(elapsed)}
            </span>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Conversation */}
        <div className="card flex min-h-[460px] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5" style={{ maxHeight: 520 }}>
            {turns.map((t, i) => (
              <div key={i} className={`flex gap-3 ${t.who === "you" ? "flex-row-reverse" : ""}`}>
                <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${t.who === "ai" ? "bg-navy text-white" : "bg-brand text-white"}`}>
                  {t.who === "ai" ? <Bot className="h-4 w-4" /> : "S"}
                </div>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${t.who === "ai" ? "bg-slate-100" : "bg-brand text-white"}`}>{t.text}</div>
              </div>
            ))}
            {listening && (
              <div className="flex flex-row-reverse gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">S</div>
                <div className="max-w-[80%] rounded-2xl border-2 border-dashed border-brand/40 px-4 py-2.5 text-sm text-slate-600">
                  {liveText || (stt.listening ? "Listening…" : "Type your answer below")}
                </div>
              </div>
            )}
            <div ref={logEnd} />
          </div>

          {listening && (
            <div className="border-t border-slate-100 p-4">
              {(!voiceOn || !sttSupported || !stt.listening) && (
                <div className="mb-3">
                  <label htmlFor="answer" className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <Keyboard className="h-3.5 w-3.5" /> Your answer
                  </label>
                  <textarea
                    id="answer"
                    rows={3}
                    value={stt.text}
                    onChange={(e) => stt.setText(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    placeholder="Speak, or type your answer here…"
                  />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => submitAnswer()} className="btn-primary" disabled={!liveText}>
                  <Check className="h-4 w-4" /> Done answering
                </button>
                {voiceOn && sttSupported && (
                  <button onClick={() => (stt.listening ? stt.stop() : stt.start())} className="btn-ghost">
                    {stt.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {stt.listening ? "Pause mic" : "Resume mic"}
                  </button>
                )}
                <button onClick={() => submitAnswer(true)} className="btn-ghost">
                  <SkipForward className="h-4 w-4" /> Skip
                </button>
                <button onClick={() => finish(answers)} className="btn-ghost ml-auto text-red-600">
                  <Square className="h-4 w-4" /> End
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Status panel */}
        <div className="space-y-5">
          <div className="card p-5 text-center">
            <div className="label">Now</div>
            <div className="mt-4 flex justify-center">
              {phase === "ai-speaking" ? (
                <SpeakingBars active />
              ) : (
                <span className={`relative grid h-16 w-16 place-items-center rounded-full ${stt.listening ? "bg-red-500" : "bg-slate-200"} text-white`}>
                  {stt.listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-40" />}
                  <Mic className="relative h-7 w-7" />
                </span>
              )}
            </div>
            <div className="mt-3 text-sm font-semibold">
              {phase === "ai-speaking" ? "Interviewer is speaking" : stt.listening ? "Listening to you" : "Your turn"}
            </div>
            {phase === "ai-speaking" && voiceOn && (
              <button
                className="mt-3 inline-flex items-center gap-1 text-xs text-brand hover:underline"
                onClick={() => {
                  stopSpeaking();
                  listen();
                }}
              >
                <Volume2 className="h-3 w-3" /> Skip to my turn
              </button>
            )}
          </div>
          <div className="card p-5">
            <div className="label">Tips</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>Start with a one-line answer, then explain.</li>
              <li>Name real commands, tools and trade-offs.</li>
              <li>Use an example from your own work.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
