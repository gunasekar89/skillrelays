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


def test_serves_web_app_with_spa_fallback(tmp_path, monkeypatch):
    import importlib

    import app.main as main

    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>app</html>")
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    monkeypatch.setenv("WEB_DIST", str(tmp_path))
    web = TestClient(importlib.reload(main).app)
    try:
        assert web.get("/assets/app.js").text == "console.log(1)"
        assert web.get("/enterprise/assistant").text == "<html>app</html>"
        assert web.get("/../../etc/passwd").text == "<html>app</html>"
        assert web.get("/api/nope").status_code == 404
        assert web.get("/api/health").json()["ok"] is True
    finally:
        monkeypatch.delenv("WEB_DIST")
        importlib.reload(main)


def test_llm_retries_on_rate_limit(monkeypatch):
    import asyncio

    import httpx

    calls = []

    def handler(request):
        calls.append(1)
        if len(calls) == 1:
            return httpx.Response(429, headers={"retry-after": "0"})
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok [1]"}}], "usage": {}})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(llm.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    provider = llm.Provider("OpenAI", "m", "https://example.test/chat", {}, True)
    answer, _ = asyncio.run(llm.chat(provider, [{"role": "user", "content": "hi"}]))
    assert answer == "ok [1]" and len(calls) == 2


def test_chat_message_reaches_the_model_with_outline(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    seen = {}

    async def fake_chat(provider, messages, timeout=30.0):
        seen["prompt"] = messages[-1]["content"]
        return "Great, let's start with section 1 [1]. Say next to continue.", {}

    monkeypatch.setattr(llm, "chat", fake_chat)
    guide = {"id": "g", "title": "Guide", "text": "About the company\nAcme Bank is a retail bank.\n\nTickets\nCreate a ticket in the CRM."}
    body = client.post("/api/ask", json={"question": "sure lets start the training", "documents": [guide]}).json()
    assert body["answer"].startswith("Great, let's start")
    assert "About the company" in seen["prompt"] and "Tickets" in seen["prompt"]
    assert [c["doc_id"] for c in body["citations"]] == ["g"]


def test_one_citation_per_document():
    long_doc = {**RUNBOOK, "text": (RUNBOOK["text"] + " ") * 6}
    body = client.post("/api/ask", json={"question": "exit code 137 OOMKilled logs previous", "documents": [long_doc]}).json()
    assert len({c["doc_id"] for c in body["citations"]}) == len(body["citations"])


GUIDE = {
    "id": "guide",
    "title": "Fresher Guide",
    "text": "1. About the company\nAcme Bank was founded in 1998 in Chennai.\n\n"
    "2. Our credit card products\nThe Acme Spark Card has an annual fee of ₹499.\n\n"
    "3. Ticketing\nCreate a ticket in the CRM.",
}


@pytest.mark.parametrize(
    "message,history,section",
    [
        ("sure lets start the training", [], "Section 1 of 3: About the company"),
        ("Start my training", [], "Section 1 of 3: About the company"),
        ("next", [{"role": "assistant", "content": "Section 1 of 3: About the company ..."}], "Section 2 of 3: Our credit card products"),
        ("ok, continue", [{"role": "assistant", "content": "Section 2 of 3: Our credit card products ..."}], "Section 3 of 3: Ticketing"),
        ("explain that again", [{"role": "assistant", "content": "Section 2 of 3: ..."}], "Section 2 of 3: Our credit card products"),
        ("section 3", [], "Section 3 of 3: Ticketing"),
    ],
)
def test_training_walks_through_sections(message, history, section):
    body = client.post("/api/ask", json={"question": message, "documents": [GUIDE], "history": history}).json()
    assert body["answer"].startswith(section)
    assert body["citations"][0]["doc_id"] == "guide"


def test_training_sends_only_the_section_text(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    seen = {}

    async def fake_chat(provider, messages, timeout=30.0):
        seen["prompt"] = messages[-1]["content"]
        return "Section 2 of 3: Our credit card products ...", {}

    monkeypatch.setattr(llm, "chat", fake_chat)
    history = [{"role": "assistant", "content": "Section 1 of 3: About the company ..."}]
    client.post("/api/ask", json={"question": "next", "documents": [GUIDE], "history": history})
    assert "₹499" in seen["prompt"] and "1998" not in seen["prompt"]


def test_questions_with_training_words_are_still_questions():
    body = client.post("/api/ask", json={"question": "How do I start a ticket in the CRM?", "documents": [GUIDE]}).json()
    assert not body["answer"].startswith("Section")


def test_end_of_training():
    history = [{"role": "assistant", "content": "Section 3 of 3: Ticketing ..."}]
    body = client.post("/api/ask", json={"question": "next", "documents": [GUIDE], "history": history}).json()
    assert "end of the Fresher Guide" in body["answer"]


LESSON_2 = {"role": "assistant", "content": "Section 2 of 3: Our credit card products\n\nThe Spark Card costs ₹499 a year [1].\n\nCheck question: What is the Spark Card's annual fee? Say \"next\" to continue."}


def test_answer_to_check_question_is_graded(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    seen = {}

    async def fake_chat(provider, messages, timeout=30.0):
        seen["prompt"] = messages[-1]["content"]
        return "Correct! The Spark Card's annual fee is ₹499 [1]. Say \"next\" to continue.", {}

    monkeypatch.setattr(llm, "chat", fake_chat)
    body = client.post("/api/ask", json={"question": "499 rupees", "documents": [GUIDE], "history": [LESSON_2]}).json()
    assert "Correct!" in seen["prompt"] and "₹499" in seen["prompt"] and "Trainee's answer: 499 rupees" in seen["prompt"]
    assert body["answer"].startswith("Correct!") and body["citations"][0]["doc_id"] == "guide"


def test_next_after_grading_moves_on():
    history = [LESSON_2, {"role": "user", "content": "499"}, {"role": "assistant", "content": "Correct! ... Say \"next\" to continue."}]
    body = client.post("/api/ask", json={"question": "next", "documents": [GUIDE], "history": history}).json()
    assert body["answer"].startswith("Section 3 of 3: Ticketing")


def test_question_after_lesson_is_not_graded():
    body = client.post("/api/ask", json={"question": "How do I create a ticket?", "documents": [GUIDE], "history": [LESSON_2]}).json()
    assert not body["answer"].startswith("Thanks for your answer")


@pytest.fixture(autouse=True)
def _no_real_web(monkeypatch):
    monkeypatch.setenv("WEB_LOOKUP", "off")


def _with_model(monkeypatch, reply):
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    prompts = []

    async def fake_chat(provider, messages, timeout=30.0):
        prompts.append(messages[-1]["content"])
        return reply(prompts), {}

    monkeypatch.setattr(llm, "chat", fake_chat)
    return prompts


def test_unknown_answer_comes_from_the_official_website(monkeypatch):
    from app import web

    async def fake_lookup(query, texts, limit_chars=2400):
        return [web.WebPassage(url="https://www.gardencity.university/campus-life/sports/", title="Sports", text="GCU has a cricket ground and an indoor badminton court.")]

    monkeypatch.setattr(web, "lookup", fake_lookup)
    prompts = _with_model(monkeypatch, lambda p: "This isn't in the training document, but the official website says: there is a cricket ground [1].")
    body = client.post("/api/ask", json={"question": "Does the campus have a cricket ground?", "documents": [GUIDE]}).json()
    assert "official website" in prompts[-1] and "cricket ground" in prompts[-1]
    assert body["citations"][0]["url"] == "https://www.gardencity.university/campus-life/sports/"
    assert "official website" in body["provider"]


def test_website_is_tried_when_the_model_cannot_find_it_in_the_document(monkeypatch):
    from app import web

    calls = []

    async def fake_lookup(query, texts, limit_chars=2400):
        calls.append(query)
        return []

    monkeypatch.setattr(web, "lookup", fake_lookup)
    _with_model(monkeypatch, lambda p: "I couldn't find that in the training documents." if len(p) == 1 else "I can only help with questions about Garden City University.")
    body = client.post("/api/ask", json={"question": "What is the Spark Card annual fee for students?", "documents": [GUIDE]}).json()
    assert calls and body["answer"].startswith("I can only help")


def test_greetings_and_training_skip_the_website(monkeypatch):
    from app import web

    async def fail(*a, **k):
        raise AssertionError("website should not be searched")

    monkeypatch.setattr(web, "lookup", fail)
    _with_model(monkeypatch, lambda p: "Hello! Say \"start my training\" to begin.")
    for q in ["Hi", "thanks!", "sure lets start the training"]:
        assert client.post("/api/ask", json={"question": q, "documents": [GUIDE]}).status_code == 200


def test_only_allowed_domains_are_used():
    from app import web

    domains = ["gardencity.university"]
    assert web.is_allowed("https://www.gardencity.university/admissions/", domains)
    assert not web.is_allowed("https://gardencity.university.evil.com/", domains)
    assert not web.is_allowed("https://www.shiksha.com/gcu", domains)
    text = "[07] University hostel information and tariffs\nhttps://www.gardencity.university/campus-life/accommodation/\n[19] Reviews\nhttps://www.shiksha.com/x"
    assert web.source_links([text], domains) == [("[07] University hostel information and tariffs", "https://www.gardencity.university/campus-life/accommodation/")]
    title, body = web.html_to_text("<html><title>Hostel</title><script>x()</script><p>Rooms cost 1 lakh.</p><footer>f</footer></html>")
    assert title == "Hostel" and body == "Rooms cost 1 lakh."


def test_college_name_in_question_does_not_hide_the_answer():
    from app.retrieval import without_name

    assert "Garden" not in without_name("What is the MBA fee at Garden City University?", "Garden City University")
    assert without_name("Tell me about Garden City University", "Garden City University") == "Tell me about Garden City University"
    doc = {"id": "g", "title": "GCU", "text": "Garden City University is in Bengaluru. Garden City University has 9 schools.\n\nThe MBA fee total is ₹5,94,000.", "version": 1}
    body = client.post("/api/ask", json={"question": "What is the MBA fee at Garden City University?", "documents": [doc]}).json()
    assert "5,94,000" in body["answer"]


def test_website_passages_from_one_page_make_one_citation(monkeypatch):
    from app import web

    url = "https://www.gardencity.university/campus-life/digital-examination-policy/"

    async def fake_lookup(query, texts, limit_chars=2400):
        return [web.WebPassage(url=url, title="Exam policy", text="Formal dress code in exams."), web.WebPassage(url=url, title="Exam policy", text="Carry your ID card.")]

    monkeypatch.setattr(web, "lookup", fake_lookup)
    _with_model(monkeypatch, lambda p: "This isn't in the training document, but the official website says: formal dress [1].")
    body = client.post("/api/ask", json={"question": "Is there a dress code?", "documents": [GUIDE]}).json()
    assert [c["url"] for c in body["citations"]] == [url]
