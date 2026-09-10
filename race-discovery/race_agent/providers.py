from __future__ import annotations

import html
import ssl
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass

UA = "262room-race-discovery/0.1 (+https://26-2room.com)"

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


class BingRssSearchProvider:
    """Zero-secret bootstrap search provider. Replace/augment with a supported search API later."""

    def search(self, query: str, limit: int = 10) -> list[SearchHit]:
        url = "https://www.bing.com/search?" + urllib.parse.urlencode({"q": query, "format": "rss"})
        raw = fetch_url(url)
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
