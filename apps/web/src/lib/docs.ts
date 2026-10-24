// Training documents for the Knowledge Assistant: reading uploads, splitting them
// into passages, and finding the passages that answer a question. The AI only
// ever sees the passages picked here, so every answer can cite its source.

export type TrainingDoc = { id: string; name: string; text: string; updatedAt: number; version: number };
export type Passage = { id: number; source: string; text: string };
export type AiStatus = { connected: true; provider: string; model: string } | { connected: false };
export type Turn = { role: "user" | "assistant"; content: string };

export const acceptedTypes = ".txt,.md,.markdown,.csv,.json,.yaml,.yml,.log,.vtt,.srt,.docx";
const MAX_CHARS = 1_000_000;

/** Extracts plain text from an uploaded file. Throws a user-facing message for unsupported files. */
export async function readDocument(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") throw new Error("PDF isn't supported yet. Save it as Word (.docx) or text and upload that.");
  if (ext === "doc") throw new Error("Old .doc files aren't supported. Save it as .docx and upload again.");
  const text = ext === "docx" ? await readDocx(file) : await file.text();
  const clean = text.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();
  if (!clean) throw new Error("No readable text was found in this file.");
  return clean.slice(0, MAX_CHARS);
}

// A .docx is a zip; the body text lives in word/document.xml.
async function readDocx(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This doesn't look like a valid Word document.");

  let p = view.getUint32(eocd + 16, true);
  const entries = view.getUint16(eocd + 10, true);
  for (let n = 0; n < entries && view.getUint32(p, true) === 0x02014b50; n++) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const skip = nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (name === "word/document.xml") {
      const local = view.getUint32(p + 42, true);
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = buf.slice(start, start + size);
      const xml =
        method === 0
          ? new TextDecoder().decode(raw)
          : await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
      return docxXmlToText(xml);
    }
    p += 46 + skip;
  }
  throw new Error("No document text was found inside this Word file.");
}

function docxXmlToText(xml: string) {
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n");
}

/** Splits documents into passages of a few paragraphs, keeping the source name for citations. */
export function toPassages(docs: { name: string; text: string }[], size = 900): Omit<Passage, "id">[] {
  const out: Omit<Passage, "id">[] = [];
  for (const d of docs) {
    let cur = "";
    for (const para of d.text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)) {
      if (cur && cur.length + para.length > size) {
        out.push({ source: d.name, text: cur });
        cur = "";
      }
      // Very long paragraphs (or text without blank lines) are cut on word boundaries.
      for (const piece of para.length > size ? para.match(new RegExp(`[^]{1,${size}}(?=\\s|$)`, "g")) ?? [para] : [para]) {
        if (cur && cur.length + piece.length > size) {
          out.push({ source: d.name, text: cur });
          cur = "";
        }
        cur = cur ? `${cur}\n${piece.trim()}` : piece.trim();
      }
    }
    if (cur) out.push({ source: d.name, text: cur });
  }
  return out;
}

const stop = new Set(
  "a an the and or but if of to in on at by for with from as is are was were be been being do does did how what when where which who why whom this that these those it its i we you they he she our your their my me us them can could should would will shall may might must not no yes there here than then so such about into over under up down out any all each some more most other also just only very".split(" "),
);
const terms = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !stop.has(w))
    .map((w) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w));

/** Ranks passages against the question (TF-IDF style) and returns the best few, numbered for citation. */
export function retrieve(question: string, docs: { name: string; text: string }[], k = 6): Passage[] {
  const q = [...new Set(terms(question))];
  if (!q.length) return [];
  const passages = toPassages(docs);
  const bags = passages.map((p) => terms(p.text));
  const df = new Map(q.map((t) => [t, bags.filter((b) => b.includes(t)).length]));
  return passages
    .map((p, i) => {
      const bag = bags[i];
      const score = q.reduce((s, t) => {
        const tf = bag.filter((w) => w === t).length;
        return tf ? s + (1 + Math.log(tf)) * Math.log(1 + passages.length / (df.get(t) || 1)) : s;
      }, 0);
      return { p, score: score / Math.sqrt(1 + bag.length / 150) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x, i) => ({ id: i + 1, ...x.p }));
}

/** Used when no AI tool is connected: quotes the best-matching sentences, with citations. */
export function simulatedAnswer(question: string, passages: Passage[]): string {
  if (!passages.length) return "I couldn't find that in the training documents. Try other words, or ask the trainer to add it.";
  const q = new Set(terms(question));
  const best = passages
    .slice(0, 3)
    .flatMap((p) => p.text.split(/(?<=[.?!])\s+|\n+/).map((s) => ({ s: s.trim(), id: p.id, hits: terms(s).filter((t) => q.has(t)).length })))
    .filter((x) => x.hits > 0 && x.s.length > 12)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3);
  if (!best.length) return "I couldn't find a clear answer in the training documents. The closest passages are listed below.";
  return `From the training documents:\n${best.map((b) => `• ${b.s} [${b.id}]`).join("\n")}`;
}

export async function getAiStatus(): Promise<AiStatus> {
  try {
    const res = await fetch("/api/ai-status");
    if (!res.ok) return { connected: false };
    return (await res.json()) as AiStatus;
  } catch {
    return { connected: false };
  }
}

/** Asks the connected AI tool. Returns null when none is connected, so the caller can fall back. */
export async function askAi(question: string, history: Turn[], passages: Passage[]): Promise<{ answer: string; provider: string } | null> {
  let res: Response;
  try {
    res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history, passages }),
    });
  } catch {
    return null;
  }
  if (res.status === 503 || res.status === 404) return null;
  const data = (await res.json().catch(() => ({}))) as { answer?: string; provider?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? `The AI request failed (${res.status}).`);
  return { answer: data.answer ?? "", provider: data.provider ?? "AI" };
}
