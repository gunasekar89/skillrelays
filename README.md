# SkillRelays AI

AI interview practice for students, and AI knowledge transfer for enterprises. This repo holds the investor demo.

## Run the web app locally

Needs Node 20 or newer.

```bash
cd apps/web
npm install
npm run dev
```

Open http://localhost:5173.

## Run the API (AI knowledge assistant)

Needs Python 3.11 or newer. In a second terminal:

```bash
cd apps/api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # add an Azure OpenAI or OpenAI key, or leave blank for simulated mode
set -a && source .env && set +a
uvicorn app.main:app --port 8000
```

The web app proxies `/api` to port 8000. API keys stay on the server and never reach the browser. Without the API, the assistant still works in a labeled offline mode. Tests: `pip install -r requirements-dev.txt && pytest`. Use Chrome or Edge for the full voice experience: the browser's speech recognition powers the live transcript, and its speech synthesis gives the interviewer a voice.

## Put it online (Azure App Service)

The API also serves the built web app, so the whole demo deploys as one Python app. With the Azure CLI signed in:

```bash
deploy/azure/deploy-appservice.sh path/to/env-file   # env file with the AZURE_OPENAI_* values; optional
```

It builds the web app, creates an App Service plan and app in your first resource group, sets the AI settings on the server (they never reach the browser), deploys, and prints the public https link. Override `RESOURCE_GROUP`, `LOCATION`, `APP_NAME` or `SKU` as needed.

## Demo theme

The enterprise demo trains freshers on credit card customer support (BFSI). A sample KT session is built in, and `demo/enterprise/Acme-Bank-Cards-Complete-Fresher-Training-Guide.docx` is a mock document to upload to the AI assistant. All names, amounts and rules in the samples are made up.

## What works today

- **Homepage** with Student and Enterprise entry points.
- **Enterprise KT session**: consent checkbox, browser audio recording (start, pause, resume, stop, playback), live transcript, and suggested questions for the trainer. Transcript files (TXT, VTT, SRT) can be uploaded, or the sample KT used.
- **Training content**: summary, topics, runbook steps traced to the transcript, FAQ, quiz and unanswered questions. Trainer approval is required before employees see it.
- **Employee quiz** with read-aloud questions and a score.
- **AI knowledge assistant**: upload (PDF, DOCX, TXT, MD), write or edit training documents, then ask by voice or text. Answers come only from the documents, cite the passage and document version they used, and say so when the documents don't cover a question. Saving an edit bumps the version, and the next answer uses it. Approving a KT session adds it automatically. It uses Azure OpenAI or OpenAI when a key is set.
- **Student voice mock interview**: the interviewer speaks, listens and responds conversationally. Results show rubric scores and next steps.

## Honest limits

- KT processing and interview scoring are still **simulated** (deterministic, rule-based) and labeled "Simulated AI" in the UI. The knowledge assistant uses a real model when a key is set.
- Retrieval is keyword search (BM25), which suits a handful of documents. Embeddings come later if the corpus grows.
- Uploaded audio isn't transcribed yet; that needs the real speech-to-text connection.
- Documents and demo state live in the browser only. There is no database yet, so documents aren't shared between people or devices.
- The brand name is set by `VITE_BRAND_NAME` (defaults to SkillRelays) while trademark clearance is pending.
