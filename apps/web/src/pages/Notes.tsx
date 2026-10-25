import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  BookOpen,
  BookOpenCheck,
  Brain,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  ListChecks,
  Loader2,
  MessageCircleQuestion,
  MessageSquareText,
  Mic,
  MicOff,
  NotebookPen,
  PenLine,
  Plus,
  RotateCcw,
  ScanText,
  Send,
  Shuffle,
  Sparkles,
  Timer,
  Trash2,
  Type,
  Upload,
  Volume2,
  Wand2,
  X,
} from "lucide-react";
import { PageHeader } from "../components/ui";
import { InkCanvas, type InkCanvasHandle } from "../components/InkCanvas";
import { ExamMode, ExplainBack, ReasonPicker, Revision, StudyCoach } from "../components/StudyTools";
import { logActivity } from "../lib/progress";
import { SUBJECTS, bandOf, loadProfile, permissions } from "../lib/profile";
import { useLocation, useSearchParams } from "react-router-dom";
import { ask, loadDocs, saveDocs, upsertDoc, type AskResult, type ChatTurn, type KnowledgeDoc } from "../lib/knowledge";
import { loadNotes, newNote, noteAi, readHandwriting, saveNotes, type Flashcard, type Note, type NoteAction, type NoteAiResult, type QuizQuestion } from "../lib/notes";
import { addMiss, addReason, dueCount, type MissReason } from "../lib/study";
import { speak, speechRecognitionSupported, stopSpeaking, useSpeechToText } from "../lib/voice";

type Tool = NoteAction | "ask" | "coach" | "explain" | "review" | "mixed" | "exam";

const STUDY_TOOLS: Tool[] = ["ask", "coach", "explain", "review", "exam"];
const TOOL_IDS: Tool[] = ["summarize", "tidy", "simplify", "flashcards", "quiz", "ask", "coach", "explain", "review", "mixed", "exam"];

type ToolInfo = { id: Tool; label: string; hint: string; icon: ReactNode };

// Grouped the way a study session runs: understand the notes, practise them, then test and review.
const TOOL_GROUPS: { title: string; tools: ToolInfo[] }[] = [
  {
    title: "Understand",
    tools: [
      { id: "summarize", label: "Summarize", hint: "Key points in seconds", icon: <Sparkles className="h-4 w-4" /> },
      { id: "simplify", label: "Explain simply", hint: "Easy words, examples", icon: <BookOpen className="h-4 w-4" /> },
      { id: "tidy", label: "Tidy up", hint: "Fix spelling, neat headings", icon: <Wand2 className="h-4 w-4" /> },
      { id: "ask", label: "Ask my notes", hint: "Answers from this note", icon: <MessageCircleQuestion className="h-4 w-4" /> },
    ],
  },
  {
    title: "Practise",
    tools: [
      { id: "coach", label: "Study coach", hint: "Try first, then hints", icon: <Brain className="h-4 w-4" /> },
      { id: "explain", label: "Explain it back", hint: "Say it in your words", icon: <MessageSquareText className="h-4 w-4" /> },
      { id: "flashcards", label: "Flashcards", hint: "Flip cards to revise", icon: <Layers className="h-4 w-4" /> },
      { id: "quiz", label: "Quiz me", hint: "With a confidence check", icon: <ListChecks className="h-4 w-4" /> },
    ],
  },
  {
    title: "Test and review",
    tools: [
      { id: "mixed", label: "Mixed practice", hint: "Questions from all notes", icon: <Shuffle className="h-4 w-4" /> },
      { id: "exam", label: "Exam mode", hint: "Timed, no help", icon: <Timer className="h-4 w-4" /> },
      { id: "review", label: "Revision", hint: "Mistakes come back", icon: <CalendarClock className="h-4 w-4" /> },
    ],
  },
];

const MIXED_ID = "mixed";

/** All notes with text as one source, for a quiz that mixes topics. */
const mixedNote = (notes: Note[]): Note => ({
  id: MIXED_ID,
  title: "Mixed practice",
  text: notes
    .filter((n) => n.text.trim())
    .map((n) => `${n.title}\n${n.text.slice(0, 4000)}`)
    .join("\n\n"),
  updatedAt: new Date().toISOString(),
});

const noteDoc = (n: Note): KnowledgeDoc => ({ id: n.id, title: n.title || "My notes", text: n.text, version: 1, updatedAt: n.updatedAt, source: "manual" });

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [params] = useSearchParams();
  const student = useLocation().pathname.startsWith("/student");
  const profile = loadProfile();
  const allowed = student ? permissions(bandOf(profile.standard)) : permissions("college");
  const [activeId, setActiveId] = useState(() => notes.find((n) => n.id === params.get("note"))?.id ?? notes[0]?.id);
  const [mode, setMode] = useState<"type" | "pen">("type");
  const [tool, setTool] = useState<Tool | null>(null);
  const [listening, setListening] = useState(false);
  const [coachQ, setCoachQ] = useState("");
  const [due, setDue] = useState(dueCount);
  const [result, setResult] = useState<NoteAiResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [inkError, setInkError] = useState("");
  const [flash, setFlash] = useState("");
  const [undo, setUndo] = useState<string | null>(null);
  const ink = useRef<InkCanvasHandle>(null);
  const stt = useSpeechToText();
  const dictationBase = useRef("");

  const note = notes.find((n) => n.id === activeId) ?? notes[0];

  useEffect(() => saveNotes(notes), [notes]);
  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(""), 2500);
    return () => window.clearTimeout(t);
  }, [flash]);

  const update = (patch: Partial<Note>) => {
    if (!note) return;
    setNotes((ns) => ns.map((n) => (n.id === note.id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n)));
  };

  // Dictation: spoken words are added after whatever was typed before the mic was turned on.
  useEffect(() => {
    if (stt.listening) update({ text: `${dictationBase.current}${stt.text} ${stt.interim}`.trimEnd() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stt.text, stt.interim, stt.listening]);

  const toggleDictation = () => {
    if (stt.listening) return stt.stop();
    dictationBase.current = note.text ? `${note.text.trimEnd()}\n` : "";
    stt.reset();
    stt.start();
  };

  const open = (id: string) => {
    stt.stop();
    stopSpeaking();
    setActiveId(id);
    setTool(null);
    setResult(null);
    setError("");
    setInkError("");
    setUndo(null);
  };

  const add = () => {
    const n = newNote();
    setNotes((ns) => [n, ...ns]);
    open(n.id);
  };

  const remove = (n: Note) => {
    if (!confirm(`Delete "${n.title}"?`)) return;
    const rest = notes.filter((x) => x.id !== n.id);
    const next = rest.length ? rest : [newNote()];
    setNotes(next);
    if (n.id === note.id) open(next[0].id);
  };

  const run = async (t: Tool) => {
    setTool(t);
    setResult(null);
    setError("");
    setCoachQ("");
    setDue(dueCount());
    stopSpeaking();
    if (t === "ask" || t === "review") return;
    if (t === "mixed") {
      if (notes.filter((n) => n.text.trim()).length < 2) {
        setTool(null);
        setError("Mixed practice needs at least two notes with text. Add another note first.");
        return;
      }
      setBusy(t);
      try {
        setResult(await noteAi("quiz", mixedNote(notes)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setBusy(null);
      }
      return;
    }
    if (!note.text.trim()) {
      setTool(null);
      setError(note.ink ? "Tap \"Convert to text\" on your handwritten page first, so the AI can read it." : "Write or say a few notes first.");
      return;
    }
    if (STUDY_TOOLS.includes(t)) return;
    setBusy(t);
    try {
      setResult(await noteAi(t as NoteAction, note));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  // Links from the student home open a note with a tool already chosen, e.g. ?note=…&tool=coach.
  useEffect(() => {
    const t = params.get("tool") as Tool | null;
    if (t && TOOL_IDS.includes(t)) run(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listen = () => {
    if (listening) {
      stopSpeaking();
      return setListening(false);
    }
    setListening(true);
    speak(`${note.title}. ${note.text.replace(/^\s*[-*•]\s*/gm, "")}`, () => setListening(false));
  };

  const convertInk = async () => {
    const image = ink.current?.toImage();
    if (!image) return setInkError("Write something on the page first.");
    setInkError("");
    setBusy("ink");
    try {
      const { text } = await readHandwriting(image);
      if (/^\(no writing found\)$/i.test(text.trim())) {
        setInkError("I couldn't find any writing on the page.");
      } else {
        update({ text: note.text.trim() ? `${note.text.trimEnd()}\n\n${text}` : text });
        setMode("type");
        setFlash("Handwriting added to your typed notes.");
      }
    } catch (e) {
      setInkError(e instanceof Error ? e.message : "Couldn't read the handwriting.");
    } finally {
      setBusy(null);
    }
  };

  const shareToTraining = () => {
    if (!note.text.trim()) return;
    saveDocs(upsertDoc(loadDocs(), { id: `notes-${note.id}`, title: note.title || "My notes", text: note.text, source: "manual" }));
    setFlash("Added to the training documents. The AI assistant can now answer from it.");
  };

  if (!note) return null;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="AI notes"
        subtitle="Type, handwrite or speak your notes. Then let the AI summarize them, tidy them up, or turn them into flashcards and a quiz."
        actions={
          <button onClick={add} className="btn-primary">
            <Plus className="h-4 w-4" /> New note
          </button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)_380px]">
        {/* Notebook list */}
        <div className="card h-fit p-3">
          <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">My notebook</div>
          <ul className="space-y-1">
            {notes.map((n) => (
              <li key={n.id} className="group flex items-center gap-1">
                <button
                  onClick={() => open(n.id)}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${n.id === note.id ? "bg-brand-50 font-medium text-brand" : "text-slate-700 hover:bg-slate-100"}`}
                >
                  <NotebookPen className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate">{n.title || "Untitled note"}</span>
                    {student && n.subject && <span className="block truncate text-[11px] font-normal text-slate-400">{n.subject}</span>}
                  </span>
                </button>
                <button onClick={() => remove(n)} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${n.title}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Editor */}
        <div className="card flex min-w-0 flex-col p-5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={note.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="Note title"
              className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 text-lg font-semibold hover:border-slate-200 focus:border-brand focus:outline-none"
            />
            <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
              {[
                { id: "type" as const, label: "Type", icon: <Type className="h-4 w-4" /> },
                { id: "pen" as const, label: "Handwrite", icon: <PenLine className="h-4 w-4" /> },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium ${mode === m.id ? "bg-white text-navy shadow-sm" : "text-slate-500"}`}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>
          {student && (
            <div className="mt-2 flex flex-wrap items-center gap-2 px-2 text-sm">
              <select
                value={note.subject ?? ""}
                onChange={(e) => update({ subject: e.target.value || undefined })}
                className="rounded-lg border border-slate-200 px-2 py-1 text-slate-700"
                aria-label="Subject"
              >
                <option value="">Subject…</option>
                {SUBJECTS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <input
                value={note.chapter ?? ""}
                onChange={(e) => update({ chapter: e.target.value || undefined })}
                placeholder="Chapter or lesson"
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1"
                aria-label="Chapter"
              />
              {profile.language === "ta" && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">AI replies in Tamil</span>}
            </div>
          )}

          <div className="mt-4 flex-1">
            {mode === "type" ? (
              <textarea
                value={note.text}
                onChange={(e) => update({ text: e.target.value })}
                placeholder="Start writing… or tap the mic and speak your notes."
                className="notebook-lines h-[460px] w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-[15px] focus:border-brand focus:outline-none"
              />
            ) : (
              <InkCanvas ref={ink} pageKey={note.id} value={note.ink} onChange={(png) => update({ ink: png })} />
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {mode === "type" ? (
              speechRecognitionSupported() && (
                <button onClick={toggleDictation} className={stt.listening ? "btn-danger" : "btn-ghost"}>
                  {stt.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  {stt.listening ? "Stop dictation" : "Speak notes"}
                </button>
              )
            ) : (
              <button onClick={convertInk} disabled={busy === "ink"} className="btn-teal">
                {busy === "ink" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />} Convert to text
              </button>
            )}
            <button onClick={listen} disabled={!note.text.trim()} className="btn-ghost" title="Read these notes out loud">
              <Volume2 className="h-4 w-4" /> {listening ? "Stop reading" : "Listen"}
            </button>
            <button onClick={shareToTraining} disabled={!note.text.trim()} className="btn-ghost" title="Make these notes searchable by the AI assistant">
              <Upload className="h-4 w-4" /> Add to training documents
            </button>
            {undo !== null && (
              <button onClick={() => (update({ text: undo }), setUndo(null))} className="btn-ghost">
                <RotateCcw className="h-4 w-4" /> Undo tidy-up
              </button>
            )}
            <span className="ml-auto text-xs text-slate-400">
              {stt.listening ? "Listening…" : `${note.text.split(/\s+/).filter(Boolean).length} words · saved`}
            </span>
          </div>
          {flash && <p className="mt-2 text-sm text-teal-700">{flash}</p>}
          {inkError && mode === "pen" && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">{inkError}</p>}
        </div>

        {/* AI tools */}
        <div className="card h-fit p-5">
          <div className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-4 w-4 text-teal" /> AI tools
          </div>
          {TOOL_GROUPS.map((g) => (
          <div key={g.title}>
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.title}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {g.tools.filter((t) => t.id !== "ask" || allowed.askFreely).map((t) => (
              <button
                key={t.id}
                onClick={() => run(t.id)}
                disabled={busy !== null}
                className={`rounded-xl p-3 text-left ring-1 transition ${tool === t.id ? "bg-brand-50 ring-brand/40" : "ring-slate-200 hover:bg-slate-50"}`}
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-navy">
                  <span className="text-brand">{busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : t.icon}</span>
                  {t.label}
                </div>
                <div className={`mt-0.5 text-xs ${t.id === "review" && due ? "font-semibold text-amber-600" : "text-slate-500"}`}>{t.id === "review" && due ? `${due} due today` : t.hint}</div>
              </button>
            ))}
          </div>
          </div>
          ))}

          <div className="mt-4">
            {error && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">{error}</p>}
            {busy && busy !== "ink" && (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Reading your notes…
              </div>
            )}
            {result && (result.action === "summarize" || result.action === "tidy" || result.action === "simplify") && (
              <TextResult
                result={result}
                onUse={() => {
                  if (result.action === "tidy") {
                    setUndo(note.text);
                    update({ text: result.text });
                    setFlash("Your notes were tidied up.");
                  } else {
                    const heading = result.action === "simplify" ? "In simple words" : "Summary";
                    update({ text: `${note.text.trimEnd()}\n\n${heading}\n${result.text}` });
                    setFlash(`${heading} added to the end of your notes.`);
                  }
                }}
              />
            )}
            {result?.action === "flashcards" && <Flashcards key={result.cards.length + result.provider} cards={result.cards} provider={result} note={note} />}
            {result?.action === "quiz" && <Quiz
                key={`${tool}${result.questions.length}${result.provider}`}
                questions={result.questions}
                provider={result}
                note={tool === "mixed" ? mixedNote(notes) : note}
                onRetry={() => run(tool === "mixed" ? "mixed" : "quiz")}
              />}
            {tool === "ask" && <AskNotes key={note.id} note={note} />}
            {tool === "coach" && <StudyCoach key={note.id + coachQ} note={note} initialQuestion={coachQ} canType={allowed.typeOwnQuestion} />}
            {tool === "explain" && <ExplainBack key={note.id} note={note} onCoach={(q) => (setCoachQ(q), setTool("coach"))} />}
            {tool === "review" && <Revision />}
            {tool === "exam" && <ExamMode key={note.id} note={note} />}
            {!tool && !error && (
              <p className="text-sm text-slate-500">
                Pick a tool. Everything the AI says comes from this note only, so it won't make things up.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Provider({ r }: { r: { provider: string; model?: string | null } }) {
  return (
    <div className="mt-2 text-[11px] text-slate-400">
      {r.provider}
      {r.model ? ` · ${r.model}` : ""}
    </div>
  );
}

function TextResult({ result, onUse }: { result: NoteAiResult; onUse: () => void }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{result.action === "tidy" ? "Tidied notes" : result.action === "simplify" ? "In simple words" : "Summary"}</div>
      <div className="mt-2 max-h-80 overflow-y-auto whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm leading-relaxed">{result.text}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={onUse} className="btn-primary">
          <Check className="h-4 w-4" /> {result.action === "tidy" ? "Replace my notes" : "Add to my notes"}
        </button>
        <button onClick={() => speak(result.text.replace(/^- /gm, ""))} className="btn-ghost">
          <Volume2 className="h-4 w-4" /> Read aloud
        </button>
      </div>
      <Provider r={result} />
    </div>
  );
}

function Flashcards({ cards, provider, note }: { cards: Flashcard[]; provider: NoteAiResult; note: Note }) {
  const [deck, setDeck] = useState(cards);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  if (!deck.length) return <p className="text-sm text-slate-500">I couldn't find enough facts in this note to make flashcards. Add a few more lines.</p>;
  const card = deck[i];
  const go = (d: number) => {
    setFlipped(false);
    setI((x) => (x + d + deck.length) % deck.length);
  };
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Card {i + 1} of {deck.length}
        </span>
        <span>{known.size} known</span>
      </div>
      <button
        onClick={() => setFlipped(!flipped)}
        className={`mt-2 grid min-h-[180px] w-full place-items-center rounded-2xl p-5 text-center text-base font-medium shadow-card ring-1 transition ${flipped ? "bg-teal-50 text-teal-900 ring-teal/30" : "bg-white text-navy ring-slate-200"}`}
        aria-label={flipped ? "Show question" : "Show answer"}
      >
        <span>
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{flipped ? "Answer" : "Question"}</span>
          {flipped ? card.back : card.front}
        </span>
      </button>
      <p className="mt-1 text-center text-xs text-slate-400">Tap the card to flip it</p>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={() => go(-1)} className="btn-ghost px-3" aria-label="Previous card">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            setKnown((k) => new Set(k).add(i));
            go(1);
          }}
          className="btn-teal flex-1"
        >
          <Check className="h-4 w-4" /> I know this
        </button>
        <button
          onClick={() => {
            addMiss(note, card.front, card.back);
            go(1);
          }}
          className="btn-ghost"
          title="Add to your revision list; it comes back tomorrow"
        >
          Still learning
        </button>
        <button onClick={() => go(1)} className="btn-ghost px-3" aria-label="Next card">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            setDeck([...deck].sort(() => Math.random() - 0.5));
            setI(0);
            setFlipped(false);
            setKnown(new Set());
          }}
          className="btn-ghost px-3"
          aria-label="Shuffle"
          title="Shuffle"
        >
          <Shuffle className="h-4 w-4" />
        </button>
      </div>
      <Provider r={provider} />
    </div>
  );
}

function Quiz({ questions, provider, note, onRetry }: { questions: QuizQuestion[]; provider: NoteAiResult; note: Note; onRetry: () => void }) {
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null); // picked, waiting for "how sure?"
  const [picked, setPicked] = useState<number | null>(null); // revealed
  const [sure, setSure] = useState({ right: 0, wrong: 0 });
  const [reason, setReason] = useState<MissReason | null>(null);
  const [missed, setMissed] = useState(0);
  const [score, setScore] = useState(0);
  const logged = useRef(false);

  useEffect(() => {
    if (i < questions.length || logged.current || !questions.length) return;
    logged.current = true;
    logActivity(note.id, note.id === "mixed" ? "mixed" : "quiz", score / questions.length, sure);
  }, [i, questions.length, note.id, score, sure]);

  if (!questions.length) return <p className="text-sm text-slate-500">I couldn't find enough facts in this note to write a quiz. Add a few more lines.</p>;
  if (i >= questions.length) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="py-4 text-center">
        <BookOpenCheck className="mx-auto h-10 w-10 text-teal" />
        <div className="mt-2 text-2xl font-bold">
          {score} / {questions.length}
        </div>
        {missed > 0 && <p className="mt-1 text-xs text-slate-500">The {missed} you missed {missed > 1 ? "are" : "is"} on your revision list for tomorrow.</p>}
        <p className="mt-1 text-sm text-slate-500">{pct >= 80 ? "Great work, you know these notes well." : pct >= 50 ? "Good start. Try the Study coach on what you missed." : "Keep going. Read the summary, then try again."}</p>
        {sure.wrong > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-left text-xs text-amber-900">
            <span className="font-semibold">Confidence check:</span> you were sure about {sure.wrong} answer{sure.wrong > 1 ? "s" : ""} that {sure.wrong > 1 ? "were" : "was"} wrong. Those are the most important ones to revise, because feeling sure stops you checking.
          </p>
        )}
        {sure.wrong === 0 && sure.right > 0 && <p className="mt-3 text-xs text-teal-700">Every answer you were sure about was right. Your confidence matches what you know.</p>}
        <button onClick={onRetry} className="btn-primary mt-4">
          <RotateCcw className="h-4 w-4" /> New quiz
        </button>
      </div>
    );
  }
  const q = questions[i];
  const reveal = (k: number, isSure: boolean) => {
    setPicked(k);
    setChosen(null);
    const right = k === q.answer;
    if (isSure) setSure((s) => (right ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 }));
    if (right) setScore((s) => s + 1);
    else {
      addMiss(note, q.question, q.options[q.answer]);
      setMissed((m) => m + 1);
    }
  };
  return (
    <div>
      <div className="text-xs text-slate-500">
        Question {i + 1} of {questions.length} · Score {score}
      </div>
      <p className="mt-2 font-medium">{q.question}</p>
      <div className="mt-3 space-y-2">
        {q.options.map((o, k) => {
          const state =
            picked === null
              ? chosen === k
                ? "bg-brand-50 ring-brand"
                : ""
              : k === q.answer
                ? "bg-teal-50 ring-teal text-teal-900"
                : k === picked
                  ? "bg-red-50 ring-red-300 text-red-800"
                  : "opacity-60";
          return (
            <button
              key={k}
              onClick={() => picked === null && setChosen(k)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm ring-1 ring-slate-200 ${picked === null ? "hover:bg-slate-50" : ""} ${state}`}
            >
              <span className="mr-2 font-semibold text-slate-400">{String.fromCharCode(65 + k)}</span>
              {o}
            </button>
          );
        })}
      </div>
      {chosen !== null && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-600">How sure are you?</div>
          <div className="mt-2 flex gap-2">
            <button onClick={() => reveal(chosen, true)} className="btn-primary flex-1">
              I'm sure
            </button>
            <button onClick={() => reveal(chosen, false)} className="btn-ghost flex-1">
              I'm guessing
            </button>
          </div>
        </div>
      )}
      {picked !== null && (
        <div className="mt-3">
          <p className="text-sm">
            <span className={picked === q.answer ? "font-semibold text-teal-700" : "font-semibold text-red-600"}>{picked === q.answer ? "Correct! " : "Not quite. "}</span>
            {q.explanation}
          </p>
          {picked !== q.answer && <ReasonPicker picked={reason} onPick={(r) => (setReason(r), addReason(note, q.question, r))} />}
          <button onClick={() => (setI(i + 1), setPicked(null), setReason(null))} className="btn-primary mt-3 w-full">
            {i + 1 < questions.length ? "Next question" : "See my score"}
          </button>
        </div>
      )}
      <Provider r={provider} />
    </div>
  );
}

function AskNotes({ note }: { note: Note }) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string; result?: AskResult }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const stt = useSpeechToText();

  useEffect(() => {
    if (stt.listening) setInput(`${stt.text} ${stt.interim}`.trim());
  }, [stt.text, stt.interim, stt.listening]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    stt.stop();
    stt.reset();
    setInput("");
    const history: ChatTurn[] = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    const result = await ask(q, [noteDoc(note)], history);
    setBusy(false);
    setMessages((m) => [...m, { role: "assistant", content: result.answer, result }]);
  };

  return (
    <div>
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {!messages.length && <p className="text-sm text-slate-500">Ask a question about this note, for example "When is the library open?"</p>}
        {messages.map((m, i) => (
          <div key={i} className={`whitespace-pre-line rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ml-8 bg-brand text-white" : "mr-4 bg-slate-100"}`}>
            {m.content.replace(/\s?\[\d+\]/g, "")}
            {m.result && <Provider r={m.result} />}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your notes…
          </div>
        )}
      </div>
      <form onSubmit={send} className="mt-3 flex items-center gap-2">
        {speechRecognitionSupported() && (
          <button
            type="button"
            onClick={() => (stt.listening ? stt.stop() : (stt.reset(), stt.start()))}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${stt.listening ? "bg-red-500 text-white" : "bg-slate-100 text-slate-600"}`}
            aria-label={stt.listening ? "Stop listening" : "Ask by voice"}
          >
            {stt.listening ? <X className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={stt.listening ? "Listening…" : "Ask your notes"}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <button type="submit" disabled={!input.trim() || busy} className="btn-primary px-3" aria-label="Send">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
