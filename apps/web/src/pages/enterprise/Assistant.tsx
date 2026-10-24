import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { AlertCircle, Bot, FileText, Loader2, Mic, Plug, Quote, Send, Trash2, Upload, Volume2 } from "lucide-react";
import { PageHeader, SimBadge } from "../../components/ui";
import type { KtSession } from "../../lib/demo";
import { acceptedTypes, askAi, getAiStatus, readDocument, retrieve, simulatedAnswer, type AiStatus, type Passage, type TrainingDoc } from "../../lib/docs";
import { load, save } from "../../lib/storage";
import { speak } from "../../lib/voice";

type Message = { role: "user" | "assistant"; content: string; sources?: Passage[]; via?: string; error?: boolean };

const starters = ["What should I do if a customer's card is lost?", "Can I ask the customer for their OTP?", "When should I escalate a call?"];

const timeAgo = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

export default function Assistant() {
  const [docs, setDocs] = useState(() => load<TrainingDoc[]>("sr.docs", []));
  const [messages, setMessages] = useState(() => load<Message[]>("sr.chat", []));
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadNote, setUploadNote] = useState<{ text: string; error?: boolean } | null>(null);
  const kt = useMemo(() => load<KtSession | null>("sr.kt", null), []);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => void getAiStatus().then(setStatus), []);
  useEffect(() => save("sr.docs", docs), [docs]);
  useEffect(() => {
    save("sr.chat", messages);
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // The KT transcript counts as a training source too, once one exists.
  const sources = useMemo(() => [...docs, ...(kt ? [{ name: `KT: ${kt.title}`, text: kt.transcript }] : [])], [docs, kt]);

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    const notes: string[] = [];
    let failed = false;
    let next = docs;
    for (const f of files) {
      try {
        const text = await readDocument(f);
        const existing = next.find((d) => d.name === f.name);
        // Re-uploading a file with the same name replaces the old version.
        next = existing
          ? next.map((d) => (d === existing ? { ...d, text, updatedAt: Date.now(), version: d.version + 1 } : d))
          : [...next, { id: crypto.randomUUID(), name: f.name, text, updatedAt: Date.now(), version: 1 }];
        notes.push(existing ? `Updated ${f.name} to version ${existing.version + 1}.` : `Added ${f.name}.`);
      } catch (err) {
        notes.push(`${f.name}: ${err instanceof Error ? err.message : "couldn't be read."}`);
        failed = true;
      }
    }
    setDocs(next);
    setUploadNote({ text: notes.join(" "), error: failed });
  };

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setQuestion("");
    const history = messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    const passages = retrieve(q, sources);
    try {
      const ai = await askAi(q, history, passages);
      const reply: Message = ai
        ? { role: "assistant", content: ai.answer, sources: passages, via: ai.provider }
        : { role: "assistant", content: simulatedAnswer(q, passages), sources: passages, via: "Simulated" };
      setMessages((m) => [...m, reply]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: err instanceof Error ? err.message : "The AI request failed.", error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(question);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Knowledge Assistant"
        subtitle="Upload training documents, then ask questions. Answers come only from your documents and cite their sources."
        actions={
          status?.connected ? (
            <span className="chip bg-teal-50 px-3 py-1.5 text-sm text-teal-700" title={`Model: ${status.model}`}>
              <Plug className="h-4 w-4" /> Connected to {status.provider}
            </span>
          ) : status ? (
            <SimBadge />
          ) : null
        }
      />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <div className="card p-5">
            <div className="label">Training documents</div>
            <label className="mt-3 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-6 text-center hover:border-brand hover:bg-brand-50/40">
              <Upload className="h-6 w-6 text-brand" />
              <span className="text-sm font-semibold">Upload or update documents</span>
              <span className="text-xs text-slate-500">Word (.docx), text, Markdown, CSV, VTT or SRT. Uploading the same file name replaces the old version.</span>
              <input type="file" multiple className="sr-only" accept={acceptedTypes} onChange={onFiles} />
            </label>
            {uploadNote && (
              <p className={`mt-3 flex gap-2 rounded-lg px-3 py-2 text-xs ${uploadNote.error ? "bg-red-50 text-red-700" : "bg-teal-50 text-teal-800"}`}>
                {uploadNote.error && <AlertCircle className="h-4 w-4 shrink-0" />} {uploadNote.text}
              </p>
            )}

            <ul className="mt-4 space-y-2">
              {docs.map((d) => (
                <li key={d.id} className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium" title={d.name}>
                      {d.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      v{d.version} · {Math.max(1, Math.round(d.text.length / 1000))}k chars · {timeAgo(d.updatedAt)}
                    </div>
                  </div>
                  <button onClick={() => setDocs(docs.filter((x) => x.id !== d.id))} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-red-500" aria-label={`Remove ${d.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
              {kt && (
                <li className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <Mic className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{kt.title}</div>
                    <div className="text-xs text-slate-500">KT session transcript · included automatically</div>
                  </div>
                </li>
              )}
              {!docs.length && !kt && <li className="text-sm text-slate-500">No documents yet. Upload one to start asking questions.</li>}
            </ul>
          </div>

          {status && !status.connected && (
            <div className="card p-5 text-sm text-slate-600">
              <div className="label">Connect an AI tool</div>
              <p className="mt-2">
                Answers are simulated right now. To use a real model, copy <code className="rounded bg-slate-100 px-1">apps/web/.env.example</code> to{" "}
                <code className="rounded bg-slate-100 px-1">.env.local</code>, add an Azure OpenAI, OpenAI or Claude key, and restart <code className="rounded bg-slate-100 px-1">npm run dev</code>.
              </p>
            </div>
          )}
        </div>

        <div className="card flex min-h-[560px] flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Bot className="h-5 w-5 text-brand" /> Ask about your training
            </div>
            {messages.length > 0 && (
              <button onClick={() => setMessages([])} className="text-xs font-medium text-slate-500 hover:text-navy">
                Clear chat
              </button>
            )}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {!messages.length && (
              <div className="py-10 text-center">
                <Bot className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm text-slate-500">{sources.length ? "Try one of these:" : "Upload a training document on the left first."}</p>
                {sources.length > 0 && (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {starters.map((s) => (
                      <button key={s} onClick={() => void ask(s)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700 hover:bg-brand-50 hover:text-brand">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-sm text-white">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="max-w-[90%]">
                  <div className={`whitespace-pre-line rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed ${m.error ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-800"}`}>
                    {m.content}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 px-1 text-xs text-slate-400">
                    {m.via && <span>{m.via === "Simulated" ? "Simulated answer" : `Answered by ${m.via}`}</span>}
                    {!m.error && (
                      <button onClick={() => speak(m.content.replace(/\[\d+\]/g, ""))} className="flex items-center gap-1 hover:text-brand">
                        <Volume2 className="h-3.5 w-3.5" /> Read aloud
                      </button>
                    )}
                  </div>
                  {m.sources && m.sources.length > 0 && (
                    <details className="mt-2 px-1">
                      <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-navy">Sources ({m.sources.length})</summary>
                      <ol className="mt-2 space-y-2">
                        {m.sources.map((s) => (
                          <li key={s.id} className="rounded-lg ring-1 ring-slate-200 px-3 py-2 text-xs">
                            <div className="flex items-center gap-1 font-semibold text-slate-700">
                              <Quote className="h-3 w-3" /> [{s.id}] {s.source}
                            </div>
                            <p className="mt-1 line-clamp-3 text-slate-500">{s.text}</p>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </div>
              ),
            )}

            {busy && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching your documents…
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={submit} className="flex gap-2 border-t border-slate-100 p-4">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={sources.length ? "Ask a question about the training…" : "Upload a document first"}
              disabled={!sources.length}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none disabled:bg-slate-50"
              aria-label="Your question"
            />
            <button type="submit" disabled={!question.trim() || busy || !sources.length} className="btn-primary">
              <Send className="h-4 w-4" /> Ask
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
