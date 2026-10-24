import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Bot, FilePlus2, FileText, Loader2, Mic, MicOff, Pencil, Send, Trash2, Upload, Volume2, VolumeX, X } from "lucide-react";
import { PageHeader } from "../../components/ui";
import {
  addBundledGuide,
  apiHealth,
  ask,
  extractFile,
  loadDocs,
  saveDocs,
  upsertDoc,
  type AskResult,
  type ChatTurn,
  type KnowledgeDoc,
} from "../../lib/knowledge";
import { speak, speechRecognitionSupported, stopSpeaking, useSpeechToText } from "../../lib/voice";

type Message = { role: "user" | "assistant"; content: string; result?: AskResult };

const starters = ["Start my training", "What are the B.Tech fees at Garden City University?", "How do admissions work?", "What are the MBA placement results?"];

export default function Assistant() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>(loadDocs);
  const [editing, setEditing] = useState<KnowledgeDoc | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [health, setHealth] = useState<{ provider: string; model: string | null } | null | undefined>(undefined);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceOut, setVoiceOut] = useState(true);
  const stt = useSpeechToText();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiHealth().then(setHealth);
    addBundledGuide(loadDocs()).then((next) => next && setDocs(next));
    return () => stopSpeaking();
  }, []);
  useEffect(() => saveDocs(docs), [docs]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  useEffect(() => {
    if (stt.listening) setInput(`${stt.text} ${stt.interim}`.trim());
  }, [stt.text, stt.interim, stt.listening]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    stt.stop();
    stt.reset();
    setInput("");
    const history: ChatTurn[] = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: question }]);
    setBusy(true);
    const result = await ask(question, docs, history);
    setBusy(false);
    setMessages((m) => [...m, { role: "assistant", content: result.answer, result }]);
    if (voiceOut) speak(result.answer.replace(/\[\d+\]/g, ""));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError("");
    setUploading(true);
    try {
      const { title, text } = await extractFile(file);
      setDocs((d) => upsertDoc(d, { id: `upload-${Date.now()}`, title: title.replace(/\.[^.]+$/, ""), text, source: "upload" }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setUploading(false);
    }
  };

  const saveEdit = () => {
    if (!editing || !editing.title.trim() || !editing.text.trim()) return;
    setDocs((d) => upsertDoc(d, editing));
    setEditing(null);
  };

  const status =
    health === undefined
      ? { text: "Checking AI connection…", cls: "bg-slate-100 text-slate-600" }
      : health === null
        ? { text: "Offline mode · API not running", cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" }
        : health.provider === "Simulated"
          ? { text: "Simulated AI · no AI key set", cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" }
          : { text: `Connected · ${health.provider}${health.model ? ` (${health.model})` : ""}`, cls: "bg-teal-50 text-teal-700 ring-1 ring-teal/30" };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="AI knowledge assistant"
        subtitle="Answers come only from your training documents. Edit a document and the next answer uses the new version."
        actions={<span className={`chip px-3 py-1 ${status.cls}`}>{status.text}</span>}
      />

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        {/* Documents */}
        <div className="card h-fit p-5">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Training documents</div>
            <span className="text-xs text-slate-500">{docs.length}</span>
          </div>
          <ul className="mt-3 space-y-2">
            {docs.map((d) => (
              <li key={d.id} className="group rounded-lg p-3 ring-1 ring-slate-200">
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium" title={d.title}>
                      {d.title}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      v{d.version} · {d.source === "kt" ? "From KT session" : d.source === "upload" ? "Uploaded" : d.source === "sample" ? "Sample" : "Written here"} ·{" "}
                      {new Date(d.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <button onClick={() => setEditing({ ...d })} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-brand" aria-label={`Edit ${d.title}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => confirm(`Remove "${d.title}" from the knowledge base?`) && setDocs(docs.filter((x) => x.id !== d.id))}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Delete ${d.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
            {!docs.length && <li className="text-sm text-slate-500">No documents yet. Upload one or publish a KT session.</li>}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <label className={`btn-ghost cursor-pointer ${uploading ? "pointer-events-none opacity-60" : ""}`}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
              <input type="file" accept=".pdf,.docx,.txt,.md" className="sr-only" onChange={onUpload} />
            </label>
            <button onClick={() => setEditing({ id: `manual-${Date.now()}`, title: "", text: "", version: 0, updatedAt: "", source: "manual" })} className="btn-ghost">
              <FilePlus2 className="h-4 w-4" /> New
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">PDF, DOCX, TXT or MD.</p>
          {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}
        </div>

        {/* Chat */}
        <div className="card flex min-h-[520px] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5" style={{ maxHeight: 560 }}>
            {!messages.length && (
              <div className="py-8 text-center">
                <Bot className="mx-auto h-10 w-10 text-teal" />
                <p className="mt-3 font-semibold">Ask anything about your training material</p>
                <p className="mt-1 text-sm text-slate-500">Type or tap the mic. I'll answer from the documents and show where each answer came from.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {starters.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700 hover:bg-brand-50 hover:text-brand">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${m.role === "assistant" ? "bg-navy" : "bg-brand"}`}>
                  {m.role === "assistant" ? <Bot className="h-4 w-4" /> : "R"}
                </div>
                <div className="max-w-[85%]">
                  <div className={`whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "assistant" ? "bg-slate-100" : "bg-brand text-white"}`}>{m.content}</div>
                  {m.result && (
                    <div className="mt-2 space-y-1.5">
                      {m.result.citations.map((c) => (
                        <details key={c.n} className="rounded-lg bg-white text-xs ring-1 ring-slate-200">
                          <summary className="cursor-pointer px-3 py-1.5 text-slate-600">
                            <span className="font-semibold text-brand">[{c.n}]</span> {c.title} · v{c.version}
                          </summary>
                          <p className="border-t border-slate-100 px-3 py-2 text-slate-500">{c.snippet}…</p>
                        </details>
                      ))}
                      <div className="text-[11px] text-slate-400">
                        {m.result.provider}
                        {m.result.model ? ` · ${m.result.model}` : ""}
                        {m.result.usage?.total_tokens ? ` · ${m.result.usage.total_tokens} tokens` : ""}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Looking through the documents…
              </div>
            )}
            <div ref={end} />
          </div>

          <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-slate-100 p-3">
            {speechRecognitionSupported() && (
              <button
                type="button"
                onClick={() => (stt.listening ? stt.stop() : (stt.reset(), stt.start()))}
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${stt.listening ? "bg-red-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                aria-label={stt.listening ? "Stop listening" : "Ask by voice"}
              >
                {stt.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={stt.listening ? "Listening…" : "Ask a question about your training documents"}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            <button
              type="button"
              onClick={() => {
                if (voiceOut) stopSpeaking();
                setVoiceOut(!voiceOut);
              }}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label={voiceOut ? "Mute spoken answers" : "Speak answers"}
              title={voiceOut ? "Answers are spoken aloud" : "Answers are muted"}
            >
              {voiceOut ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button type="submit" disabled={!input.trim() || busy} className="btn-primary">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-navy/40 p-4" role="dialog" aria-modal="true" aria-label="Edit document">
          <div className="card flex max-h-[90vh] w-full max-w-3xl flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div className="font-semibold">{editing.version ? `Edit document · v${editing.version}` : "New document"}</div>
              <button onClick={() => setEditing(null)} className="rounded p-1 hover:bg-slate-100" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              <input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="Document title"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium focus:border-brand focus:outline-none"
              />
              <textarea
                value={editing.text}
                onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                rows={16}
                placeholder="Paste or write the training content…"
                className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs leading-relaxed focus:border-brand focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
              <span className="text-xs text-slate-500">Saving makes this the version the assistant answers from.</span>
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)} className="btn-ghost">
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={!editing.title.trim() || !editing.text.trim()} className="btn-primary">
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
