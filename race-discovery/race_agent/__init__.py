"""26.2 ROOM race discovery package bootstrap.

The original v1 core stays intentionally small. Multi-market deterministic parsers and safety
identity guards are installed here so every importer gets the same behavior.
"""

from __future__ import annotations

import html as html_lib
import json
import re
from urllib.parse import unquote

from . import core as _core
from .locales import focused_event_text, parse_dates as _parse_dates, parse_prices as _parse_prices

# Upgrade v1 parser globals before candidate_from_document is called.
_core.parse_dates = _parse_dates
_core.parse_prices = _parse_prices

# v1 recognized only literal schema.org @type="Event". Race sites commonly publish SportsEvent,
# BusinessEvent or arrays of event types. Treat any schema type ending in "Event" as structured
# evidence; the later eventish gate still ensures we only keep endurance/race content.
_original_extract_jsonld_events = _core.extract_jsonld_events


def _enhanced_extract_jsonld_events(raw_html: str) -> list[dict]:
    events = list(_original_extract_jsonld_events(raw_html))
    signatures = {json.dumps(x, ensure_ascii=False, sort_keys=True, default=str) for x in events}
    blocks = re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        raw_html,
        flags=re.I | re.S,
    )
    for block in blocks:
        try:
            payload = json.loads(html_lib.unescape(block.strip()))
        except Exception:
            continue
        stack = payload if isinstance(payload, list) else [payload]
        while stack:
            item = stack.pop()
            if not isinstance(item, dict):
                continue
            typ = item.get("@type")
            types = typ if isinstance(typ, list) else [typ]
            if any(isinstance(t, str) and (t == "Event" or t.endswith("Event")) for t in types):
                sig = json.dumps(item, ensure_ascii=False, sort_keys=True, default=str)
                if sig not in signatures:
                    signatures.add(sig)
                    events.append(item)
            graph = item.get("@graph")
            if isinstance(graph, list):
                stack.extend(graph)
    return events


_core.extract_jsonld_events = _enhanced_extract_jsonld_events
_original_candidate_from_document = _core.candidate_from_document

# Common market spellings which do not follow a simple Cyrillic -> Latin transliteration.
# The generic transliterator below handles the rest. These aliases are identity hints only;
# they never create a city unless that city already exists in the market's known-cities config.
_CITY_ALIASES = {
    "алматы": ["almaty", "alma ata", "alma-ata"],
    "астана": ["astana"],
    "караганда": ["karaganda", "qaragandy"],
    "актау": ["aktau"],
    "туркестан": ["turkistan", "turkestan"],
    "костанай": ["kostanay", "qostanai"],
    "өскемен": ["oskemen", "ust kamenogorsk", "ust-kamenogorsk"],
    "усть каменогорск": ["ust kamenogorsk", "ust-kamenogorsk", "oskemen"],
    "шымкент": ["shymkent", "chimkent"],
    "конаев": ["konaev", "qonaev"],
    "қонаев": ["qonaev", "konaev"],
    "москва": ["moscow", "moskva"],
    "санкт петербург": ["saint petersburg", "st petersburg", "petersburg", "spb"],
    "бишкек": ["bishkek"],
    "ош": ["osh"],
    "ташкент": ["tashkent", "toshkent"],
    "самарканд": ["samarkand", "samarqand"],
    "ереван": ["yerevan", "erevan"],
    "баку": ["baku"],
    "тбилиси": ["tbilisi"],
    "кишинёв": ["chisinau", "kishinev", "kishinyov"],
    "кишинев": ["chisinau", "kishinev", "kishinyov"],
    "душанбе": ["dushanbe"],
    "ашхабад": ["ashgabat", "ashkhabad"],
    "улан батор": ["ulaanbaatar", "ulan bator", "ulan-bator"],
}

_TRANSLIT = str.maketrans({
    "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"e","ж":"zh","з":"z",
    "и":"i","й":"y","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r",
    "с":"s","т":"t","у":"u","ф":"f","х":"kh","ц":"ts","ч":"ch","ш":"sh","щ":"shch",
    "ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya","ә":"a","ғ":"g","қ":"q",
    "ң":"n","ө":"o","ұ":"u","ү":"u","һ":"h","і":"i",
})


def _identity_text(value: str) -> str:
    value = unquote(str(value or "")).casefold().replace("_", " ").replace("-", " ")
    return " ".join(re.findall(r"[\w]+", value, flags=re.UNICODE))


def _city_aliases(city: str) -> list[str]:
    normalized = _identity_text(city)
    transliterated = _identity_text(normalized.translate(_TRANSLIT))
    aliases = [normalized, transliterated] + _CITY_ALIASES.get(normalized, [])
    return list(dict.fromkeys(_identity_text(x) for x in aliases if _identity_text(x)))


def _event_identity_city(name: str, url: str, known_cities: list[str] | None) -> str:
    """Resolve city from the event identity before scanning a page full of neighboring races.

    Event title and URL are much stronger identity signals than a random city mention in footer,
    navigation or another card. We only choose among cities already allowed by the market config.
    """
    if not known_cities:
        return ""
    name_text = _identity_text(name)
    url_text = _identity_text(url)
    best_city = ""
    best_score = 0
    for city in known_cities:
        for alias in _city_aliases(city):
            if len(alias) < 3:
                continue
            score = 0
            if re.search(rf"(?:^|\s){re.escape(alias)}(?:$|\s)", name_text):
                score = 100
            elif re.search(rf"(?:^|\s){re.escape(alias)}(?:$|\s)", url_text):
                score = 90
            if score > best_score:
                best_city, best_score = city, score
    return best_city


def _refined_candidate_from_document(
    url: str,
    raw_html: str,
    source_type: str,
    observed_at: str,
    known_cities: list[str] | None = None,
    country: str = "Kazakhstan",
):
    candidate = _original_candidate_from_document(
        url,
        raw_html,
        source_type,
        observed_at,
        known_cities=known_cities,
        country=country,
    )
    if not candidate:
        return None

    text, _ = _core.html_to_text(raw_html)
    focused = focused_event_text(text, candidate.get("name") or "")
    structured_events = _core.extract_jsonld_events(raw_html)
    has_structured_event = bool(structured_events)

    evidence = list(candidate.get("evidence", []))
    template = evidence[0] if evidence else {
        "url": url,
        "source_type": source_type,
        "observed_at": observed_at,
        "weight": _core.source_weight(source_type),
        "content_hash": "",
    }

    def replace_field(field: str, value, scope: str = "FOCUSED_EVENT_BLOCK") -> None:
        nonlocal evidence
        candidate[field] = value
        evidence = [row for row in evidence if row.get("field") != field]
        if value not in (None, "", [], {}):
            evidence.append({
                "field": field,
                "value": value,
                "url": template.get("url", url),
                "source_type": template.get("source_type", source_type),
                "observed_at": observed_at,
                "weight": template.get("weight", _core.source_weight(source_type)),
                "content_hash": template.get("content_hash", ""),
                "scope": scope,
            })

    # A city explicitly encoded by the event title/URL outranks any city merely mentioned in the
    # page body. This fixes pages that cross-promote a second race in another city.
    identity_city = _event_identity_city(candidate.get("name") or "", url, known_cities)
    if identity_city and identity_city != candidate.get("city"):
        replace_field("city", identity_city, "EVENT_IDENTITY")
        # Preserve a real venue/address. Only synthesize location when the original parser had no
        # location (or only a bare, contradictory city token).
        current_location = str(candidate.get("location") or "").strip()
        normalized_known = {_identity_text(x) for x in (known_cities or [])}
        if not current_location or _identity_text(current_location) in normalized_known:
            replace_field("location", identity_city, "EVENT_IDENTITY")

    if focused != text:
        # JSON-LD startDate is stronger than any neighboring date in human-visible text. For
        # unstructured pages, focused parsing still fixes navigation/header dates.
        if not has_structured_event:
            dates = _parse_dates(focused)
            if dates and dates[0] != candidate.get("date"):
                replace_field("date", dates[0])

        # If title/URL did not identify the city, focused text may fill a missing city but must not
        # overwrite an already established one.
        if not candidate.get("city"):
            focused_city = _core._guess_city(focused, known_cities)
            if focused_city:
                replace_field("city", focused_city)
                if not candidate.get("location"):
                    replace_field("location", focused_city)

        # Focused values are useful for detail fields, but an empty/UNKNOWN heuristic never erases
        # stronger information already parsed from the full/structured page.
        focused_distances = _core.parse_distances(focused)
        if focused_distances:
            replace_field("distances", focused_distances)
        focused_prices = _parse_prices(focused)
        if focused_prices:
            replace_field("registration_prices", focused_prices)
        focused_times = _core.parse_times(focused)[:10]
        if focused_times:
            replace_field("start_times", focused_times)
        registration_status = _core.infer_registration_status(focused)
        if registration_status != "UNKNOWN":
            replace_field("registration_status", registration_status)
        candidate["event_type"] = _core.infer_event_type(f"{candidate.get('name', '')} {focused[:5000]}")

    candidate["evidence"] = evidence
    date = candidate.get("date") or ""
    city = candidate.get("city") or ""
    base_name = re.sub(r"\b20\d{2}\b", "", candidate.get("name") or "").strip()
    candidate["candidate_id"] = _core.stable_id(candidate.get("name") or "", date[:4], city, country)
    candidate["lineage_id"] = _core.stable_id(base_name, city, country)
    return candidate


_core.candidate_from_document = _refined_candidate_from_document

# Organizer identity is stricter than social discovery: an arbitrary Instagram handle from an
# event page is never allowed to become the organizer's identity without explicit evidence.
from . import organizers as _organizers
from .organizer_identity_guard import install as _install_organizer_identity_guard
from .organizer_queue import build_runtime_progressive_organizer_research_queue

_install_organizer_identity_guard(_organizers)

# Keep organizer research history and put primary-domain identity queries first without changing
# the public cli.py call signature.
_organizers.build_organizer_research_queue = build_runtime_progressive_organizer_research_queue

__all__ = []
