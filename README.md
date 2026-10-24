# SkillRelays AI

AI interview practice for students, and AI knowledge transfer for enterprises. This repo holds the investor demo.

## Run the web app locally

Needs Node 20 or newer.

```bash
cd apps/web
npm install
npm run dev
```

Open http://localhost:5173. Use Chrome or Edge for the full voice experience: the browser's speech recognition powers the live transcript, and its speech synthesis gives the interviewer a voice.

## What works today

- **Homepage** with Student and Enterprise entry points.
- **Enterprise KT session**: consent checkbox, browser audio recording (start, pause, resume, stop, playback), live transcript, and suggested questions for the trainer. Transcript files (TXT, VTT, SRT) can be uploaded, or the sample KT used.
- **Training content**: summary, topics, runbook steps traced to the transcript, FAQ, quiz and unanswered questions. Trainer approval is required before employees see it.
- **Employee quiz** with read-aloud questions and a score.
- **Knowledge Assistant** (Enterprise → Ask AI): upload training documents (Word .docx, TXT, Markdown, CSV, VTT, SRT), then ask questions. Answers come only from those documents and the KT transcript, with numbered source citations. Re-uploading a file with the same name replaces it with a new version.
- **Student voice mock interview**: the interviewer speaks, listens and responds conversationally. Results show rubric scores and next steps.

## Connect an AI tool

The Knowledge Assistant calls a real model when one is configured, and falls back to a simulated answer when not.

```bash
cd apps/web
cp .env.example .env.local
```

Fill in one provider in `.env.local` (Azure OpenAI, OpenAI or Anthropic Claude), then restart `npm run dev`. The page shows "Connected to …" when it's working. Keys stay in the Vite dev server's `/api/ask` endpoint and are never sent to the browser; `.env.local` is git-ignored.

## Honest limits

- AI output is **simulated** (deterministic, rule-based) and labeled "Simulated AI" in the UI, except the Knowledge Assistant once an AI key is set.
- The `/api/ask` endpoint runs inside the Vite dev/preview server. A production deployment needs it moved to a real backend.
- PDF uploads aren't read yet; save as .docx or text.
- Uploaded audio isn't transcribed yet; that needs the real speech-to-text connection.
- Demo state lives in the browser session only. There is no backend or database yet.
- The brand name is set by `VITE_BRAND_NAME` (defaults to SkillRelays) while trademark clearance is pending.
