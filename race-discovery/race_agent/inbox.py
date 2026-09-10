from __future__ import annotations

import json
import os
import pathlib
import urllib.request


def load_private_signals(runtime_dir: pathlib.Path) -> tuple[list[dict], str]:
    """Read authorized forwarded/exported signals without committing private chat text.

    Supported inputs:
    - runtime/private_inbox/*.jsonl or *.txt (gitignored)
    - PRIVATE_SIGNAL_INBOX_URL returning JSON/JSONL (read-only)

    A record may contain: source, text, url, chat_name, observed_at.
    """
    rows: list[dict] = []
    source = "NONE"
    inbox_url = os.environ.get("PRIVATE_SIGNAL_INBOX_URL")
    if inbox_url:
        req = urllib.request.Request(inbox_url, headers={"User-Agent": "262room-race-discovery/0.2"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            text = resp.read(3_000_000).decode("utf-8", errors="replace")
        rows.extend(_decode(text, default_source="AUTHORIZED_INBOX"))
        source = "READ_ONLY_URL"

    folder = runtime_dir / "private_inbox"
    if folder.exists():
        for path in sorted(folder.glob("*")):
            if path.suffix.lower() not in {".txt", ".jsonl", ".json"}:
                continue
            rows.extend(_decode(path.read_text(encoding="utf-8", errors="replace"), default_source=path.stem))
        if rows:
            source = "LOCAL_PRIVATE_INBOX" if source == "NONE" else source + "+LOCAL"
    return rows, source


def _decode(text: str, default_source: str) -> list[dict]:
    stripped = text.strip()
    if not stripped:
        return []
    try:
        obj = json.loads(stripped)
        if isinstance(obj, list):
            return [_normalize(x, default_source) for x in obj if isinstance(x, dict)]
        if isinstance(obj, dict):
            items = obj.get("items") or obj.get("messages") or obj.get("signals")
            if isinstance(items, list):
                return [_normalize(x, default_source) for x in items if isinstance(x, dict)]
            return [_normalize(obj, default_source)]
    except json.JSONDecodeError:
        pass

    rows = []
    jsonl_ok = True
    for line in stripped.splitlines():
        try:
            item = json.loads(line)
            if isinstance(item, dict):
                rows.append(_normalize(item, default_source))
            else:
                jsonl_ok = False
                break
        except json.JSONDecodeError:
            jsonl_ok = False
            break
    if jsonl_ok and rows:
        return rows

    # Plain WhatsApp/Telegram export: preserve the whole text only in memory.
    return [{"source": default_source, "text": stripped, "url": "", "chat_name": default_source, "observed_at": ""}]


def _normalize(item: dict, default_source: str) -> dict:
    return {
        "source": str(item.get("source") or item.get("platform") or default_source),
        "text": str(item.get("text") or item.get("message") or item.get("caption") or ""),
        "url": str(item.get("url") or item.get("link") or ""),
        "chat_name": str(item.get("chat_name") or item.get("chat") or item.get("channel") or ""),
        "observed_at": str(item.get("observed_at") or item.get("date") or ""),
    }
