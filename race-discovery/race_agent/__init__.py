"""26.2 ROOM race discovery package bootstrap.

The original v1 core stays intentionally small. Multi-market deterministic parsers and safety
identity guards are installed here so every importer gets the same behavior.
"""

from . import core as _core
from .locales import focused_event_text, parse_dates as _parse_dates, parse_prices as _parse_prices

# Upgrade v1 parser globals before candidate_from_document is called.
_core.parse_dates = _parse_dates
_core.parse_prices = _parse_prices

_original_candidate_from_document = _core.candidate_from_document


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
    if focused == text:
        return candidate

    evidence = list(candidate.get("evidence", []))
    template = evidence[0] if evidence else {
        "url": url,
        "source_type": source_type,
        "observed_at": observed_at,
        "weight": _core.source_weight(source_type),
        "content_hash": "",
    }

    def replace_field(field: str, value) -> None:
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
                "scope": "FOCUSED_EVENT_BLOCK",
            })

    dates = _parse_dates(focused)
    if dates:
        replace_field("date", dates[0])
    city = _core._guess_city(focused, known_cities)
    if city:
        replace_field("city", city)
        if not candidate.get("location") or candidate.get("location") in (known_cities or []):
            replace_field("location", city)

    replace_field("distances", _core.parse_distances(focused))
    replace_field("registration_prices", _parse_prices(focused))
    replace_field("start_times", _core.parse_times(focused)[:10])
    registration_status = _core.infer_registration_status(focused)
    replace_field("registration_status", registration_status)
    candidate["event_type"] = _core.infer_event_type(f"{candidate.get('name', '')} {focused[:5000]}")
    candidate["evidence"] = evidence

    date = candidate.get("date") or ""
    candidate["candidate_id"] = _core.stable_id(
        candidate.get("name") or "", date[:4], candidate.get("city") or "", country
    )
    return candidate


_core.candidate_from_document = _refined_candidate_from_document

# Organizer identity is stricter than social discovery: an arbitrary Instagram handle from an
# event page is never allowed to become the organizer's identity without explicit evidence.
from . import organizers as _organizers
from .organizer_identity_guard import install as _install_organizer_identity_guard

_install_organizer_identity_guard(_organizers)

__all__ = []
