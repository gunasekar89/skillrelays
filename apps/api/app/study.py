"""Study tools that make the learner think first: a hint-ladder coach and "explain it back".

Both follow the same idea from the research on AI for students: the AI should add thinking, not replace it.
The coach asks for an attempt, then gives one hint at a time and reveals the answer only at the end. Explain it
back checks the learner's own words against their notes. Each uses the configured model when there is one and
a rule-based version otherwise, so the study page keeps working in demos without an AI key.
"""

from __future__ import annotations

import logging
import random
import re
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from . import llm
from .notes import MAX_NOTE_CHARS, NOTES_PROMPT, _cards_by_kind, _clean, _json, _sentences
from .retrieval import tokenize

log = logging.getLogger("skillrelays")

router = APIRouter(prefix="/api/study")

LAST_STEP = 4  # 1 nudge, 2 where to look, 3 partial answer, 4 the answer

Verdict = Literal["correct", "partly", "not_yet", "none"]


class QuestionRequest(BaseModel):
    title: str = Field(default="", max_length=200)
    text: str = Field(min_length=1, max_length=MAX_NOTE_CHARS)
    skip: list[str] = Field(default_factory=list, max_length=50)


class QuestionResponse(BaseModel):
    question: str
    provider: str
    model: str | None = None


class CoachRequest(BaseModel):
    title: str = Field(default="", max_length=200)
    text: str = Field(min_length=1, max_length=MAX_NOTE_CHARS)
    question: str = Field(min_length=3, max_length=500)
    attempt: str = Field(default="", max_length=2000)
    step: int = Field(default=0, ge=0, le=LAST_STEP)  # how many hints the learner has had, including this one


class CoachResponse(BaseModel):
    verdict: Verdict
    feedback: str
    hint: str = ""
    answer: str = ""  # only on the last step, or once the learner has it right
    step: int
    provider: str
    model: str | None = None


class ExplainRequest(BaseModel):
    title: str = Field(default="", max_length=200)
    text: str = Field(min_length=1, max_length=MAX_NOTE_CHARS)
    explanation: str = Field(min_length=1, max_length=6000)


class ExplainResponse(BaseModel):
    score: int
    feedback: str
    covered: list[str] = Field(default_factory=list)
    missed: list[str] = Field(default_factory=list)
    mistakes: list[str] = Field(default_factory=list)
    follow_up: str = ""
    provider: str
    model: str | None = None


# ---------- Rule-based versions (no AI key) ----------

NUMBER = re.compile(r"\d+(?:[.,]\d+)?")


def _facts(text: str) -> list[tuple[str, str]]:
    """(heading, sentence) for every sentence worth knowing. A short line without closing punctuation is a heading."""
    facts: list[tuple[str, str]] = []
    heading = ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        is_bullet = re.match(r"^([-*•]|\d+[.)])\s", line)
        if not is_bullet and len(line.split()) <= 5 and not re.search(r"[.?!]$", line):
            heading = line.strip(" :")
            continue
        for s in _sentences(line):
            if len(s.split()) >= 4:
                facts.append((heading, _clean(s).rstrip(".")))
    return facts


def _best_fact(text: str, question: str) -> tuple[str, str] | None:
    q = set(tokenize(question))
    scored = [(len(q & set(tokenize(f"{h} {s}"))) + 0.5 * len(q & set(tokenize(s))), h, s) for h, s in _facts(text)]
    scored = [x for x in scored if x[0] > 0]
    if not scored:
        return None
    _, heading, sentence = max(scored, key=lambda x: x[0])
    return heading, sentence


def _key_words(sentence: str, question: str) -> list[str]:
    """Words of the answer sentence that the question doesn't already give away."""
    asked = set(tokenize(question))
    words = [w.strip(".,;:!?()\"'") for w in sentence.split()]
    keys = [w for w in words if tokenize(w) and tokenize(w)[0] not in asked]
    return list(dict.fromkeys(keys)) or [w for w in words if tokenize(w)]


def _mark(attempt: str, sentence: str, question: str) -> tuple[Verdict, float]:
    if not attempt.strip():
        return "none", 0.0
    keys = {tokenize(w)[0] for w in _key_words(sentence, question)}
    said = set(tokenize(attempt))
    share = len(keys & said) / len(keys) if keys else 0.0
    # A wrong number is wrong, however many other words match.
    wrong_number = set(NUMBER.findall(attempt)) - set(NUMBER.findall(sentence)) and NUMBER.search(sentence)
    if wrong_number:
        return "not_yet", share
    if share >= 0.6:
        return "correct", share
    return ("partly" if share >= 0.25 else "not_yet"), share


def _blank_out(sentence: str, keys: list[str]) -> str:
    """Hide most of the answer words, keeping the first one as a clue."""
    out = sentence
    for w in keys[1:]:
        out = re.sub(rf"\b{re.escape(w)}\b", "_" * min(len(w), 6), out, count=1)
    return out


def _simple_question(text: str, skip: list[str]) -> str:
    cards = [c.front for _, c in _cards_by_kind(text) if c.front not in skip]
    if not cards:
        facts = _facts(text)
        cards = [f"What do your notes say about {h or s.split()[0]}?" for h, s in facts]
        cards = [c for c in cards if c not in skip] or cards
    if not cards:
        return "What is the main idea of these notes?"
    return random.Random(len(text) + len(skip)).choice(cards)


def _simple_coach(req: CoachRequest) -> dict:
    fact = _best_fact(req.text, req.question)
    if fact is None:
        return {
            "verdict": "none",
            "feedback": "I couldn't find this in your notes, so I can't check it. Try a question about something you wrote down.",
            "step": req.step,
        }
    heading, sentence = fact
    keys = _key_words(sentence, req.question)
    verdict, _ = _mark(req.attempt, sentence, req.question)
    feedback = {
        "correct": "Yes, that matches your notes. Well done.",
        "partly": "You're on the right track, but part of the answer is missing.",
        "not_yet": "Not quite yet. That doesn't match what your notes say.",
        "none": "Have a go first, even a guess. Trying to remember is what makes it stick.",
    }[verdict]
    if verdict == "correct" or req.step >= LAST_STEP:
        return {"verdict": verdict, "feedback": feedback, "answer": sentence, "step": LAST_STEP if verdict != "correct" else req.step}
    hint = ""
    if req.step == 1:
        topic = " ".join(_key_words(heading, "")[:3]) if heading else ""
        hint = f"Think about the part of your notes on {topic}. What did you write there?" if topic else "Think back to when you wrote these notes. What was the main fact about this?"
    elif req.step == 2:
        hint = f"Look for the line that starts \"{' '.join(sentence.split()[:3])}…\". The answer has {len(keys)} key word{'s' if len(keys) != 1 else ''}."
    elif req.step == 3:
        hint = f"Fill in the gaps: {_blank_out(sentence, keys)}"
    return {"verdict": verdict, "feedback": feedback, "hint": hint, "step": req.step}


def _simple_explain(req: ExplainRequest) -> dict:
    facts = [s for _, s in _facts(req.text)][:12]
    said = set(tokenize(req.explanation))
    covered, missed = [], []
    for s in facts:
        words = set(tokenize(s))
        (covered if words and len(words & said) / len(words) >= 0.4 else missed).append(s)
    note_numbers = set(NUMBER.findall(req.text))
    mistakes = [f"You said {n}, but that number isn't in your notes. Check it." for n in dict.fromkeys(NUMBER.findall(req.explanation)) if n not in note_numbers][:3]
    score = round(100 * len(covered) / len(facts)) if facts else 0
    score = max(0, score - 10 * len(mistakes))
    if score >= 80:
        feedback = "Great explanation. You covered nearly everything in your notes in your own words."
    elif score >= 50:
        feedback = "Good start. You explained the main ideas; add the points below to make it complete."
    else:
        feedback = "You've made a start. Read the points you missed, then try explaining again without looking."
    follow_up = ""
    if missed:
        cards = [c.front for _, c in _cards_by_kind(missed[0])]
        follow_up = cards[0] if cards else f"Can you explain this part: {missed[0]}?"
    return {"score": score, "feedback": feedback, "covered": covered, "missed": missed, "mistakes": mistakes, "follow_up": follow_up}


# ---------- Model versions ----------

COACH_PROMPT = (
    "You are a study coach. The learner is answering a question about their own notes. Your job is to help them think, "
    "not to give the answer away. Use only facts in the notes.\n"
    "Hint step {step} of " + str(LAST_STEP) + ":\n"
    "- step 0: only check the attempt. Give no hint.\n"
    "- step 1: a guiding question that points them towards the idea, without any words from the answer.\n"
    "- step 2: tell them which part or heading of the notes to look at, and one clue.\n"
    "- step 3: a partly worked answer with the key words left as blanks (____).\n"
    "- step 4: give the answer, quoting the notes, and one sentence on why.\n"
    "If the attempt is fully right at any step, say so and give the answer. Never give the answer before step 4 otherwise. "
    "Feedback is one or two warm sentences: say what is right in the attempt before what is missing. "
    "If the question is not covered by the notes, say so with verdict \"none\".\n"
    'Reply with JSON only: {{"verdict": "correct" | "partly" | "not_yet" | "none", "feedback": "...", "hint": "...", "answer": "..."}} '
    '(leave "hint" or "answer" empty when not allowed). Use "none" also when there is no attempt yet.'
)

EXPLAIN_PROMPT = (
    "The learner explained their notes in their own words, often out loud, so ignore filler words and small grammar slips. "
    "Compare the explanation with the notes. List the key points they covered, the important points they missed, and anything "
    "they said that contradicts the notes. Score 0-100 for how completely and correctly they explained the notes. "
    "Feedback is two warm sentences, praise first. Then one follow-up question about the most important missed point.\n"
    'Reply with JSON only: {"score": 0-100, "feedback": "...", "covered": ["..."], "missed": ["..."], '
    '"mistakes": ["..."], "follow_up": "..."}'
)

QUESTION_PROMPT = (
    "Write one short question that checks understanding of an important fact in these notes. The answer must be in the notes. "
    "Ask it so the learner has to recall or explain, not just say yes or no. Reply with the question only."
)


def _notes_block(title: str, text: str) -> str:
    return f"Notes titled \"{title or 'Untitled'}\":\n{text[:12000]}"


async def _ask(messages: list[dict], max_tokens: int = 600) -> tuple[str, llm.Provider]:
    provider = llm.configured_provider()
    if provider is None:
        raise LookupError
    answer, _ = await llm.chat(provider, messages, timeout=45.0, max_tokens=max_tokens)
    return answer, provider


def _fallback_name(exc: Exception) -> str:
    provider = llm.configured_provider()
    return "Simulated" if isinstance(exc, LookupError) or provider is None else f"Simulated ({provider.name} unavailable)"


@router.post("/question", response_model=QuestionResponse)
async def question(req: QuestionRequest) -> QuestionResponse:
    avoid = "\n".join(f"- {q}" for q in req.skip[-10:])
    messages = [
        {"role": "system", "content": NOTES_PROMPT},
        {"role": "user", "content": f"{QUESTION_PROMPT}" + (f"\nDon't repeat these:\n{avoid}" if avoid else "") + f"\n\n{_notes_block(req.title, req.text)}"},
    ]
    try:
        answer, provider = await _ask(messages, max_tokens=120)
        q = answer.strip().strip('"').splitlines()[0].strip()
        if len(q) < 5:
            raise ValueError("empty question")
        return QuestionResponse(question=q, provider=provider.name, model=provider.model)
    except Exception as exc:
        if not isinstance(exc, LookupError):
            log.warning("Study question failed, using simple version: %s", exc)
        return QuestionResponse(question=_simple_question(req.text, req.skip), provider=_fallback_name(exc))


@router.post("/coach", response_model=CoachResponse)
async def coach(req: CoachRequest) -> CoachResponse:
    messages = [
        {"role": "system", "content": f"{NOTES_PROMPT}\n\n{COACH_PROMPT.format(step=req.step)}"},
        {
            "role": "user",
            "content": f"{_notes_block(req.title, req.text)}\n\nQuestion: {req.question}\nLearner's attempt: {req.attempt or '(no attempt yet)'}\nHint step: {req.step}",
        },
    ]
    try:
        answer, provider = await _ask(messages)
        data = _json(answer)
        verdict = data.get("verdict") if data.get("verdict") in ("correct", "partly", "not_yet", "none") else "not_yet"
        reveal = verdict == "correct" or req.step >= LAST_STEP
        return CoachResponse(
            verdict=verdict,
            feedback=str(data.get("feedback", "")).strip() or "Let's keep going.",
            hint="" if reveal else str(data.get("hint", "")).strip(),
            # Don't trust the model to hold back: the answer only goes out when the ladder allows it.
            answer=str(data.get("answer", "")).strip() if reveal else "",
            step=LAST_STEP if req.step >= LAST_STEP else req.step,
            provider=provider.name,
            model=provider.model,
        )
    except Exception as exc:
        if not isinstance(exc, LookupError):
            log.warning("Study coach failed, using simple version: %s", exc)
        return CoachResponse(provider=_fallback_name(exc), **_simple_coach(req))


@router.post("/explain", response_model=ExplainResponse)
async def explain(req: ExplainRequest) -> ExplainResponse:
    messages = [
        {"role": "system", "content": f"{NOTES_PROMPT}\n\n{EXPLAIN_PROMPT}"},
        {"role": "user", "content": f"{_notes_block(req.title, req.text)}\n\nThe learner's explanation:\n{req.explanation}"},
    ]
    try:
        answer, provider = await _ask(messages, max_tokens=900)
        data = _json(answer)
        lists = {k: [str(x).strip() for x in data.get(k, []) if str(x).strip()][:10] for k in ("covered", "missed", "mistakes")}
        return ExplainResponse(
            score=max(0, min(100, int(data.get("score", 0)))),
            feedback=str(data.get("feedback", "")).strip(),
            follow_up=str(data.get("follow_up", "")).strip(),
            provider=provider.name,
            model=provider.model,
            **lists,
        )
    except Exception as exc:
        if not isinstance(exc, LookupError):
            log.warning("Explain it back failed, using simple version: %s", exc)
        return ExplainResponse(provider=_fallback_name(exc), **_simple_explain(req))
