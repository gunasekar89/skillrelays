"""Keyword retrieval over training documents.

BM25 over small overlapping chunks. Cheap, deterministic and good enough for a
handful of documents; swap for embeddings + pgvector once the corpus grows.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass

STOPWORDS = set(
    "a an and are as at be by can do does for from how i if in is it its of on or our so that the their them then there "
    "this to was we what when where which who why will with you your should would could about into".split()
)

# Words that say nothing about what is being asked; a question left with only these keeps the name.
VAGUE = {"tell", "me", "about", "good", "bad", "info", "information", "detail", "details", "know", "explain", "please", "more", "student"}

_TOKEN = re.compile(r"[a-z0-9][a-z0-9\-_.]*")


def _stem(t: str) -> str:
    # Crude suffix stripping so "takes", "taking" and "take" match. Good enough for keyword search.
    for suffix in ("ing", "ed", "es", "s", "e"):
        if len(t) > len(suffix) + 2 and t.endswith(suffix):
            return t[: -len(suffix)]
    return t


def without_name(text: str, name: str) -> str:
    """Drop the organisation's name (and its initials) from a question, so "the MBA fee at Garden City
    University" searches for "MBA fee" instead of every passage that names the university."""
    words = [w for w in re.findall(r"[A-Za-z]+", name) if len(w) > 1]
    if not words:
        return text
    names = {w.lower() for w in words} | {"".join(w[0] for w in words).lower()}
    stripped = re.sub(r"\b(" + "|".join(map(re.escape, names)) + r")\b('s)?", " ", text, flags=re.I)
    return stripped if set(tokenize(stripped)) - VAGUE else text


def tokenize(text: str) -> list[str]:
    words = (t.strip(".") for t in _TOKEN.findall(text.lower()))
    return [_stem(t) for t in words if len(t) > 1 and t not in STOPWORDS]


@dataclass
class Chunk:
    doc_id: str
    title: str
    text: str


@dataclass
class Hit:
    chunk: Chunk
    score: float


def chunk_document(doc_id: str, title: str, text: str, size: int = 700, overlap: int = 1) -> list[Chunk]:
    """Split on paragraphs, then pack sentences into ~size-char chunks with one sentence of overlap."""
    sentences = [s.strip() for s in re.split(r"(?<=[.?!])\s+|\n{2,}|\n(?=[-*\d])", text) if s.strip()]
    chunks: list[Chunk] = []
    current: list[str] = []
    for s in sentences:
        if current and sum(len(x) for x in current) + len(s) > size:
            chunks.append(Chunk(doc_id, title, "\n".join(current)))
            current = current[-overlap:] if overlap else []
        current.append(s)
    if current:
        chunks.append(Chunk(doc_id, title, "\n".join(current)))
    return chunks


def idf_table(chunks: list[Chunk]) -> tuple[Counter, int]:
    return Counter(t for c in chunks for t in set(tokenize(c.text + " " + c.title))), len(chunks)


def idf(term: str, df: Counter, n: int) -> float:
    return math.log(1 + (n - df[term] + 0.5) / (df[term] + 0.5))


def coverage(chunk: Chunk, query: str, df: Counter, n: int) -> float:
    """Share of the query's information (idf-weighted) that this chunk contains."""
    q = set(tokenize(query))
    if not q:
        return 0.0
    present = set(tokenize(chunk.text + " " + chunk.title))
    total = sum(idf(t, df, n) for t in q)
    return sum(idf(t, df, n) for t in q if t in present) / total


def search(chunks: list[Chunk], query: str, k: int = 4, k1: float = 1.4, b: float = 0.75) -> list[Hit]:
    q = tokenize(query)
    if not q or not chunks:
        return []
    docs = [tokenize(c.text + " " + c.title) for c in chunks]
    avg = sum(len(d) for d in docs) / len(docs) or 1
    df = Counter(t for d in docs for t in set(d))
    n = len(docs)
    hits: list[Hit] = []
    for chunk, toks in zip(chunks, docs):
        tf = Counter(toks)
        score = 0.0
        for t in q:
            if t not in tf:
                continue
            idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
            score += idf * tf[t] * (k1 + 1) / (tf[t] + k1 * (1 - b + b * len(toks) / avg))
        if score > 0:
            hits.append(Hit(chunk, score))
    hits.sort(key=lambda h: h.score, reverse=True)
    return hits[:k]


def best_sentences(texts: list[str], query: str, df: Counter, n: int, limit: int = 2) -> list[tuple[int, str]]:
    """Most query-relevant sentences across the given texts, as (text index, sentence)."""
    q = set(tokenize(query))
    scored: list[tuple[float, int, str]] = []
    for i, text in enumerate(texts):
        heading: set[str] = set()
        for line in text.split("\n"):
            line = line.strip()
            # A line without closing punctuation is a heading: it gives context to the sentences under it.
            if line and not re.search(r"[.?!\"”]$", line):
                heading = set(tokenize(line))
                continue
            for s in re.split(r"(?<=[.?!])\s+(?=[A-Z0-9\"“])", line):
                s = s.strip()
                if len(s) < 15:
                    continue
                words = set(tokenize(s))
                score = sum(idf(t, df, n) for t in q & words) + 0.8 * sum(idf(t, df, n) for t in (q & heading) - words)
                if score > 0:
                    scored.append((score, i, s))
    scored.sort(key=lambda x: x[0], reverse=True)
    if not scored:
        return []
    top = scored[0][0]
    picked: list[tuple[int, str]] = []
    for score, i, s in scored:
        if len(picked) == limit or score < top * 0.6:
            break
        if all(s != p for _, p in picked):  # the same sentence can sit in several documents or chunks
            picked.append((i, s))
    return picked
