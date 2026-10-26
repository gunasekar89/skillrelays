"""AI study planner for the student calendar: a day-by-day revision plan for upcoming exams.

The plan itself is built by a deterministic scheduler, not by the model, so every session lands on a real day
before its exam, within the time the learner said they have, in age-appropriate session lengths. It uses only
the exams, chapters and practice results the app sends: when there are no practice results for a subject, the
plan says so instead of guessing at weak spots. The model (when configured) only writes the short summary,
and that summary is checked against the plan before it is shown.
"""

from __future__ import annotations

import logging
import math
import re
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from . import llm
from .learner import Band, Language, band_rule, language_rule

log = logging.getLogger("skillrelays")

router = APIRouter(prefix="/api/calendar")

Kind = Literal["learn", "practise", "revise", "mock"]

# Session length, break and most study in a day, by stage. Younger learners get short sessions and a low daily cap.
PACE: dict[str, tuple[int, int, int]] = {
    "1-3": (15, 5, 30),
    "4-7": (25, 5, 60),
    "8-10": (40, 10, 150),
    "college": (50, 10, 240),
}

WEAK = 0.6  # recent practice below this average adds an extra practice session for the subject


class Chapter(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    done: bool = False


class Exam(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=200)
    subject: str = Field(default="", max_length=80)
    date: date
    chapters: list[Chapter] = Field(default_factory=list, max_length=40)


class Evidence(BaseModel):
    """Recent practice in a subject, from the learner's own quizzes and coach sessions in the app."""

    subject: str = Field(max_length=80)
    score: float | None = Field(default=None, ge=0, le=1)
    sessions: int = Field(default=0, ge=0)


class PlanRequest(BaseModel):
    today: date
    exams: list[Exam] = Field(min_length=1, max_length=12)
    weekday_minutes: int = Field(default=60, ge=0, le=480)
    weekend_minutes: int = Field(default=90, ge=0, le=600)
    free_dates: list[date] = Field(default_factory=list, max_length=120)  # holidays: weekend-sized study time
    busy_dates: list[date] = Field(default_factory=list, max_length=120)  # no study planned
    evidence: list[Evidence] = Field(default_factory=list, max_length=20)
    band: Band = "8-10"
    language: Language = "en"


class Session(BaseModel):
    date: date
    exam_id: str
    subject: str
    chapter: str
    kind: Kind
    minutes: int
    why: str


class PlanResponse(BaseModel):
    sessions: list[Session]
    warnings: list[str]
    summary: str
    session_minutes: int
    break_minutes: int
    unplanned: int
    provider: str
    model: str | None = None


# ---------- The scheduler ----------


def _label(exam: Exam) -> str:
    return exam.subject or exam.title


def _tasks(exam: Exam, evidence: dict[str, Evidence]) -> list[tuple[Kind, str, str]]:
    """What an exam needs, in study order: new chapters, extra practice where results show it, then a revision of every chapter."""
    todo = [c.name for c in exam.chapters if not c.done]
    done = [c.name for c in exam.chapters if c.done]
    tasks: list[tuple[Kind, str, str]] = [("learn", c, "You haven't marked this chapter as studied yet.") for c in todo]
    ev = evidence.get(exam.subject.lower())
    if ev and ev.score is not None and ev.sessions and ev.score < WEAK:
        target = todo[0] if todo else (done[0] if done else "Whole syllabus")
        tasks.append(("practise", target, f"Your recent {_label(exam)} practice averages {round(ev.score * 100)}%, so one extra practice session."))
    tasks += [("revise", c, "Marked as studied: a quick recall check so it stays fresh.") for c in done]
    tasks += [("revise", c, "A second look after learning it: spaced practice makes it last.") for c in todo]
    if not exam.chapters:
        tasks.append(("revise", "Whole syllabus", "No chapters were added for this exam, so revise from your notes."))
    return tasks


def build_plan(req: PlanRequest) -> tuple[list[Session], list[str], int]:
    length, _, cap = PACE.get(req.band, PACE["8-10"])
    exams = sorted((e for e in req.exams if e.date > req.today), key=lambda e: e.date)
    warnings: list[str] = []
    skipped = [e for e in req.exams if e.date <= req.today]
    if skipped:
        warnings.append(f"Left out {', '.join(_label(e) for e in skipped)}: the exam is today or already over.")
    if not exams:
        return [], warnings, 0

    exam_days = {e.date for e in req.exams}
    free, busy = set(req.free_dates), set(req.busy_dates)

    def slots_on(d: date) -> int:
        if d in busy:
            return 0
        mins = req.weekend_minutes if d.weekday() >= 5 or d in free else req.weekday_minutes
        mins = min(mins, cap)
        if d in exam_days:
            mins //= 2  # an exam day: less time, and the learner is tired
        return mins // length

    days = [req.today + timedelta(days=i) for i in range((exams[-1].date - req.today).days)]
    capacity = {d: slots_on(d) for d in days}
    evidence = {e.subject.lower(): e for e in req.evidence}
    queues = {e.id: _tasks(e, evidence) for e in exams}
    by_id = {e.id: e for e in exams}
    plan: list[Session] = []

    # The last study day before each exam is kept for a mixed practice paper across its chapters.
    for e in exams:
        last = next((d for d in reversed(days) if d < e.date and capacity[d] > 0), None)
        if last is None:
            continue
        capacity[last] -= 1
        plan.append(Session(date=last, exam_id=e.id, subject=_label(e), chapter="Mixed practice: all chapters", kind="mock", minutes=length, why="The day before: a timed practice paper without notes, like the real exam."))

    for d in days:
        today_ids: list[str] = []
        # Spread the work: each exam gets its fair share of today, not every free slot, so study isn't all front-loaded.
        quota = {}
        for e in exams:
            study_days = sum(1 for x in days if d <= x < e.date and capacity[x] > 0) or 1
            quota[e.id] = math.ceil(len(queues[e.id]) / study_days)
        for _ in range(capacity[d]):
            open_exams = [e for e in exams if e.date > d and queues[e.id] and today_ids.count(e.id) < quota[e.id]]
            if not open_exams:
                break

            def urgency(e: Exam) -> float:
                left = sum(capacity[x] for x in days if d <= x < e.date) or 1
                # Interleave: a subject already studied today waits, unless it is far more urgent.
                return len(queues[e.id]) / left - (0.5 if e.id in today_ids else 0)

            pick = max(open_exams, key=lambda e: (urgency(e), -e.date.toordinal()))
            kind, chapter, why = queues[pick.id].pop(0)
            today_ids.append(pick.id)
            plan.append(Session(date=d, exam_id=pick.id, subject=_label(pick), chapter=chapter, kind=kind, minutes=length, why=why))

    unplanned = 0
    for e in exams:
        left = len(queues[e.id])
        unplanned += left
        if left:
            warnings.append(
                f"Not enough study time before {_label(e)} for {left} more session{'s' if left > 1 else ''}. "
                "Add some time, or ask your teacher which chapters matter most."
            )
    for a, b in zip(exams, exams[1:]):
        if (b.date - a.date).days <= 1:
            warnings.append(f"{_label(a)} and {_label(b)} are close together: the plan revises {_label(b)} before {_label(a)} too.")
    for e in exams:
        if not any(s.exam_id == e.id for s in plan):
            warnings.append(f"No study time fits before {_label(e)}.")
    plan.sort(key=lambda s: (s.date, s.kind == "mock"))
    return plan, warnings, unplanned


def simple_summary(req: PlanRequest, plan: list[Session]) -> str:
    exams = sorted((e for e in req.exams if e.date > req.today), key=lambda e: e.date)
    if not exams or not plan:
        return "There is no study time to plan before these exams. Add some study minutes and try again."
    first = exams[0]
    days = (first.date - req.today).days
    todo = sum(1 for c in first.chapters if not c.done)
    when = "tomorrow" if days == 1 else f"in {days} days"
    parts = [f"Your {_label(first)} exam is {when}."]
    parts.append(
        f"Here is a plan of {len(plan)} short sessions"
        + (f", starting with the {todo} chapter{'s' if todo != 1 else ''} you haven't marked as studied" if todo else "")
        + ", with a practice paper the day before each exam."
    )
    known = {e.subject.lower() for e in req.evidence if e.score is not None and e.sessions}
    unknown = [_label(e) for e in exams if e.subject.lower() not in known]
    if unknown:
        parts.append(f"There are no practice results yet for {', '.join(unknown)}, so every chapter there gets the same time.")
    return " ".join(parts)


SUMMARY_PROMPT = (
    "You are a kind study coach writing to a school student about their revision plan. Write two or three short, warm "
    "sentences: say which exam comes first and when, what the plan focuses on, and one practical study habit. "
    "Use ONLY the facts given. Never add exams, chapters, dates, numbers or claims about the student's ability that are "
    "not in the facts. Reply with the sentences only."
)

NUMBER = re.compile(r"\d+")


def _grounded(text: str, facts: str) -> bool:
    """Every number in the summary must appear in the facts: a cheap guard against invented dates and counts."""
    return bool(text) and set(NUMBER.findall(text)) <= set(NUMBER.findall(facts))


@router.post("/plan", response_model=PlanResponse)
async def plan(req: PlanRequest) -> PlanResponse:
    sessions, warnings, unplanned = build_plan(req)
    length, rest, _ = PACE.get(req.band, PACE["8-10"])
    fallback = simple_summary(req, sessions)
    base = dict(sessions=sessions, warnings=warnings, session_minutes=length, break_minutes=rest, unplanned=unplanned)
    provider = llm.configured_provider()
    if provider is None or not sessions:
        return PlanResponse(summary=fallback, provider="Simulated", **base)
    facts = "\n".join(
        [f"Today: {req.today.isoformat()}", f"Plan summary: {fallback}"]
        + [f"Exam: {_label(e)} on {e.date.isoformat()} ({(e.date - req.today).days} days away); chapters not yet studied: {', '.join(c.name for c in e.chapters if not c.done) or 'none'}" for e in req.exams]
        + [f"Sessions: {len(sessions)} of {length} minutes, with {rest}-minute breaks"]
        + [f"Warning: {w}" for w in warnings]
    )
    try:
        text, _ = await llm.chat(
            provider,
            [{"role": "system", "content": SUMMARY_PROMPT + band_rule(req.band) + language_rule(req.language)}, {"role": "user", "content": facts}],
            timeout=30.0,
            max_tokens=220,
        )
        text = text.strip().strip('"')
        if not _grounded(text, facts):
            raise ValueError("summary used facts that aren't in the plan")
        return PlanResponse(summary=text, provider=provider.name, model=provider.model, **base)
    except Exception as exc:
        log.warning("Study plan summary failed, using simple version: %s", exc)
        return PlanResponse(summary=fallback, provider=f"Simulated ({provider.name} unavailable)", **base)
