import io

import pytest
from fastapi.testclient import TestClient

from app import llm
from app.main import app
from app.retrieval import chunk_document, search

client = TestClient(app)

RUNBOOK = {
    "id": "runbook",
    "title": "AKS Runbook",
    "version": 2,
    "text": (
        "When a pod is in CrashLoopBackOff, first run kubectl describe pod and check the events. "
        "Then run kubectl logs with the previous flag. Exit code 137 means the container was OOMKilled.\n\n"
        "On-call must acknowledge incidents within 15 minutes and post updates every 30 minutes."
    ),
}


@pytest.fixture(autouse=True)
def simulated(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "simulated")


def test_search_ranks_relevant_chunk_first():
    chunks = chunk_document("d", "Doc", RUNBOOK["text"], size=120)
    hits = search(chunks, "how fast must on-call acknowledge an incident")
    assert hits and "15 minutes" in hits[0].chunk.text


def test_ask_answers_from_documents_with_citation():
    r = client.post("/api/ask", json={"question": "What does exit code 137 mean?", "documents": [RUNBOOK]})
    body = r.json()
    assert r.status_code == 200
    assert body["grounded"] is True
    assert "OOMKilled" in body["answer"]
    assert body["citations"][0]["doc_id"] == "runbook"
    assert body["citations"][0]["version"] == 2


def test_ask_says_when_documents_do_not_cover_it():
    r = client.post("/api/ask", json={"question": "What is the parking policy?", "documents": [RUNBOOK]})
    body = r.json()
    assert body["grounded"] is False
    assert body["citations"] == []
    assert "couldn't find" in body["answer"]


def test_updated_document_changes_the_answer():
    updated = {**RUNBOOK, "version": 3, "text": RUNBOOK["text"].replace("15 minutes", "10 minutes")}
    r = client.post("/api/ask", json={"question": "How quickly must on-call acknowledge incidents?", "documents": [updated]})
    assert "10 minutes" in r.json()["answer"]


def test_llm_failure_falls_back(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.setenv("OPENAI_BASE_URL", "http://127.0.0.1:9")  # nothing listens here
    r = client.post("/api/ask", json={"question": "What does exit code 137 mean?", "documents": [RUNBOOK]})
    body = r.json()
    assert body["provider"].startswith("Simulated")
    assert "OOMKilled" in body["answer"]


def test_llm_answer_is_used_and_citations_filtered(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test")

    async def fake_chat(provider, messages, timeout=30.0):
        assert "Answer ONLY from the numbered sources" in messages[0]["content"]
        return "It means the container ran out of memory [1].", {"total_tokens": 42}

    monkeypatch.setattr(llm, "chat", fake_chat)
    body = client.post("/api/ask", json={"question": "exit code 137?", "documents": [RUNBOOK]}).json()
    assert body["provider"] == "OpenAI"
    assert body["answer"].endswith("[1].")
    assert [c["n"] for c in body["citations"]] == [1]
    assert body["usage"]["total_tokens"] == 42


def test_extract_docx():
    from docx import Document

    buf = io.BytesIO()
    d = Document()
    d.add_paragraph("Rotate secrets every 90 days.")
    d.save(buf)
    r = client.post("/api/extract", files={"file": ("policy.docx", buf.getvalue())})
    assert r.status_code == 200
    assert "90 days" in r.json()["text"]


def test_extract_rejects_unknown_type():
    r = client.post("/api/extract", files={"file": ("x.exe", b"MZ")})
    assert r.status_code == 415


def test_section_heading_guides_the_answer():
    guide = {
        "id": "cards",
        "title": "Fresher guide",
        "text": "Your role\nYou help customers with lost cards, payments and disputes.\n\n"
        "Lost or stolen card\nBlock the card immediately after verification.\nThe replacement arrives in 5 to 7 working days.",
    }
    body = client.post("/api/ask", json={"question": "What do I do when a card is lost or stolen?", "documents": [guide]}).json()
    assert body["answer"].split("say: ")[1].startswith("Block the card immediately")
