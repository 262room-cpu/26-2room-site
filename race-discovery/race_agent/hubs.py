from __future__ import annotations

import html
import re
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, urlunparse

from .core import EVENT_KEYWORDS, extract_jsonld_events, normalize
from .telegram_public import is_public_channel_feed, parse_public_channel

HUB_PATH_HINTS = {
    "calendar", "календарь", "events", "event-list", "competitions", "races",
    "race-calendar", "afisha", "афиша", "start-list", "starts", "series",
}

BLOCKED_PATH_TERMS = (
    "login", "signin", "signup", "account", "profile", "privacy", "policy", "terms",
    "help", "faq", "contacts", "contact-us", "news", "blog", "results", "result",
    "partners", "sponsors", "volunteer", "shop", "cart", "checkout", "ticket",
    "registration", "register", "regulation", "rules", "gallery", "photo", "video",
)

GENERIC_LINK_TEXT = {
    "подробнее", "детали", "event details", "details", "learn more", "more", "читать",
    "read more", "регистрация", "register", "registration",
}


class _AnchorParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[dict[str, str]] = []
        self._href = ""
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        data = dict(attrs)
        self._href = html.unescape(data.get("href") or "").strip()
        self._text = []

    def handle_data(self, data: str) -> None:
        if self._href:
            value = " ".join(data.split())
            if value:
                self._text.append(value)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "a" and self._href:
            self.links.append({"href": self._href, "text": " ".join(self._text).strip()})
            self._href = ""
            self._text = []


def _clean_url(base_url: str, href: str) -> str:
    if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
        return ""
    try:
        absolute = urljoin(base_url, href)
        p = urlparse(absolute)
        if p.scheme not in {"http", "https"}:
            return ""
        return urlunparse((p.scheme, p.netloc, p.path, "", p.query, ""))
    except Exception:
        return ""


def _host(url: str) -> str:
    try:
        return urlparse(url).netloc.lower().split(":", 1)[0].removeprefix("www.")
    except Exception:
        return ""


def _same_site(a: str, b: str) -> bool:
    """Treat organizer-owned subdomains as the same site family."""
    da, db = _host(a), _host(b)
    if not da or not db:
        return False
    return da == db or db.endswith("." + da) or da.endswith("." + db)


def _path(url: str) -> str:
    try:
        return urlparse(url).path.lower().rstrip("/")
    except Exception:
        return ""


def _segments(url: str) -> list[str]:
    return [normalize(x) for x in _path(url).split("/") if x]


def _explicit_hub_url(url: str) -> bool:
    segments = _segments(url)
    if not segments:
        return False
    return segments[-1] in {normalize(x) for x in HUB_PATH_HINTS}


def _eventish(value: str) -> bool:
    n = normalize(value)
    return any(normalize(term) in n for term in EVENT_KEYWORDS)


def _blocked(url: str) -> bool:
    n = normalize(_path(url))
    return any(normalize(term) in n for term in BLOCKED_PATH_TERMS)


def _telegram_feed_as_hub(base_url: str, raw_html: str, max_links: int) -> dict:
    """Treat a public Telegram feed as a hub of message URLs, never as one giant event.

    Each returned child URL points to one Telegram message. Only event-like posts are queued.
    The feed remains a hub even when no current post is relevant, which prevents Frankenstein
    candidates assembled from multiple unrelated messages.
    """
    messages = parse_public_channel(raw_html, max_messages=max(max_links * 2, 40))
    rows = []
    for message in messages:
        text = str(message.get("text") or "")
        if not _eventish(text):
            continue
        rows.append({
            "url": str(message.get("url") or ""),
            "text": text[:180],
            "score": "5",
        })
        if len(rows) >= max_links:
            break
    return {
        "is_hub": True,
        "hub_url": base_url,
        "hub_type": "TELEGRAM_PUBLIC_FEED",
        "jsonld_event_count": 0,
        "event_links": rows,
        "messages_scanned": len(messages),
    }


def extract_hub_event_links(base_url: str, raw_html: str, max_links: int = 50) -> dict:
    """Detect calendar/hub pages and return links worth inspecting.

    A detected hub is discovery evidence only. We never construct one Event Candidate from a
    calendar or social feed because dates, distances and organizers from different cards/posts
    must never be mixed.
    """
    if is_public_channel_feed(base_url):
        return _telegram_feed_as_hub(base_url, raw_html, max_links)

    parser = _AnchorParser()
    try:
        parser.feed(raw_html)
    except Exception:
        pass

    jsonld_events = extract_jsonld_events(raw_html)
    rows: list[dict[str, str]] = []
    seen: set[str] = set()
    base_path = _path(base_url)
    explicit = _explicit_hub_url(base_url)

    for item in parser.links:
        url = _clean_url(base_url, item.get("href", ""))
        if not url or url in seen or not _same_site(base_url, url) or _blocked(url):
            continue
        if _path(url) in {"", base_path} and _host(url) == _host(base_url):
            continue
        text = item.get("text", "").strip()
        path = _path(url)
        score = 0
        if _eventish(text):
            score += 3
        if _eventish(path):
            score += 2
        if re.search(r"20(?:26|27|28)", f"{text} {path}"):
            score += 1
        if text.lower() in GENERIC_LINK_TEXT:
            score += 1
        if explicit and path.startswith(base_path.rstrip("/") + "/"):
            score += 2
        if explicit and len(path.split("/")) > len(base_path.split("/")):
            score += 1
        if _host(url) != _host(base_url) and _eventish(text):
            score += 1
        if score < (2 if explicit else 3):
            continue
        seen.add(url)
        rows.append({"url": url, "text": text[:180], "score": str(score)})
        if len(rows) >= max_links:
            break

    event_like_count = sum(1 for row in rows if int(row["score"]) >= 3)
    rootish = _path(base_url) in {"", "/", "/ru", "/en"}
    detected = bool(
        (explicit and len(rows) >= 1)
        or len(jsonld_events) >= 2
        or (rootish and event_like_count >= 3)
    )
    return {
        "is_hub": detected,
        "hub_url": base_url,
        "hub_type": "WEB_CALENDAR" if detected else "",
        "jsonld_event_count": len(jsonld_events),
        "event_links": rows if detected else [],
    }
