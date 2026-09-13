from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request
from urllib.parse import urlparse

_RESOURCE_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
_ORDER_RE = re.compile(r"^[A-Za-z0-9_.-]+\.(?:asc|desc)(?:,[A-Za-z0-9_.-]+\.(?:asc|desc))*$")


def configured() -> bool:
    """Return True only when the real app Supabase read path is configured.

    The adapter intentionally requires a publishable/anonymous key. Never use a Supabase
    service-role key here: race discovery only needs SELECT access to the existing catalog.
    """
    return bool(
        os.environ.get("APP_SUPABASE_URL", "").strip()
        and os.environ.get("APP_SUPABASE_ANON_KEY", "").strip()
    )


def _base_url(value: str) -> str:
    value = value.strip().rstrip("/")
    if not value.startswith("https://"):
        raise ValueError("APP_SUPABASE_URL must use https://")
    parsed = urlparse(value)
    if not parsed.netloc:
        raise ValueError("APP_SUPABASE_URL must contain a host")
    return value


def _resource(value: str) -> str:
    value = (value or "events_with_stats").strip()
    if not _RESOURCE_RE.fullmatch(value):
        raise ValueError("invalid Supabase events resource")
    return value


def _order(value: str) -> str:
    value = (value or "event_at.desc").strip()
    if not _ORDER_RE.fullmatch(value):
        raise ValueError("invalid Supabase order expression")
    return value


def fetch_catalog(
    base_url: str,
    anon_key: str,
    *,
    resource: str = "events_with_stats",
    select: str = "*",
    order: str = "event_at.desc",
    bearer_token: str = "",
    page_size: int = 1000,
    max_rows: int = 5000,
) -> list[dict]:
    """Read the app event catalog from Supabase PostgREST using GET only.

    `resource` may be a table or a read-only view such as the admin panel's
    `events_with_stats`. No insert/update/delete method exists in this module.
    """
    base = _base_url(base_url)
    resource = _resource(resource)
    order = _order(order)
    page_size = max(1, min(int(page_size), 1000))
    max_rows = max(page_size, min(int(max_rows), 20_000))
    select = (select or "*").strip() or "*"

    query = urllib.parse.urlencode({"select": select, "order": order}, safe="*,().!:-_")
    url = f"{base}/rest/v1/{resource}?{query}"

    auth = (bearer_token or anon_key).strip()
    headers = {
        "Accept": "application/json",
        "User-Agent": "262room-race-discovery/0.6",
        "apikey": anon_key.strip(),
        "Authorization": f"Bearer {auth}",
    }

    rows: list[dict] = []
    offset = 0
    while offset < max_rows:
        end = min(offset + page_size - 1, max_rows - 1)
        request_headers = dict(headers)
        request_headers["Range"] = f"{offset}-{end}"
        request_headers["Range-Unit"] = "items"
        req = urllib.request.Request(url, headers=request_headers, method="GET")
        with urllib.request.urlopen(req, timeout=20) as response:
            raw = response.read(15_000_000).decode("utf-8", errors="replace")
        payload = json.loads(raw)
        if not isinstance(payload, list):
            raise ValueError("Supabase event catalog response must be a JSON array")
        page = [row for row in payload if isinstance(row, dict)]
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size

    return rows


def load_from_env() -> tuple[list[dict], str]:
    base_url = os.environ.get("APP_SUPABASE_URL", "").strip()
    anon_key = os.environ.get("APP_SUPABASE_ANON_KEY", "").strip()
    if not base_url or not anon_key:
        return [], "SUPABASE_NOT_CONFIGURED"

    resource = os.environ.get("APP_SUPABASE_EVENTS_RESOURCE", "events_with_stats").strip() or "events_with_stats"
    select = os.environ.get("APP_SUPABASE_EVENTS_SELECT", "*").strip() or "*"
    order = os.environ.get("APP_SUPABASE_EVENTS_ORDER", "event_at.desc").strip() or "event_at.desc"
    bearer = os.environ.get("APP_SUPABASE_BEARER_TOKEN", "").strip()
    rows = fetch_catalog(
        base_url,
        anon_key,
        resource=resource,
        select=select,
        order=order,
        bearer_token=bearer,
    )
    host = urlparse(_base_url(base_url)).netloc.lower()
    return rows, f"SUPABASE:{host}/{resource}"
