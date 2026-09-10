from __future__ import annotations

import html
from html.parser import HTMLParser
from urllib.parse import urlparse


class _TelegramMessageParser(HTMLParser):
    """Split Telegram public preview HTML into individual message records.

    Telegram's public /s/<channel> pages expose each post in a container with a `data-post`
    attribute (for example `athletex/1974`). We deliberately scope all collected text and links
    to that one container so dates, races and contacts from neighboring posts can never mix.
    """

    def __init__(self) -> None:
        super().__init__()
        self.messages: list[dict] = []
        self._active: dict | None = None
        self._depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = dict(attrs)
        post = (data.get("data-post") or "").strip()
        if self._active is None and post and "/" in post:
            self._active = {
                "post": post,
                "text_parts": [],
                "links": [],
                "datetime": "",
            }
            self._depth = 1
        elif self._active is not None:
            self._depth += 1

        if self._active is None:
            return
        href = html.unescape((data.get("href") or "").strip())
        if href.startswith("http") and href not in self._active["links"]:
            self._active["links"].append(href)
        stamp = (data.get("datetime") or "").strip()
        if stamp and not self._active["datetime"]:
            self._active["datetime"] = stamp

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self._active is None:
            return
        data = dict(attrs)
        href = html.unescape((data.get("href") or "").strip())
        if href.startswith("http") and href not in self._active["links"]:
            self._active["links"].append(href)

    def handle_data(self, data: str) -> None:
        if self._active is None:
            return
        value = " ".join(data.split())
        if value:
            self._active["text_parts"].append(value)

    def handle_endtag(self, tag: str) -> None:
        if self._active is None:
            return
        self._depth -= 1
        if self._depth > 0:
            return
        row = self._active
        row["text"] = " ".join(row.pop("text_parts", [])).strip()
        row["url"] = f"https://t.me/{row['post']}"
        self.messages.append(row)
        self._active = None
        self._depth = 0


def is_public_channel_feed(url: str) -> bool:
    try:
        p = urlparse(url)
        host = p.netloc.lower().removeprefix("www.")
        parts = [x for x in p.path.split("/") if x]
        return host in {"t.me", "telegram.me"} and len(parts) >= 2 and parts[0] == "s"
    except Exception:
        return False


def parse_public_channel(raw_html: str, max_messages: int = 80) -> list[dict]:
    parser = _TelegramMessageParser()
    try:
        parser.feed(raw_html)
    except Exception:
        pass
    rows = []
    seen = set()
    for row in parser.messages:
        if not row.get("post") or row["post"] in seen:
            continue
        seen.add(row["post"])
        row["links"] = list(dict.fromkeys(row.get("links", [])))[:30]
        rows.append(row)
        if len(rows) >= max_messages:
            break
    return rows


def message_as_html(message: dict) -> str:
    text = html.escape(str(message.get("text") or ""))
    links = "".join(
        f'<a href="{html.escape(str(url), quote=True)}">source</a>'
        for url in message.get("links", [])
        if str(url).startswith("http")
    )
    return f"<html><body><article>{text}{links}</article></body></html>"


def external_message_links(message: dict) -> list[str]:
    out = []
    for url in message.get("links", []):
        try:
            host = urlparse(url).netloc.lower().removeprefix("www.")
        except Exception:
            continue
        if host in {"t.me", "telegram.me"} or "instagram.com" in host or "facebook.com" in host:
            continue
        if url.startswith("http"):
            out.append(url)
    return list(dict.fromkeys(out))
