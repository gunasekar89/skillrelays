import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Brain, Check, FileAudio, Lightbulb, Loader2, Mic, Pause, Play, ShieldCheck, Square, Upload } from "lucide-react";
import { PageHeader, SimBadge, Waveform } from "../../components/ui";
import { sampleTranscript, type KtSession as Session } from "../../lib/demo";
import { save } from "../../lib/storage";
import { formatClock, speechRecognitionSupported, useAudioRecorder, useSpeechToText } from "../../lib/voice";

const steps = ["Session details", "Record / upload", "AI processing", "Review content", "Publish"];

// Simulated live assistant: nudges the trainer to cover gaps while they talk.
const suggestionRules: [RegExp, string][] = [
  [/verif|otp/i, "What if the customer can't receive the OTP?"],
  [/lost|stolen|block/i, "What if the customer also sees transactions they didn't make?"],
  [/dispute|recognise|merchant/i, "How long can a customer wait before raising a dispute?"],
  [/late|fee|waive/i, "Who approves a waiver if the customer already had one this year?"],
  [/angry|upset|complain/i, "When should a fresher transfer the call to a team leader?"],
  [/limit|increase/i, "How soon can a customer ask for a credit limit increase?"],
  [/reward|points/i, "How do customers redeem their reward points?"],
];

export default function KtSession() {
  const nav = useNavigate();
  const [title, setTitle] = useState("Credit Card Support — New Joiner KT");
  const [trainer, setTrainer] = useState("Meena (Team Leader, Cards)");
  const [tab, setTab] = useState<"record" | "upload">("record");
  const [consent, setConsent] = useState(false);
  const [processing, setProcessing] = useState(-1);
  const [uploadText, setUploadText] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadNote, setUploadNote] = useState("");

  const rec = useAudioRecorder();
  const stt = useSpeechToText();
  const live = rec.status === "recording" || rec.status === "paused";
  const transcript = `${stt.text} ${stt.interim}`.trim();

  const suggestions = useMemo(() => suggestionRules.filter(([re]) => re.test(transcript)).map(([, s]) => s).slice(-3), [transcript]);

  const startRecording = async () => {
    await rec.start();
    if (speechRecognitionSupported()) stt.start();
  };

  useEffect(() => {
    if (rec.status === "paused") stt.stop();
    if (rec.status === "denied") stt.stop();
  }, [rec.status]);

  const stopRecording = () => {
    rec.stop();
    stt.stop();
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 200 * 1024 * 1024) {
      setUploadNote("That file is over the 200 MB demo limit.");
      return;
    }
    setUploadName(f.name);
    if (/\.(txt|vtt|srt|md)$/i.test(f.name)) {
      f.text().then((t) => {
        setUploadText(t.replace(/^\d+\s*$|^[\d:.,]+ --> [\d:.,]+$|^WEBVTT.*$/gm, "").trim());
        setUploadNote("Transcript loaded.");
      });
    } else {
      setUploadText(null);
      setUploadNote("Audio received. Transcribing uploaded audio needs the real AI connection (next step). For now, use a transcript file or the sample.");
    }
  };

  const process = (text: string, source: Session["source"], durationSec: number) => {
    const session: Session = { title, trainer, transcript: text, durationSec, source };
    save("sr.kt", session);
    setProcessing(0);
    const labels = 4;
    for (let i = 1; i <= labels; i++) window.setTimeout(() => setProcessing(i), i * 700);
    window.setTimeout(() => nav("/enterprise/content"), labels * 700 + 400);
  };

  const currentStep = processing >= 0 ? 2 : live || rec.status === "stopped" || uploadName ? 1 : 0;

  if (processing >= 0) {
    const stages = ["Cleaning transcript", "Finding topics and Q&A", "Drafting process steps and FAQ", "Writing assessment quiz"];
    return (
      <div className="mx-auto max-w-lg py-16">
        <div className="card p-8 text-center">
          <Brain className="mx-auto h-10 w-10 text-teal" />
          <h1 className="mt-4 text-xl font-bold">Turning your session into training</h1>
          <ul className="mx-auto mt-6 max-w-xs space-y-3 text-left text-sm">
            {stages.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                {processing > i ? <Check className="h-4 w-4 text-teal" /> : processing === i ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : <span className="h-4 w-4 rounded-full border border-slate-300" />}
                <span className={processing >= i ? "text-navy" : "text-slate-400"}>{s}</span>
              </li>
            ))}
          </ul>
          <SimBadge className="mt-6" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Knowledge transfer session" subtitle="Capture an expert's explanation by voice and turn it into reviewed training." actions={<SimBadge />} />

      <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
        {/* Stepper */}
        <ol className="card h-fit space-y-1 p-3">
          {steps.map((s, i) => (
            <li key={s} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${i === currentStep ? "bg-brand-50 font-semibold text-brand" : "text-slate-500"}`}>
              <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${i < currentStep ? "bg-teal text-white" : i === currentStep ? "bg-brand text-white" : "bg-slate-100"}`}>
                {i < currentStep ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>

        <div className="space-y-5">
          {/* Details */}
          <div className="card grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <label htmlFor="title" className="text-sm font-medium">
                Session title
              </label>
              <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={live} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label htmlFor="trainer" className="text-sm font-medium">
                Trainer
              </label>
              <input id="trainer" value={trainer} onChange={(e) => setTrainer(e.target.value)} disabled={live} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none" />
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex border-b border-slate-100">
              {(
                [
                  ["record", "Record live session", <Mic key="m" className="h-4 w-4" />],
                  ["upload", "Upload recording", <Upload key="u" className="h-4 w-4" />],
                ] as const
              ).map(([key, label, icon]) => (
                <button
                  key={key}
                  disabled={live}
                  onClick={() => setTab(key)}
                  className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${tab === key ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-navy"}`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>

            {tab === "record" ? (
              <div className="grid gap-0 md:grid-cols-[1.3fr_1fr]">
                {/* Recorder */}
                <div className="bg-gradient-to-br from-navy to-navy-700 p-6 text-white">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs text-slate-300">
                      <FileAudio className="h-4 w-4" /> Audio only
                    </span>
                    {live && (
                      <span className="chip bg-white/10 text-white">
                        <span className={`h-2 w-2 rounded-full ${rec.status === "recording" ? "animate-pulse bg-red-500" : "bg-amber-400"}`} />
                        {rec.status === "recording" ? "Recording" : "Paused"} · {formatClock(rec.elapsed)}
                      </span>
                    )}
                  </div>

                  {live && (
                    <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-100">
                      <ShieldCheck className="h-4 w-4" /> Everyone in this session has been told it is being recorded.
                    </div>
                  )}

                  <div className="my-6">
                    <Waveform levels={rec.levels} active={rec.status === "recording"} color="bg-teal" />
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {!live && rec.status !== "stopped" && (
                      <button onClick={startRecording} disabled={!consent || rec.status === "requesting"} className="btn-danger px-6 py-3">
                        {rec.status === "requesting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />} Start recording
                      </button>
                    )}
                    {rec.status === "recording" && (
                      <button onClick={rec.pause} className="btn bg-white text-navy hover:bg-slate-100">
                        <Pause className="h-4 w-4" /> Pause
                      </button>
                    )}
                    {rec.status === "paused" && (
                      <button
                        onClick={() => {
                          rec.resume();
                          if (speechRecognitionSupported()) stt.start();
                        }}
                        className="btn bg-white text-navy hover:bg-slate-100"
                      >
                        <Play className="h-4 w-4" /> Resume
                      </button>
                    )}
                    {live && (
                      <button onClick={stopRecording} className="btn-danger">
                        <Square className="h-4 w-4" /> Stop
                      </button>
                    )}
                  </div>

                  {rec.status === "stopped" && (
                    <div className="space-y-3">
                      {rec.audioUrl && <audio controls src={rec.audioUrl} className="w-full" />}
                      <div className="flex flex-wrap justify-center gap-2">
                        <button onClick={() => process(transcript || sampleTranscript, transcript ? "live" : "sample", rec.elapsed)} className="btn-teal">
                          <Brain className="h-4 w-4" /> Generate training content
                        </button>
                        <button onClick={() => window.location.reload()} className="btn bg-white/10 text-white hover:bg-white/20">
                          Record again
                        </button>
                      </div>
                      {!transcript && <p className="text-center text-xs text-amber-200">No speech was transcribed, so the sample KT transcript will be used.</p>}
                    </div>
                  )}

                  {rec.error && (
                    <p className="mt-4 flex items-start gap-2 rounded-lg bg-red-500/20 p-3 text-xs text-red-100">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {rec.error}
                    </p>
                  )}
                  {!speechRecognitionSupported() && (
                    <p className="mt-4 text-center text-xs text-slate-400">Live transcript needs Chrome or Edge. Recording still works here.</p>
                  )}
                </div>

                {/* Live panel */}
                <div className="flex flex-col p-5">
                  <div className="label">Live transcript</div>
                  <div className="mt-2 h-40 overflow-y-auto rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                    {transcript || <span className="text-slate-400">{live ? "Listening… start explaining." : "The transcript appears here as you speak."}</span>}
                  </div>
                  <div className="label mt-5 flex items-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Questions to cover
                  </div>
                  <ul className="mt-2 space-y-2 text-sm">
                    {suggestions.length ? (
                      suggestions.map((s) => (
                        <li key={s} className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                          {s}
                        </li>
                      ))
                    ) : (
                      <li className="text-slate-400">Suggestions appear as topics come up, so gaps get covered during the session.</li>
                    )}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="p-6">
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-10 text-center hover:border-brand hover:bg-brand-50/40">
                  <Upload className="h-8 w-8 text-slate-400" />
                  <span className="mt-3 text-sm font-semibold">Choose a recording or transcript</span>
                  <span className="mt-1 text-xs text-slate-500">MP3, WAV, MP4, TXT or VTT · up to 200 MB</span>
                  <input type="file" className="sr-only" accept=".mp3,.wav,.mp4,.m4a,.webm,.txt,.vtt,.srt,.md,audio/*,video/mp4" onChange={onFile} />
                </label>
                {uploadName && (
                  <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
                    <div className="font-medium">{uploadName}</div>
                    <div className="mt-1 text-slate-500">{uploadNote}</div>
                  </div>
                )}
                <div className="mt-5 flex flex-wrap gap-2">
                  <button onClick={() => uploadText && process(uploadText, "upload", 0)} disabled={!uploadText} className="btn-teal">
                    <Brain className="h-4 w-4" /> Generate training content
                  </button>
                  <button onClick={() => process(sampleTranscript, "sample", 24 * 60 + 15)} className="btn-ghost">
                    Use sample KT transcript
                  </button>
                </div>
              </div>
            )}

            {tab === "record" && rec.status !== "stopped" && (
              <label className="flex items-start gap-3 border-t border-slate-100 p-4 text-sm">
                <input type="checkbox" checked={consent} disabled={live} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-teal" />
                <span>
                  I have consent from all participants to record this session.
                  <span className="block text-xs text-slate-500">Recording can't start until this is checked. Audio stays in your browser in this demo.</span>
                </span>
              </label>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
