// Demo content and a simulated AI. Everything here is deterministic and clearly
// labeled in the UI; real model calls replace these functions in the next step.

export type Question = { id: string; prompt: string; keywords: string[]; followUp: string };

export const interviewTracks: Record<string, { title: string; role: string; questions: Question[] }> = {
  kubernetes: {
    title: "Technical Interview",
    role: "Cloud DevOps Engineer",
    questions: [
      {
        id: "k1",
        prompt: "Can you explain the difference between a Kubernetes Deployment and a StatefulSet? When would you use each?",
        keywords: ["stateless", "stateful", "identity", "persistent", "volume", "ordered", "replica", "database", "pod name"],
        followUp: "Good. How would you handle storage for a StatefulSet if a node fails?",
      },
      {
        id: "k2",
        prompt: "A pod is stuck in CrashLoopBackOff in production. Walk me through how you'd troubleshoot it.",
        keywords: ["logs", "previous", "describe", "events", "exit code", "liveness", "probe", "config", "secret", "image", "resources", "oom"],
        followUp: "Makes sense. What would change if the container was being OOMKilled?",
      },
      {
        id: "k3",
        prompt: "How would you roll out a new version of a service with zero downtime?",
        keywords: ["rolling", "readiness", "probe", "maxsurge", "maxunavailable", "canary", "blue", "green", "rollback"],
        followUp: "Nice. How do you decide when to roll back automatically?",
      },
    ],
  },
  behavioral: {
    title: "Behavioral Interview",
    role: "Software Engineer",
    questions: [
      {
        id: "b1",
        prompt: "Tell me about a time you disagreed with a teammate. How did you resolve it?",
        keywords: ["listened", "data", "compromise", "outcome", "learned", "situation", "result", "action"],
        followUp: "What would you do differently next time?",
      },
      {
        id: "b2",
        prompt: "Describe a production incident you were part of. What was your role?",
        keywords: ["impact", "root cause", "communicat", "postmortem", "fix", "monitor", "customer", "timeline"],
        followUp: "How did you make sure it didn't happen again?",
      },
    ],
  },
};

export type Answer = { questionId: string; prompt: string; text: string; seconds: number };

export type Scores = {
  overall: number;
  technical: number;
  communication: number;
  completeness: number;
  problemSolving: number;
  strengths: string[];
  improvements: string[];
};

const clamp = (n: number) => Math.max(20, Math.min(98, Math.round(n)));

/** Simulated rubric: keyword coverage, answer length and structure. Not a hiring decision. */
export function scoreAnswers(answers: Answer[], questions: Question[]): Scores {
  if (!answers.length) {
    return { overall: 0, technical: 0, communication: 0, completeness: 0, problemSolving: 0, strengths: [], improvements: ["Answer at least one question to get feedback."] };
  }
  const per = answers.map((a) => {
    const q = questions.find((x) => x.id === a.questionId);
    const lower = a.text.toLowerCase();
    const hits = q ? q.keywords.filter((k) => lower.includes(k)).length : 0;
    const coverage = q ? hits / Math.min(q.keywords.length, 5) : 0;
    const words = a.text.split(/\s+/).filter(Boolean).length;
    const structure = /(first|then|next|finally|because|for example|so that)/i.test(a.text) ? 1 : 0.6;
    return { coverage: Math.min(1, coverage), words, structure };
  });
  const avg = (f: (p: (typeof per)[number]) => number) => per.reduce((s, p) => s + f(p), 0) / per.length;

  const technical = clamp(40 + avg((p) => p.coverage) * 55);
  const completeness = clamp(35 + avg((p) => Math.min(1, p.words / 90)) * 60);
  const communication = clamp(50 + avg((p) => p.structure) * 40 + (avg((p) => p.words) > 25 ? 5 : -10));
  const problemSolving = clamp((technical + completeness) / 2 + 3);
  const overall = clamp(technical * 0.35 + communication * 0.2 + completeness * 0.25 + problemSolving * 0.2);

  const strengths: string[] = [];
  const improvements: string[] = [];
  if (technical >= 70) strengths.push("Covered the key technical concepts the question was looking for.");
  else improvements.push("Name the specific concepts and commands you would use, not just the general idea.");
  if (communication >= 70) strengths.push("Answers were structured and easy to follow.");
  else improvements.push("Use a clear structure: context, steps you'd take, then the outcome.");
  if (completeness >= 70) strengths.push("Gave enough depth for an interviewer to judge your experience.");
  else improvements.push("Add a real example from a project you worked on.");
  if (!strengths.length) strengths.push("You completed the session and practiced speaking your answers out loud.");

  return { overall, technical, communication, completeness, problemSolving, strengths, improvements };
}

/** Short, conversational acknowledgment of an answer, in the interviewer's voice. */
export function interviewerReply(answer: string, q: Question): string {
  const words = answer.split(/\s+/).filter(Boolean).length;
  if (words < 8) return "That was a little short. In a real interview, add more detail.";
  const lower = answer.toLowerCase();
  const hit = q.keywords.find((k) => lower.includes(k));
  return hit ? `Thanks. Good that you brought up ${hit}.` : "Okay, thanks. Try to name specific tools or steps next time.";
}

// ---------- Enterprise ----------

export const org = {
  name: "Acme Technologies",
  admin: "Rajesh",
  stats: { employees: 120, programs: 8, completion: 76, assets: 45 },
  trend: [
    { m: "Jan", v: 32 },
    { m: "Feb", v: 41 },
    { m: "Mar", v: 47 },
    { m: "Apr", v: 55 },
    { m: "May", v: 63 },
    { m: "Jun", v: 76 },
  ],
  readiness: [
    { label: "Advanced", pct: 28, color: "#2563EB" },
    { label: "Proficient", pct: 42, color: "#14B8A6" },
    { label: "Developing", pct: 20, color: "#F59E0B" },
    { label: "Not started", pct: 10, color: "#CBD5E1" },
  ],
  activity: [
    { title: "Credit Card Support — New Joiner KT", status: "Completed", people: 20, when: "2 hours ago" },
    { title: "Disputes and Chargebacks Basics", status: "In progress", people: 15, when: "1 day ago" },
    { title: "Fraud Awareness for Agents", status: "Not started", people: 10, when: "2 days ago" },
  ],
};

export type KtSession = {
  title: string;
  trainer: string;
  transcript: string;
  durationSec: number;
  source: "live" | "upload" | "sample";
  approved?: boolean;
};

export const sampleTranscript = `Welcome everyone. Today is your first knowledge transfer session for credit card customer support.
First, customer verification. Before you share any account details, verify the customer with the last 4 digits of the card, the date of birth and the OTP sent to the registered mobile number.
Never ask for the full card number, the CVV or the PIN. If verification fails 3 times, ask the customer to visit the branch with a photo ID.
The most common call is a lost card. When a card is lost or stolen, first block the card immediately, then confirm the replacement. The replacement card arrives in 5 to 7 working days, and the first replacement in a year is free.
For a transaction the customer doesn't recognise, take the date, amount and merchant name, then raise a dispute in the CRM. Temporary credit is given within 10 working days.
The late payment fee is 500 rupees for outstanding amounts up to 10,000 rupees. You can waive it once in 12 months if the customer has paid on time for the last 6 months.
If a customer is angry, stay calm, listen, and apologise. Then explain what you will do and by when.
Question from Ravi: can we tell a customer's husband the card balance? Answer: no, only the verified card holder, even for family members.
Open question: can freshers approve a second late fee waiver? We need to confirm that with the team leader.`;

export type GeneratedContent = {
  summary: string;
  topics: string[];
  runbook: { step: string; source: string }[];
  faq: { q: string; a: string }[];
  quiz: { q: string; options: string[]; answer: number }[];
  openQuestions: string[];
};

const sentences = (t: string) => t.replace(/\n+/g, " ").split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);

/** Simulated knowledge generation: extractive, traceable to transcript sentences. */
export function generateContent(transcript: string): GeneratedContent {
  const s = sentences(transcript);
  const pick = (re: RegExp) => s.filter((x) => re.test(x));

  const topicMap: [RegExp, string][] = [
    [/verif|otp|date of birth/i, "Customer verification"],
    [/lost|stolen|block/i, "Lost or stolen card"],
    [/dispute|recognise|merchant/i, "Disputed transactions"],
    [/late|fee|waive/i, "Late fees and waivers"],
    [/angry|apologi|calm/i, "Handling an upset customer"],
    [/cvv|pin|fraud|never/i, "Security and fraud prevention"],
  ];
  const topics = topicMap.filter(([re]) => re.test(transcript)).map(([, t]) => t);

  const steps = pick(/first|then|before|block|verify|raise|take the|explain|ask the/i).slice(0, 6);
  const qa = pick(/question/i);
  const open = pick(/open question|need to confirm|not sure|tbd/i);

  const faq = qa
    .filter((x) => !/open question/i.test(x))
    .map((x) => {
      const [q, a] = x.split(/answer:/i);
      return { q: q.replace(/question( from \w+)?:/i, "").trim(), a: (a ?? "See transcript.").trim() };
    });

  const quiz = [] as GeneratedContent["quiz"];
  if (/block the card/i.test(transcript))
    quiz.push({ q: "A customer has lost their card. What do you do first?", options: ["Order a replacement", "Block the card", "Transfer to a team leader", "Ask for the CVV"], answer: 1 });
  if (/otp/i.test(transcript))
    quiz.push({ q: "Which of these must you NEVER ask the customer for?", options: ["Date of birth", "Last 4 digits of the card", "The CVV", "OTP for verification"], answer: 2 });
  if (/5 to 7 working days/i.test(transcript))
    quiz.push({ q: "How long does a replacement card take to arrive?", options: ["1 to 2 days", "5 to 7 working days", "2 weeks", "30 days"], answer: 1 });
  if (/only the verified card holder/i.test(transcript))
    quiz.push({ q: "A customer's husband asks for the card balance. What do you say?", options: ["Share it if he knows the card number", "Share it after he gives her date of birth", "Politely decline: only the verified card holder", "Share only the due date"], answer: 2 });
  if (!quiz.length && s.length)
    quiz.push({ q: "Which statement was covered in this session?", options: [s[0], "None of the above", "It was not discussed", "Unsure"], answer: 0 });

  return {
    summary: s.slice(0, 3).join(" ") || "No speech was captured in this session.",
    topics: topics.length ? topics : ["General discussion"],
    runbook: steps.map((step) => ({ step, source: `“${step.slice(0, 48)}…”` })),
    faq,
    quiz,
    openQuestions: open,
  };
}
