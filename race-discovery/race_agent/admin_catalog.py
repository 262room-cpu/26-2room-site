from __future__ import annotations

import json
import os
import urllib.request
from urllib.parse import urlparse


def configured() -> bool:
    return bool(os.environ.get("APP_ADMIN_CATALOG_URL", "").strip())


def _walk(payload, path: str):
    current = payload
    for part in (path or "").split("."):
        part = part.strip()
        if not part:
            continue
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


def extract_rows(payload, items_path: str = "") -> list[dict]:
    """Extract an event list from common admin API response shapes.

    The adapter is intentionally generic because the current 26.2 ROOM admin backend has not yet
    been identified. Once its real response shape is known, APP_ADMIN_CATALOG_ITEMS_PATH can point
    to a nested list such as `data.events` without changing discovery code.
    """
    if items_path:
        value = _walk(payload, items_path)
        return [row for row in value if isinstance(row, dict)] if isinstance(value, list) else []

    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]

    if isinstance(payload, dict):
        for key in ("events", "items", "data", "results", "rows"):
            value = payload.get(key)
            if isinstance(value, list):
                return [row for row in value if isinstance(row, dict)]
            if isinstance(value, dict):
                for nested in ("events", "items", "results", "rows"):
                    nested_value = value.get(nested)
                    if isinstance(nested_value, list):
                        return [row for row in nested_value if isinstance(row, dict)]
    return []


def load_from_env() -> tuple[list[dict], str]:
    """Read the mobile-app admin catalog using HTTP GET only.

    No POST/PATCH/DELETE methods exist in this adapter. Optional credentials are provided only from
    GitHub Secrets/runtime environment and are never persisted in the public repository/runtime.
    """
    url = os.environ.get("APP_ADMIN_CATALOG_URL", "").strip()
    if not url:
        return [], "ADMIN_API_NOT_CONFIGURED"
    if not url.startswith("https://"):
        raise ValueError("APP_ADMIN_CATALOG_URL must use https://")

    headers = {
        "Accept": "application/json",
        "User-Agent": "262room-race-discovery/0.5",
    }
    bearer = os.environ.get("APP_ADMIN_CATALOG_BEARER_TOKEN", "").strip()
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"

    api_key = os.environ.get("APP_ADMIN_CATALOG_API_KEY", "").strip()
    if api_key:
        header_name = os.environ.get("APP_ADMIN_CATALOG_API_KEY_HEADER", "X-API-Key").strip() or "X-API-Key"
        headers[header_name] = api_key

    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=20) as response:
        raw = response.read(10_000_000).decode("utf-8", errors="replace")
    payload = json.loads(raw)
    rows = extract_rows(payload, os.environ.get("APP_ADMIN_CATALOG_ITEMS_PATH", "").strip())
    host = urlparse(url).netloc.lower()
    return rows, f"ADMIN_API:{host}"
