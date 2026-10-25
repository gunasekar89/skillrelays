"""Who the learner is: their language and school stage shape how the AI words its replies."""

from __future__ import annotations

from typing import Literal

Language = Literal["en", "ta"]
Band = Literal["1-3", "4-7", "8-10", "college"]


def language_rule(language: str) -> str:
    """Appended to a system prompt so the model replies in the learner's language."""
    if language == "ta":
        return (
            "\n\nWrite every sentence of your reply (feedback, hints, answers and questions) in simple Tamil (தமிழ்), "
            "the way a friendly Tamil-medium school teacher speaks. Keep scientific or technical terms in English in "
            "brackets after the Tamil word. JSON keys and the verdict value stay in English."
        )
    return ""


def band_rule(band: str) -> str:
    """How much to say, by the learner's stage."""
    return {
        "1-3": "\n\nThe learner is 6 to 8 years old: use very short sentences, everyday words and one idea at a time.",
        "4-7": "\n\nThe learner is 9 to 12 years old: use short sentences and explain any new word.",
        "8-10": "\n\nThe learner is 13 to 16 years old and preparing for board exams.",
    }.get(band, "")
