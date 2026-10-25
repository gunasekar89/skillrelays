"""Signs that a learner may be in distress. The study tools stop and point to a trusted person instead of
carrying on with the lesson: an AI study tool must never act as a counsellor."""

from __future__ import annotations

import re

# Phrases, not single words, so "I'm dying to know" or "kill the process" don't trigger it.
_PATTERNS = [
    r"\b(kill|hurt|harm|cut)\s+my\s?self\b",
    r"\bsuicid",
    r"\bend\s+my\s+life\b",
    r"\b(want|wanna|going)\s+to\s+die\b",
    r"\bdon'?t\s+want\s+to\s+(live|be\s+alive|exist)\b",
    r"\bno\s+reason\s+to\s+live\b",
    r"(?<!\bit )\b(hits|beats|abuses|touches)\s+me\b",
    r"\b(being|am|getting)\s+(abused|bullied)\b",
    r"\bi\s+can'?t\s+(cope|go\s+on|take\s+it\s+anymore)\b",
    r"தற்கொலை",  # Tamil: suicide
    r"சாக\s*வேண்டும்",  # Tamil: want to die
]
_DISTRESS = re.compile("|".join(_PATTERNS), re.I)

MESSAGE = (
    "It sounds like you might be going through something really hard. I'm a study tool, so I'm not the right "
    "helper for this, but you deserve support from a person. Please talk to a parent, a teacher or another adult "
    "you trust today. In India you can call Tele-MANAS on 14416 (free, any time, in Tamil and English). "
    "If you are in danger right now, call 112."
)


def distress(*texts: str) -> bool:
    return any(t and _DISTRESS.search(t) for t in texts)
