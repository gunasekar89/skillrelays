// Company knowledge base for the demo: documents live in this browser's localStorage,
// and questions go to the API (real AI when configured) with an offline fallback.
import { generateContent, sampleTranscript, type KtSession } from "./demo";

export type KnowledgeDoc = {
  id: string;
  title: string;
  text: string;
  version: number;
  updatedAt: string;
  source: "kt" | "upload" | "manual" | "sample";
};

export type Citation = { n: number; doc_id: string; title: string; version: number; snippet: string };
export type AskResult = { answer: string; citations: Citation[]; grounded: boolean; provider: string; model?: string | null; usage?: Record<string, number> };
export type ChatTurn = { role: "user" | "assistant"; content: string };

const KEY = "sr.docs";

export function docFromSession(s: KtSession): string {
  const c = generateContent(s.transcript);
  return [
    `Summary\n${c.summary}`,
    `Topics covered\n${c.topics.map((t) => `- ${t}`).join("\n")}`,
    c.runbook.length ? `Process steps\n${c.runbook.map((r, i) => `${i + 1}. ${r.step}`).join("\n")}` : "",
    c.faq.length ? `FAQ\n${c.faq.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n")}` : "",
    c.openQuestions.length ? `Open questions\n${c.openQuestions.map((q) => `- ${q}`).join("\n")}` : "",
    `Full transcript\n${s.transcript}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// Same id for the same session title, so republishing (or publishing the sample) updates rather than duplicates.
const sessionDocId = (title: string) => `kt-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

const seed = (): KnowledgeDoc[] => [
  {
    id: sessionDocId("Credit Card Support — New Joiner KT"),
    title: "Credit Card Support — New Joiner KT",
    text: docFromSession({ title: "", trainer: "", transcript: sampleTranscript, durationSec: 0, source: "sample" }),
    version: 1,
    updatedAt: new Date().toISOString(),
    source: "sample",
  },
];

export function loadDocs(): KnowledgeDoc[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as KnowledgeDoc[];
  } catch {
    /* fall through to seed */
  }
  return seed();
}

export function saveDocs(docs: KnowledgeDoc[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(docs));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

export function upsertDoc(docs: KnowledgeDoc[], doc: Omit<KnowledgeDoc, "version" | "updatedAt"> & { version?: number }): KnowledgeDoc[] {
  const existing = docs.find((d) => d.id === doc.id);
  const next: KnowledgeDoc = {
    ...doc,
    version: existing ? existing.version + (existing.text === doc.text && existing.title === doc.title ? 0 : 1) : 1,
    updatedAt: new Date().toISOString(),
  };
  return existing ? docs.map((d) => (d.id === doc.id ? next : d)) : [next, ...docs];
}

/** Publish an approved KT session into the knowledge base. */
export function publishSession(s: KtSession) {
  saveDocs(upsertDoc(loadDocs(), { id: sessionDocId(s.title), title: s.title, text: docFromSession(s), source: "kt" }));
}

export async function apiHealth(): Promise<{ provider: string; model: string | null } | null> {
  try {
    const r = await fetch("/api/health");
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function extractFile(file: File): Promise<{ title: string; text: string }> {
  if (/\.(txt|md|vtt|srt)$/i.test(file.name)) return { title: file.name, text: await file.text() };
  const form = new FormData();
  form.append("file", file);
  let r: Response;
  try {
    r = await fetch("/api/extract", { method: "POST", body: form });
  } catch {
    throw new Error("Reading PDF and Word files needs the API running. TXT and MD files work without it.");
  }
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.detail ?? "Couldn't read that file.");
  return r.json();
}

export async function ask(question: string, docs: KnowledgeDoc[], history: ChatTurn[]): Promise<AskResult> {
  try {
    const r = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, documents: docs.map(({ id, title, text, version }) => ({ id, title, text, version })), history: history.slice(-6) }),
    });
    if (r.ok) return r.json();
  } catch {
    /* API not running: answer offline below */
  }
  return askOffline(question, docs);
}

// ---------- Offline fallback: sentence matching, clearly labeled ----------

const STOP = new Set("a an and are as at be by can do does for from how i if in is it its of on or our so that the their this to was we what when where which who why will with you your".split(" "));
const words = (t: string) => (t.toLowerCase().match(/[a-z0-9][a-z0-9\-_]*/g) ?? []).filter((w) => !STOP.has(w));

function askOffline(question: string, docs: KnowledgeDoc[]): AskResult {
  const q = new Set(words(question));
  const scored = docs
    .flatMap((d) => d.text.split(/(?<=[.?!])\s+|\n+/).map((s) => ({ d, s: s.trim(), score: words(s).filter((w) => q.has(w)).length })))
    .filter((x) => x.score > 0 && x.s.length > 12)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (!scored.length) {
    return { answer: "I couldn't find that in the training documents. Ask the trainer to add it.", citations: [], grounded: false, provider: "Offline" };
  }
  const citations: Citation[] = [];
  const parts = scored.map(({ d, s }) => {
    let c = citations.find((x) => x.doc_id === d.id);
    if (!c) {
      c = { n: citations.length + 1, doc_id: d.id, title: d.title, version: d.version, snippet: s };
      citations.push(c);
    }
    return `${s} [${c.n}]`;
  });
  return { answer: `Here's what the training documents say: ${parts.join(" ")}`, citations, grounded: true, provider: "Offline" };
}

const GUIDE_FLAG = "sr.guide-added";

/** Add the bundled fresher guide once per browser, so a fresh demo has the full material. */
export async function addBundledGuide(docs: KnowledgeDoc[]): Promise<KnowledgeDoc[] | null> {
  try {
    if (localStorage.getItem(GUIDE_FLAG)) return null;
    const r = await fetch("/samples/acme-bank-cards-fresher-guide.txt");
    if (!r.ok) return null;
    localStorage.setItem(GUIDE_FLAG, "1");
    return upsertDoc(docs, { id: "sample-fresher-guide", title: "Acme Bank Cards — Complete Fresher Training Guide", text: await r.text(), source: "sample" });
  } catch {
    return null;
  }
}
