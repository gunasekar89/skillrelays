import { useCallback, useEffect, useRef, useState } from "react";

// ---------- Audio recording (MediaRecorder, audio only) ----------

export type RecorderStatus = "idle" | "requesting" | "recording" | "paused" | "stopped" | "denied" | "unsupported";

export function useAudioRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(32).fill(0.05));
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const ctx = useRef<AudioContext | null>(null);
  const raf = useRef<number>(0);
  const timer = useRef<number>(0);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(raf.current);
    window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    ctx.current?.close().catch(() => undefined);
    stream.current = null;
    ctx.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("unsupported");
      setError("This browser can't record audio. Try Chrome or Edge, or upload a recording instead.");
      return;
    }
    setStatus("requesting");
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;

      const audioCtx = new AudioContext();
      ctx.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      audioCtx.createMediaStreamSource(s).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        setLevels(Array.from(data, (v) => Math.max(0.05, v / 255)));
        raf.current = requestAnimationFrame(tick);
      };
      tick();

      chunks.current = [];
      const rec = new MediaRecorder(s);
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        setAudioUrl(URL.createObjectURL(blob));
      };
      rec.start(1000);
      recorder.current = rec;

      setElapsed(0);
      timer.current = window.setInterval(() => {
        if (recorder.current?.state === "recording") setElapsed((e) => e + 1);
      }, 1000);
      setStatus("recording");
    } catch {
      cleanup();
      setStatus("denied");
      setError("Microphone permission was blocked. Allow it in your browser's address bar and try again.");
    }
  }, [cleanup]);

  const pause = useCallback(() => {
    recorder.current?.pause();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    recorder.current?.resume();
    setStatus("recording");
  }, []);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    cleanup();
    setLevels(Array(32).fill(0.05));
    setStatus("stopped");
  }, [cleanup]);

  return { status, elapsed, levels, audioUrl, error, start, pause, resume, stop };
}

// ---------- Live speech-to-text (browser Web Speech API) ----------

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

export const speechRecognitionSupported = () => getRecognitionCtor() !== null;

export function useSpeechToText() {
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const wanted = useRef(false);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return false;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) setFinalText((t) => (t + " " + res[0].transcript).trim());
        else live += res[0].transcript;
      }
      setInterim(live);
    };
    // Chrome ends recognition after silence; restart while the user still wants it.
    r.onend = () => {
      if (wanted.current) r.start();
      else setListening(false);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed") {
        wanted.current = false;
        setListening(false);
      }
    };
    wanted.current = true;
    rec.current = r;
    r.start();
    setListening(true);
    return true;
  }, []);

  const stop = useCallback(() => {
    wanted.current = false;
    rec.current?.stop();
    setInterim("");
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    setFinalText("");
    setInterim("");
  }, []);

  useEffect(() => () => {
    wanted.current = false;
    rec.current?.stop();
  }, []);

  return { text: finalText, interim, listening, start, stop, reset, setText: setFinalText };
}

// ---------- AI voice output (browser speech synthesis) ----------

export function speak(text: string, onEnd?: () => void) {
  if (!("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  const voice = window.speechSynthesis.getVoices().find((v) => /en-(US|GB)/.test(v.lang) && /Google|Natural|Samantha|Aria/i.test(v.name));
  if (voice) u.voice = voice;
  u.onend = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

export function formatClock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
