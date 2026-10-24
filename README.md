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
- **Student voice mock interview**: the interviewer speaks, listens and responds conversationally. Results show rubric scores and next steps.

## Honest limits

- AI output is **simulated** (deterministic, rule-based) and labeled "Simulated AI" in the UI. Real model calls (Azure OpenAI or OpenAI) come next.
- Uploaded audio isn't transcribed yet; that needs the real speech-to-text connection.
- Demo state lives in the browser session only. There is no backend or database yet.
- The brand name is set by `VITE_BRAND_NAME` (defaults to SkillRelays) while trademark clearance is pending.
