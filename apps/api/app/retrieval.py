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

_TOKEN = re.compile(r"[a-z0-9][a-z0-9\-_.]*")


def tokenize(text: str) -> list[str]:
    return [t.strip(".") for t in _TOKEN.findall(text.lower()) if t.strip(".") not in STOPWORDS]


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
            chunks.append(Chunk(doc_id, title, " ".join(current)))
            current = current[-overlap:] if overlap else []
        current.append(s)
    if current:
        chunks.append(Chunk(doc_id, title, " ".join(current)))
    return chunks


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


def best_sentences(text: str, query: str, limit: int = 2) -> list[str]:
    q = set(tokenize(query))
    sentences = [s.strip() for s in re.split(r"(?<=[.?!])\s+", text) if s.strip()]
    scored = sorted(sentences, key=lambda s: len(q & set(tokenize(s))), reverse=True)
    return [s for s in scored[:limit] if q & set(tokenize(s))]
