from __future__ import annotations

import json
import os
import pathlib
import re
import urllib.request
from difflib import SequenceMatcher
from urllib.parse import urlparse

from .core import normalize
from .firebase_catalog import configured as firestore_configured
from .firebase_catalog import load_from_env as load_firestore_catalog

TRACKED_FIELDS = ("name", "date", "city", "location", "distances", "registration_status", "registration_url", "instagram")


def _domain(url: str) -> str:
    try:
        return urlparse(url).netloc.lower().removeprefix("www.")
    except Exception:
        return ""


def _first(row: dict, *keys, default=""):
    for key in keys:
        value = row.get(key)
        if value not in (None, "", []):
            return value
    return default


def normalize_catalog_row(row: dict) -> dict:
    name = str(_first(row, "name", "title", "eventName", "event_name"))
    date = str(_first(row, "date", "startDate", "start_date"))[:10]
    city = str(_first(row, "city", "locationCity", "location_city"))
    location = str(_first(row, "location", "venue", "address"))
    organizer = str(_first(row, "organizer", "organizerName", "organizer_name"))
    website = str(_first(row, "official_site", "website", "site", "url"))
    registration = str(_first(row, "registration_url", "registrationUrl", "registration"))
    instagram = str(_first(row, "instagram", "instagramUrl", "instagram_url"))
    distances = _first(row, "distances", "distance", default=[])
    if isinstance(distances, str):
        distances = [x.strip() for x in re.split(r"[,;/|]", distances) if x.strip()]
    urls = [u for u in (website, registration, instagram) if u.startswith("http")]
    return {
        "app_event_id": str(_first(row, "id", "eventId", "event_id", "docId", "documentId")),
        "name": name,
        "date": date,
        "city": city,
        "location": location,
        "organizer": organizer,
        "official_site": website,
        "registration_url": registration,
        "instagram": instagram,
        "registration_status": str(_first(row, "registration_status", "registrationStatus")),
        "distances": distances if isinstance(distances, list) else [],
        "source_urls": urls,
        "raw": row,
    }


def catalog_match_score(candidate: dict, app_event: dict) -> float:
    title = SequenceMatcher(None, normalize(candidate.get("name")), normalize(app_event.get("name"))).ratio()
    city_a, city_b = normalize(candidate.get("city")), normalize(app_event.get("city"))
    city = 1.0 if city_a and city_b and city_a == city_b else (0.45 if not city_a or not city_b else 0.0)
    date = 1.0 if candidate.get("date") and candidate.get("date") == app_event.get("date") else 0.0
    urls_a = {_domain(u) for u in candidate.get("source_urls", []) if u}
    urls_b = {_domain(u) for u in app_event.get("source_urls", []) if u}
    url = 1.0 if urls_a & urls_b else 0.0
    organizer = SequenceMatcher(None, normalize(candidate.get("organizer")), normalize(app_event.get("organizer"))).ratio() if candidate.get("organizer") and app_event.get("organizer") else 0.0
    # Exact/near-exact name + city must still match when the organizer moves the date.
    return round(0.60 * title + 0.15 * city + 0.15 * date + 0.05 * url + 0.05 * organizer, 4)


def _norm_value(value):
    if isinstance(value, list):
        return sorted(normalize(str(x)) for x in value if x)
    return normalize(str(value or ""))


def catalog_diffs(candidate: dict, app_event: dict) -> list[dict]:
    diffs = []
    for field in TRACKED_FIELDS:
        new, old = candidate.get(field), app_event.get(field)
        if new in (None, "", [], "UNKNOWN") or old in (None, "", [], "UNKNOWN"):
            continue
        if _norm_value(new) != _norm_value(old):
            diffs.append({"field": field, "app": old, "discovered": new})
    return diffs


def annotate_against_catalog(candidate: dict, catalog: list[dict]) -> dict:
    out = dict(candidate)
    if not catalog:
        out.update({"catalog_relation": "CATALOG_NOT_CONNECTED", "app_match_id": "", "app_match_score": 0.0, "app_diffs": []})
        return out
    best = None
    score = 0.0
    for row in catalog:
        s = catalog_match_score(out, row)
        if s > score:
            best, score = row, s
    if not best or score < 0.58:
        relation, diffs = "NOT_IN_APP", []
    elif score < 0.72:
        relation, diffs = "POSSIBLE_APP_MATCH", catalog_diffs(out, best)
    else:
        diffs = catalog_diffs(out, best)
        relation = "IN_APP_CHANGED" if diffs else "ALREADY_IN_APP"
    out.update({
        "catalog_relation": relation,
        "app_match_id": (best or {}).get("app_event_id", ""),
        "app_match_score": round(score, 3),
        "app_diffs": diffs,
    })
    return out


def load_catalog(runtime_dir: pathlib.Path) -> tuple[list[dict], str]:
    """Load a comparison catalog without ever granting discovery code write authority.

    Priority is explicit file/URL overrides, then the dedicated Firestore GET-only adapter, then an
    optional local snapshot. Firestore failures degrade to an empty catalog instead of stopping race
    discovery; the source string keeps the failure visible in run metrics.
    """
    rows: list[dict] = []
    source = "NOT_CONNECTED"
    file_path = os.environ.get("APP_CATALOG_FILE")
    url = os.environ.get("APP_CATALOG_URL")
    if file_path:
        path = pathlib.Path(file_path)
        if path.exists():
            source = f"FILE:{path.name}"
            text = path.read_text(encoding="utf-8")
            rows = _decode_rows(text)
    elif url:
        req = urllib.request.Request(url, headers={"User-Agent": "262room-race-discovery/0.4"}, method="GET")
        with urllib.request.urlopen(req, timeout=20) as resp:
            text = resp.read(5_000_000).decode("utf-8", errors="replace")
        rows = _decode_rows(text)
        source = "READ_ONLY_URL"
    elif firestore_configured():
        try:
            rows, source = load_firestore_catalog()
        except Exception as exc:
            rows = []
            source = f"FIRESTORE_UNAVAILABLE:{type(exc).__name__}"
    else:
        snapshot = runtime_dir / "app_catalog_snapshot.jsonl"
        if snapshot.exists():
            rows = _decode_rows(snapshot.read_text(encoding="utf-8"))
            source = "LOCAL_SNAPSHOT"
    return [normalize_catalog_row(r) for r in rows if isinstance(r, dict)], source


def _decode_rows(text: str) -> list[dict]:
    text = text.strip()
    if not text:
        return []
    try:
        obj = json.loads(text)
        if isinstance(obj, list):
            return obj
        if isinstance(obj, dict):
            for key in ("events", "data", "items"):
                if isinstance(obj.get(key), list):
                    return obj[key]
            return [obj]
    except json.JSONDecodeError:
        pass
    rows = []
    for line in text.splitlines():
        try:
            obj = json.loads(line)
            if isinstance(obj, dict):
                rows.append(obj)
        except json.JSONDecodeError:
            continue
    return rows
