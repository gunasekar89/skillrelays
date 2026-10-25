from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app import llm
from app.main import app

client = TestClient(app)

TODAY = date(2026, 11, 2)  # a Monday


@pytest.fixture(autouse=True)
def simulated(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "simulated")


def exam(id, subject, days, chapters, done=()):
    return {
        "id": id,
        "title": f"{subject} exam",
        "subject": subject,
        "date": (TODAY + timedelta(days=days)).isoformat(),
        "chapters": [{"name": c, "done": c in done} for c in chapters],
    }


def plan(**body):
    r = client.post("/api/calendar/plan", json={"today": TODAY.isoformat(), **body})
    assert r.status_code == 200, r.text
    return r.json()


def test_every_session_is_before_its_exam_and_within_daily_time():
    body = plan(exams=[exam("m", "Mathematics", 5, ["Polynomials", "Triangles", "Coordinate geometry"]), exam("s", "Science", 8, ["Light", "Acids"])], weekday_minutes=80, weekend_minutes=120, band="8-10")
    dates = {"m": TODAY + timedelta(days=5), "s": TODAY + timedelta(days=8)}
    assert body["sessions"]
    per_day: dict[str, int] = {}
    for s in body["sessions"]:
        assert TODAY.isoformat() <= s["date"] < dates[s["exam_id"]].isoformat()
        per_day[s["date"]] = per_day.get(s["date"], 0) + s["minutes"]
    for d, mins in per_day.items():
        limit = 120 if date.fromisoformat(d).weekday() >= 5 else 80
        assert mins <= limit
    learned = {s["chapter"] for s in body["sessions"] if s["kind"] == "learn"}
    assert learned == {"Polynomials", "Triangles", "Coordinate geometry", "Light", "Acids"}
    assert body["unplanned"] == 0


def test_mock_paper_on_the_last_day_before_each_exam():
    body = plan(exams=[exam("m", "Mathematics", 4, ["Fractions"])], weekday_minutes=60, band="8-10")
    mocks = [s for s in body["sessions"] if s["kind"] == "mock"]
    assert [m["date"] for m in mocks] == [(TODAY + timedelta(days=3)).isoformat()]


def test_younger_students_get_short_sessions_and_a_daily_cap():
    body = plan(exams=[exam("e", "EVS", 6, ["Plants", "Animals", "Water", "Air"])], weekday_minutes=120, weekend_minutes=120, band="1-3")
    assert body["session_minutes"] == 15
    per_day: dict[str, int] = {}
    for s in body["sessions"]:
        per_day[s["date"]] = per_day.get(s["date"], 0) + s["minutes"]
    assert max(per_day.values()) <= 30


def test_no_weak_spot_without_practice_results():
    body = plan(exams=[exam("m", "Mathematics", 6, ["Fractions", "Decimals"])], band="4-7")
    assert not any(s["kind"] == "practise" for s in body["sessions"])
    assert "no practice results yet for Mathematics" in body["summary"]


def test_low_practice_scores_add_a_practice_session():
    body = plan(exams=[exam("m", "Mathematics", 6, ["Fractions", "Decimals"])], evidence=[{"subject": "Mathematics", "score": 0.4, "sessions": 3}], band="4-7")
    practise = [s for s in body["sessions"] if s["kind"] == "practise"]
    assert len(practise) == 1 and "40%" in practise[0]["why"]


def test_studied_chapters_get_revision_not_learning():
    body = plan(exams=[exam("m", "Mathematics", 6, ["Fractions", "Decimals"], done=["Fractions"])], band="8-10")
    kinds = {(s["chapter"], s["kind"]) for s in body["sessions"]}
    assert ("Fractions", "revise") in kinds and ("Decimals", "learn") in kinds
    assert ("Fractions", "learn") not in kinds


def test_not_enough_time_is_reported_not_squeezed():
    body = plan(exams=[exam("m", "Mathematics", 2, [f"Chapter {i}" for i in range(10)])], weekday_minutes=40, band="8-10")
    assert body["unplanned"] > 0
    assert any("Not enough study time" in w for w in body["warnings"])


def test_busy_days_get_no_study_and_holidays_get_more():
    holiday = TODAY + timedelta(days=1)
    busy = TODAY + timedelta(days=2)
    body = plan(exams=[exam("m", "Mathematics", 6, [f"Ch {i}" for i in range(12)])], weekday_minutes=40, weekend_minutes=120, free_dates=[holiday.isoformat()], busy_dates=[busy.isoformat()], band="8-10")
    on = lambda d: sum(s["minutes"] for s in body["sessions"] if s["date"] == d.isoformat())
    assert on(busy) == 0
    assert on(holiday) == 120


def test_past_exams_are_left_out_with_a_warning():
    body = plan(exams=[exam("old", "English", 0, ["Grammar"]), exam("m", "Mathematics", 3, ["Fractions"])])
    assert all(s["exam_id"] == "m" for s in body["sessions"])
    assert any("English" in w for w in body["warnings"])


def test_close_exams_are_flagged():
    body = plan(exams=[exam("m", "Mathematics", 5, ["A"]), exam("s", "Science", 6, ["B"])])
    assert any("close together" in w for w in body["warnings"])


def test_model_summary_with_invented_numbers_falls_back(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test")

    async def fake_chat(provider, messages, timeout=30.0, max_tokens=500):
        return "Your maths exam is in 99 days, you are weak at algebra.", {}

    monkeypatch.setattr(llm, "chat", fake_chat)
    body = plan(exams=[exam("m", "Mathematics", 5, ["Fractions"])])
    assert body["provider"].startswith("Simulated")
    assert "99" not in body["summary"]


def test_model_summary_is_used_when_grounded(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test")

    async def fake_chat(provider, messages, timeout=30.0, max_tokens=500):
        assert "Mathematics" in messages[1]["content"]
        return "Your Mathematics exam is in 5 days. Start with Fractions and test yourself without notes.", {}

    monkeypatch.setattr(llm, "chat", fake_chat)
    body = plan(exams=[exam("m", "Mathematics", 5, ["Fractions"])])
    assert body["provider"] == "OpenAI"
    assert body["summary"].startswith("Your Mathematics exam is in 5 days")


def test_study_is_spread_over_the_days_not_front_loaded():
    body = plan(exams=[exam("m", "Mathematics", 14, ["A", "B", "C", "D"])], weekday_minutes=120, weekend_minutes=120, band="8-10")
    days = {s["date"] for s in body["sessions"] if s["kind"] != "mock"}
    assert len(days) >= 6
