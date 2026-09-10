from __future__ import annotations

import html
import os
import ssl
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass

UA = "262room-race-discovery/0.3 (+https://26-2room.com)"

@dataclass
class SearchHit:
    title: str
    url: str
    snippet: str = ""


def fetch_url(url: str, timeout: int = 18) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ru,en;q=0.8"})
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as response:
        ctype = response.headers.get("Content-Type", "")
        if "text" not in ctype and "html" not in ctype and "xml" not in ctype and "json" not in ctype:
            return ""
        data = response.read(2_000_000)
    return data.decode("utf-8", errors="replace")


def _rss_hits(raw: str, limit: int) -> list[SearchHit]:
    root = ET.fromstring(raw)
    hits: list[SearchHit] = []
    for item in root.findall(".//item"):
        link = (item.findtext("link") or "").strip()
        title = html.unescape((item.findtext("title") or "").strip())
        desc = html.unescape((item.findtext("description") or "").strip())
        if link.startswith("http"):
            hits.append(SearchHit(title=title, url=link, snippet=desc))
        if len(hits) >= limit:
            break
    return hits


class _BingRssSearchProvider:
    name = "BING_RSS"

    def search(self, query: str, limit: int = 10) -> list[SearchHit]:
        url = "https://www.bing.com/search?" + urllib.parse.urlencode({"q": query, "format": "rss"})
        return _rss_hits(fetch_url(url), limit)


class GoogleNewsRssSearchProvider:
    """Zero-secret news/newspaper discovery. Search output is discovery evidence only."""

    name = "GOOGLE_NEWS_RSS"

    def __init__(self, gl: str | None = None, language: str | None = None, ceid: str | None = None) -> None:
        self.gl = gl or os.environ.get("RACE_NEWS_GL", "KZ")
        self.language = language or os.environ.get("RACE_NEWS_LANGUAGE", "ru")
        self.ceid = ceid or os.environ.get("RACE_NEWS_CEID") or f"{self.gl}:{self.language}"

    def search(self, query: str, limit: int = 10) -> list[SearchHit]:
        url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({
            "q": query,
            "hl": self.language,
            "gl": self.gl,
            "ceid": self.ceid,
        })
        return _rss_hits(fetch_url(url), limit)


class CombinedSearchProvider:
    """Fan out to cheap independent discovery providers and deduplicate URLs."""

    def __init__(self, gl: str | None = None, language: str | None = None, ceid: str | None = None) -> None:
        self.providers = [_BingRssSearchProvider(), GoogleNewsRssSearchProvider(gl=gl, language=language, ceid=ceid)]

    def search(self, query: str, limit: int = 12) -> list[SearchHit]:
        per_provider = max(4, limit // len(self.providers) + 2)
        out: list[SearchHit] = []
        seen: set[str] = set()
        for provider in self.providers:
            try:
                hits = provider.search(query, limit=per_provider)
            except Exception:
                continue
            for hit in hits:
                if hit.url in seen:
                    continue
                seen.add(hit.url)
                out.append(hit)
                if len(out) >= limit:
                    return out
        return out


BingRssSearchProvider = CombinedSearchProvider
