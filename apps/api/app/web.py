"""Look up answers on the organisation's own website when the training documents don't cover them.

Only domains listed in WEB_LOOKUP_DOMAINS are ever fetched, so the assistant stays on topic.
Candidate pages come from the documents' own source links, the site's WordPress search and its home page.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import quote, urlparse

import httpx

from .retrieval import chunk_document, search, tokenize

log = logging.getLogger("skillrelays.web")

MAX_PAGE_BYTES = 1_500_000
USER_AGENT = "SkillRelaysTrainingAssistant/0.1 (+training demo)"


@dataclass
class WebPassage:
    url: str
    title: str
    text: str


def allowed_domains() -> list[str]:
    raw = os.getenv("WEB_LOOKUP_DOMAINS", "gardencity.university")
    return [d.strip().lower().removeprefix("www.") for d in raw.split(",") if d.strip()]


def is_allowed(url: str, domains: list[str]) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    host = (parsed.hostname or "").lower()
    return parsed.scheme in ("http", "https") and any(host == d or host.endswith("." + d) for d in domains)


class _Text(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "nav", "footer", "header", "form", "iframe"}

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.title = ""
        self._skip = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self._skip += 1
        elif tag == "title":
            self._in_title = True
        elif tag in ("p", "br", "li", "tr", "h1", "h2", "h3", "h4", "div", "section", "td"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self._skip:
            self._skip -= 1
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._skip:
            self.parts.append(data)


def html_to_text(html: str) -> tuple[str, str]:
    parser = _Text()
    parser.feed(html)
    lines = [re.sub(r"\s+", " ", x).strip() for x in "".join(parser.parts).splitlines()]
    return parser.title.strip(), "\n".join(x for x in lines if len(x) > 2)


def source_links(texts: list[str], domains: list[str]) -> list[tuple[str, str]]:
    """(description, url) pairs from a document's source register, e.g. "[07] Hostel tariffs" then its URL."""
    links: list[tuple[str, str]] = []
    for text in texts:
        lines = [x.strip() for x in text.splitlines()]
        for i, line in enumerate(lines):
            for url in re.findall(r"https?://[^\s)\]]+", line):
                if not is_allowed(url, domains):
                    continue
                label = line.replace(url, "").strip() or (lines[i - 1] if i else "")
                links.append((label, url.rstrip(".,;")))
    return links


def _rank_links(links: list[tuple[str, str]], query: str, k: int) -> list[str]:
    q = set(tokenize(query))
    scored = []
    for label, url in links:
        words = set(tokenize(label + " " + re.sub(r"[/\-_.]", " ", urlparse(url).path)))
        overlap = len(q & words)
        if overlap:
            scored.append((overlap, url))
    seen, ranked = set(), []
    for _, url in sorted(scored, key=lambda x: -x[0]):
        if url not in seen:
            seen.add(url)
            ranked.append(url)
    return ranked[:k]


async def _get(client: httpx.AsyncClient, url: str, domains: list[str]) -> httpx.Response | None:
    try:
        r = await client.get(url)
    except httpx.HTTPError as exc:
        log.info("web lookup failed for %s: %s", url, exc)
        return None
    if r.status_code != 200 or not is_allowed(str(r.url), domains) or len(r.content) > MAX_PAGE_BYTES:
        return None
    return r


async def _site_search(client: httpx.AsyncClient, domain: str, query: str, domains: list[str]) -> list[str]:
    """WordPress sites answer /wp-json/wp/v2/search; anything else simply returns nothing here."""
    terms = " ".join(tokenize(query)[:6])
    if not terms:
        return []
    r = await _get(client, f"https://www.{domain}/wp-json/wp/v2/search?per_page=4&search={quote(terms)}", domains)
    if r is None:
        return []
    try:
        return [x["url"] for x in r.json() if isinstance(x, dict) and is_allowed(x.get("url", ""), domains)]
    except ValueError:
        return []


async def lookup(query: str, doc_texts: list[str], limit_chars: int = 2400) -> list[WebPassage]:
    """The most relevant passages for the query from the allowed website(s)."""
    domains = allowed_domains()
    if not domains or os.getenv("WEB_LOOKUP", "on").lower() in ("off", "0", "false"):
        return []
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/json"}
    async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, headers=headers) as client:
        urls = _rank_links(source_links(doc_texts, domains), query, k=3)
        for found in await asyncio.gather(*(_site_search(client, d, query, domains) for d in domains)):
            urls += [u for u in found if u not in urls]
        urls += [f"https://www.{d}/" for d in domains]
        pages = await asyncio.gather(*(_get(client, u, domains) for u in urls[:6]))

    chunks, titles = [], {}
    for url, r in zip(urls, pages):
        if r is None or "html" not in r.headers.get("content-type", ""):
            continue
        title, text = html_to_text(r.text)
        titles[url] = title or url
        chunks += chunk_document(url, titles[url], text)
    passages: list[WebPassage] = []
    used = 0
    for hit in search(chunks, query, k=4):
        if used + len(hit.chunk.text) > limit_chars:
            break
        used += len(hit.chunk.text)
        passages.append(WebPassage(url=hit.chunk.doc_id, title=titles[hit.chunk.doc_id], text=hit.chunk.text))
    return passages
