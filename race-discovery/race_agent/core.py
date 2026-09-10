from __future__ import annotations

import dataclasses
import datetime as dt
import difflib
import hashlib
import html
import json
import re
import unicodedata
from html.parser import HTMLParser
from typing import Any, Iterable
from urllib.parse import urlparse

SOURCE_WEIGHTS = {
    "official_event": 1.00,
    "official_organizer": 0.95,
    "registration": 0.85,
    "federation": 0.80,
    "government": 0.75,
    "secondary": 0.50,
    "search_result": 0.25,
}

EVENT_KEYWORDS = (
    "marathon", "марафон", "half marathon", "полумарафон", "trail", "трейл",
    "race", "забег", "run", "жарыс", "duathlon", "дуатлон", "triathlon",
    "триатлон", "open water", "swim", "ocr", "obstacle", "ультра", "ultra",
)

RU_MONTHS = {
    "января": 1, "февраля": 2, "марта": 3, "апреля": 4, "мая": 5, "июня": 6,
    "июля": 7, "августа": 8, "сентября": 9, "октября": 10, "ноября": 11, "декабря": 12,
}

class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.title_parts: list[str] = []
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        text = " ".join(data.split())
        if text:
            self.parts.append(text)
            if self._in_title:
                self.title_parts.append(text)


def html_to_text(raw: str) -> tuple[str, str]:
    parser = TextExtractor()
    try:
        parser.feed(raw)
    except Exception:
        pass
    return " ".join(parser.parts), " ".join(parser.title_parts)


def normalize(value: str | None) -> str:
    if not value:
        return ""
    value = unicodedata.normalize("NFKD", value).lower()
    value = "".join(c for c in value if not unicodedata.combining(c))
    value = re.sub(r"[^a-zа-яё0-9]+", " ", value, flags=re.I)
    return " ".join(value.split())


def stable_id(*parts: str) -> str:
    raw = "|".join(normalize(p) for p in parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]


def domain(url: str) -> str:
    try:
        return urlparse(url).netloc.lower().removeprefix("www.")
    except Exception:
        return ""


def extract_jsonld_events(raw_html: str) -> list[dict[str, Any]]:
    blocks = re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        raw_html,
        flags=re.I | re.S,
    )
    events: list[dict[str, Any]] = []
    for block in blocks:
        try:
            payload = json.loads(html.unescape(block.strip()))
        except Exception:
            continue
        stack = payload if isinstance(payload, list) else [payload]
        while stack:
            item = stack.pop()
            if not isinstance(item, dict):
                continue
            typ = item.get("@type")
            if typ == "Event" or (isinstance(typ, list) and "Event" in typ):
                events.append(item)
            graph = item.get("@graph")
            if isinstance(graph, list):
                stack.extend(graph)
    return events


def parse_dates(text: str, year_min: int = 2026, year_max: int = 2028) -> list[str]:
    out: list[str] = []
    for d, m, y in re.findall(r"\b([0-3]?\d)[./-]([01]?\d)[./-](20\d{2})\b", text):
        try:
            date = dt.date(int(y), int(m), int(d))
            if year_min <= date.year <= year_max:
                out.append(date.isoformat())
        except ValueError:
            pass
    month_names = "|".join(RU_MONTHS)
    for d, month, y in re.findall(rf"\b([0-3]?\d)\s+({month_names})\s+(20\d{{2}})\b", text.lower()):
        try:
            date = dt.date(int(y), RU_MONTHS[month], int(d))
            if year_min <= date.year <= year_max:
                out.append(date.isoformat())
        except ValueError:
            pass
    return list(dict.fromkeys(out))


def parse_times(text: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r"\b(?:[01]?\d|2[0-3]):[0-5]\d\b", text)))


def parse_distances(text: str) -> list[str]:
    found = []
    for num, unit in re.findall(r"\b(\d{1,3}(?:[.,]\d{1,4})?)\s*(км|km|м|m)\b", text, flags=re.I):
        value = float(num.replace(",", "."))
        unit_l = unit.lower()
        if unit_l in {"м", "m"}:
            if not (100 <= value <= 10000):
                continue
        else:
            if not (0.1 <= value <= 250):
                continue
        pretty = num.replace(".", ",") if unit_l == "км" else num.replace(",", ".")
        found.append(f"{pretty} {unit}")
    return list(dict.fromkeys(found))[:20]


def parse_prices(text: str) -> list[str]:
    vals = re.findall(r"\b(\d{1,3}(?:[\s\u00a0]\d{3})*)\s*(₸|тенге|тг|KZT)\b", text, flags=re.I)
    return list(dict.fromkeys(f"{' '.join(n.split())} {u}" for n, u in vals))[:20]


def eventish(text: str) -> bool:
    n = normalize(text)
    return any(normalize(k) in n for k in EVENT_KEYWORDS)


def infer_event_type(text: str) -> str:
    n = normalize(text)
    if any(k in n for k in ("triathlon", "триатлон")):
        return "TRIATHLON"
    if any(k in n for k in ("duathlon", "дуатлон")):
        return "DUATHLON"
    if any(k in n for k in ("ocr", "obstacle", "препятств")):
        return "OCR"
    if any(k in n for k in ("swim", "open water", "плаван")):
        return "SWIM_OPEN_WATER"
    if any(k in n for k in ("trail", "трейл", "горн", "ultra", "ультра")):
        return "TRAIL"
    return "ROAD_RUNNING"


def guess_title(page_title: str, text: str) -> str:
    title = re.sub(r"\s+[|—-]\s+.*$", "", page_title).strip()
    if title and eventish(title) and 3 <= len(title) <= 120:
        return title
    for sentence in re.split(r"[\n.!?]", text[:1500]):
        s = " ".join(sentence.split()).strip(" -—")
        if 4 <= len(s) <= 120 and eventish(s):
            return s
    return title[:120] or "Untitled event"


def classify_source(url: str, source_hints: dict[str, str]) -> str:
    d = domain(url)
    for key, source_type in source_hints.items():
        if key in d or key in url:
            return source_type
    return "secondary"


def source_weight(source_type: str) -> float:
    return SOURCE_WEIGHTS.get(source_type, 0.35)


def _first_http_url(raw_html: str, pattern: str) -> str:
    urls = re.findall(r'''href=["']([^"']+)["']''', raw_html, flags=re.I)
    for u in urls:
        if re.search(pattern, u, flags=re.I):
            return html.unescape(u)
    return ""


def _guess_city(text: str, known_cities: list[str] | None) -> str:
    if not known_cities:
        return ""
    n = normalize(text)
    for city in sorted(known_cities, key=len, reverse=True):
        if normalize(city) in n:
            return city
    return ""


def infer_registration_status(text: str) -> str:
    n = normalize(text)
    closed = ("регистрация закрыта", "регистрация завершена", "registration closed", "registration ended")
    soon = ("регистрация скоро", "registration soon", "скоро откроется регистрация")
    opened = ("регистрация открыта", "registration open", "регистрация доступна", "зарегистрироваться")
    if any(normalize(x) in n for x in closed):
        return "CLOSED"
    if any(normalize(x) in n for x in soon):
        return "SOON"
    if any(normalize(x) in n for x in opened):
        return "OPEN"
    return "UNKNOWN"


def infer_notice_status(text: str) -> str:
    n = normalize(text)
    if any(k in n for k in ("событие отменено", "забег отменен", "забег отменён", "event cancelled", "race cancelled")):
        return "CANCELLED"
    if any(k in n for k in ("перенос даты", "забег перенесен", "забег перенесён", "event postponed", "race postponed")):
        return "POSTPONED"
    return ""


def candidate_from_document(url: str, raw_html: str, source_type: str, observed_at: str, known_cities: list[str] | None = None, country: str = "Kazakhstan") -> dict[str, Any] | None:
    text, page_title = html_to_text(raw_html)
    jsonld = extract_jsonld_events(raw_html)
    organizer = ""
    official_site = url if source_type in {"official_event", "official_organizer"} else ""
    registration_url = url if source_type == "registration" else ""
    instagram = _first_http_url(raw_html, r"instagram\.com/")
    if not registration_url:
        registration_url = _first_http_url(raw_html, r"/(?:register|registration|signup|sign-up|checkout|ticket|tickets)(?:/|\?|$)")

    if jsonld:
        item = jsonld[0]
        name = str(item.get("name") or page_title or "Untitled event")
        start = str(item.get("startDate") or "")[:10]
        loc = item.get("location") or {}
        if isinstance(loc, dict):
            address = loc.get("address") or ""
            if isinstance(address, dict):
                address = ", ".join(str(v) for v in address.values() if v)
            location = str(loc.get("name") or address or "")
        else:
            location = str(loc)
        city = _guess_city(location, known_cities) or _guess_city(text[:12000], known_cities)
        dates = [start] if re.fullmatch(r"20\d{2}-\d{2}-\d{2}", start) else parse_dates(text)
        org = item.get("organizer") or {}
        if isinstance(org, dict):
            organizer = str(org.get("name") or "")
            org_url = str(org.get("url") or "")
            if not official_site and org_url.startswith("http"):
                official_site = org_url
        elif isinstance(org, str):
            organizer = org
        offers = item.get("offers")
        if isinstance(offers, dict):
            offer_url = str(offers.get("url") or "")
            if offer_url.startswith("http"):
                registration_url = offer_url
    else:
        name = guess_title(page_title, text)
        dates = parse_dates(text)
        city = _guess_city(text[:12000], known_cities)
        location = city
    if not eventish(f"{name} {text[:2500]}") or not dates:
        return None

    date = dates[0]
    distances = parse_distances(text[:12000])
    prices = parse_prices(text[:12000])
    times = parse_times(text[:12000])
    registration_status = infer_registration_status(text[:15000])
    notice_status = infer_notice_status(text[:15000])
    weight = source_weight(source_type)
    content_hash = hashlib.sha256(raw_html.encode("utf-8", errors="ignore")).hexdigest()[:16]
    evidence: list[dict[str, Any]] = []

    def add_evidence(field: str, value: Any) -> None:
        if value in (None, "", [], {}):
            return
        evidence.append({
            "field": field,
            "value": value,
            "url": url,
            "source_type": source_type,
            "observed_at": observed_at,
            "weight": weight,
            "content_hash": content_hash,
        })

    for field, value in (
        ("name", name), ("date", date), ("city", city), ("location", location),
        ("organizer", organizer), ("distances", distances), ("registration_prices", prices),
        ("start_times", times[:10]), ("registration_status", registration_status if registration_status != "UNKNOWN" else ""),
        ("instagram", instagram), ("registration_url", registration_url),
    ):
        add_evidence(field, value)

    year = date[:4] if date else ""
    base_name = re.sub(r"\b20\d{2}\b", "", name).strip()
    confidence = round(min(0.98, 0.43 + 0.45 * weight + (0.05 if distances else 0) + (0.03 if city else 0)), 2)
    status = notice_status or ("VERIFIED" if weight >= 0.85 else "NEW")
    pipeline_status = "NEEDS_REVIEW" if notice_status else ("READY_FOR_REVIEW" if weight >= 0.85 else "DISCOVERED")
    return {
        "candidate_id": stable_id(name, year, city, country),
        "lineage_id": stable_id(base_name, city, country),
        "name": name,
        "date": date,
        "city": city,
        "region": "",
        "country": country,
        "location": location,
        "organizer": organizer,
        "official_site": official_site,
        "instagram": instagram,
        "registration_url": registration_url,
        "registration_status": registration_status,
        "distances": distances,
        "event_type": infer_event_type(f"{name} {text[:4000]}"),
        "start_times": times[:10],
        "registration_prices": prices,
        "registration_deadline": "",
        "source_urls": [url],
        "evidence": evidence,
        "last_checked_at": observed_at,
        "confidence": confidence,
        "status": status,
        "pipeline_status": pipeline_status,
        "changes": [],
        "conflicts": [],
    }


def match_score(a: dict[str, Any], b: dict[str, Any]) -> float:
    title = difflib.SequenceMatcher(None, normalize(a.get("name")), normalize(b.get("name"))).ratio()
    date_a, date_b = a.get("date"), b.get("date")
    date_score = 1.0 if date_a and date_a == date_b else 0.0
    city_a, city_b = normalize(a.get("city")), normalize(b.get("city"))
    city_score = 1.0 if city_a and city_b and city_a == city_b else (0.5 if not city_a or not city_b else 0.0)
    urls_a = {domain(u) for u in a.get("source_urls", []) if u}
    urls_b = {domain(u) for u in b.get("source_urls", []) if u}
    url_score = 1.0 if urls_a & urls_b else 0.0
    return round(0.55 * title + 0.25 * date_score + 0.10 * city_score + 0.10 * url_score, 4)


def merge_candidates(base: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    out = json.loads(json.dumps(base, ensure_ascii=False))
    changes = list(out.get("changes", []))
    conflicts = list(out.get("conflicts", []))
    for field in ("name", "date", "city", "region", "location", "organizer", "official_site", "instagram",
                  "registration_url", "registration_status", "distances", "event_type", "start_times", "registration_prices",
                  "registration_deadline"):
        old, new = out.get(field), incoming.get(field)
        if not new:
            continue
        if not old:
            out[field] = new
            changes.append({"field": field, "old": old, "new": new})
        elif old != new:
            if field in {"date", "distances", "location", "registration_prices", "registration_status", "name"}:
                conflicts.append({"field": field, "existing": old, "incoming": new, "incoming_sources": incoming.get("source_urls", [])})
            old_w = max((e.get("weight", 0) for e in out.get("evidence", []) if e.get("field") == field), default=0)
            new_w = max((e.get("weight", 0) for e in incoming.get("evidence", []) if e.get("field") == field), default=0)
            if new_w > old_w:
                out[field] = new
                changes.append({"field": field, "old": old, "new": new})
    out["evidence"] = out.get("evidence", []) + incoming.get("evidence", [])
    out["source_urls"] = list(dict.fromkeys(out.get("source_urls", []) + incoming.get("source_urls", [])))
    out["last_checked_at"] = incoming.get("last_checked_at", out.get("last_checked_at"))
    out["confidence"] = round(max(float(out.get("confidence", 0)), float(incoming.get("confidence", 0))), 2)
    out["changes"] = changes[-50:]
    out["conflicts"] = conflicts[-50:]
    incoming_status = incoming.get("status")
    if conflicts:
        out["status"] = "CONFLICT"
        out["pipeline_status"] = "NEEDS_REVIEW"
    elif incoming_status in {"CANCELLED", "POSTPONED"}:
        out["status"] = incoming_status
        out["pipeline_status"] = "NEEDS_REVIEW"
    elif changes and base:
        out["status"] = "UPDATED"
    return out


def deduplicate(candidates: Iterable[dict[str, Any]], threshold: float = 0.82) -> tuple[list[dict[str, Any]], int]:
    merged: list[dict[str, Any]] = []
    duplicates = 0
    for candidate in candidates:
        best_i, best_score = -1, 0.0
        for i, existing in enumerate(merged):
            score = match_score(existing, candidate)
            if score > best_score:
                best_i, best_score = i, score
        if best_i >= 0 and best_score >= threshold:
            merged[best_i] = merge_candidates(merged[best_i], candidate)
            duplicates += 1
        else:
            merged.append(candidate)
    return merged, duplicates


def compare_snapshot(previous: dict[str, Any], current: dict[str, Any]) -> list[dict[str, Any]]:
    diffs = []
    for field in ("name", "date", "location", "distances", "registration_prices", "registration_status", "registration_deadline", "registration_url", "instagram"):
        if previous.get(field) != current.get(field) and current.get(field):
            diffs.append({"field": field, "old": previous.get(field), "new": current.get(field)})
    return diffs
