from __future__ import annotations

import html
import re
from urllib.parse import urlparse

from .core import eventish, normalize
from .locales import parse_dates

_ORGANIZATION_MARKERS = (
    "федерац", "federation", "association", "ассоциац", "сообщество", "community",
    "running club", "беговой клуб", "triathlon club", "sports club", "sport club",
)


def _clean_fragment(fragment: str) -> str:
    value = re.sub(r"<[^>]+>", " ", fragment or "", flags=re.S)
    value = html.unescape(value)
    return " ".join(value.split()).strip()


def organization_like_title(value: str) -> bool:
    n = normalize(value)
    return any(marker in n for marker in _ORGANIZATION_MARKERS)


def _heading_candidates(raw_html: str) -> list[tuple[int, str]]:
    rows: list[tuple[int, str]] = []
    # H1 is strongest. H2 is only a fallback because many pages use it for section headings.
    for tag, base_score in (("h1", 100), ("h2", 70)):
        for match in re.finditer(rf"<{tag}\b[^>]*>(.*?)</{tag}>", raw_html or "", flags=re.I | re.S):
            text = _clean_fragment(match.group(1))
            if text:
                rows.append((base_score, text))
    for match in re.finditer(
        r'<meta\b[^>]*(?:property|name)=["\'](?:og:title|twitter:title)["\'][^>]*content=["\']([^"\']+)["\'][^>]*>',
        raw_html or "", flags=re.I | re.S,
    ):
        text = _clean_fragment(match.group(1))
        if text:
            rows.append((85, text))
    return rows


def event_heading(raw_html: str, current_title: str, url: str = "") -> str:
    """Return an event-specific heading when the browser title is an organization/site name.

    Example: triathlon.kg uses the same `<title>Федерация Триатлона Кыргызской Республики</title>`
    on many event pages while the actual event name lives in H1. We only override when the current
    title looks organizational/generic, or when a specific `/events/...` page supplies a clearly
    event-like H1.
    """
    current = " ".join(str(current_title or "").split()).strip()
    path = urlparse(url).path.casefold()
    specific_event_path = "/event/" in path or "/events/" in path or "/competition/" in path or "/competitions/" in path
    candidates: list[tuple[int, str]] = []
    for base, heading in _heading_candidates(raw_html):
        if not (4 <= len(heading) <= 180):
            continue
        if not eventish(heading):
            continue
        score = base
        if organization_like_title(heading):
            score -= 45
        if re.search(r"\b20\d{2}\b", heading):
            score += 8
        if normalize(heading) == normalize(current):
            score -= 20
        candidates.append((score, heading))
    if not candidates:
        return current
    candidates.sort(key=lambda x: (-x[0], len(x[1])))
    best_score, best = candidates[0]
    if normalize(best) == normalize(current):
        return current
    if organization_like_title(current) and best_score >= 60:
        return best
    if specific_event_path and best_score >= 90:
        return best
    return current


_LABEL_PATTERNS = (
    r"\b(?:дата|дата\s+проведения|дата\s+забега|дата\s+старта|дата\s+соревнования|дата\s+мероприятия)\b(?!\s+регистрац)",
    r"\b(?:день\s+и\s+время\s+проведения|день\s+проведения)\b",
    r"\b(?:race\s+date|event\s+date|race\s+day)\b",
)


def explicitly_labeled_event_dates(text: str, year_min: int = 2026, year_max: int = 2028) -> list[str]:
    """Extract dates explicitly labelled as the event/race date.

    This outranks proximity heuristics. Registration deadlines, packet pickup and expo dates are
    intentionally excluded by the label patterns.
    """
    source = " ".join(str(text or "").split())
    for pattern in _LABEL_PATTERNS:
        for match in re.finditer(pattern, source, flags=re.I):
            tail = source[match.end():match.end() + 180]
            # Stop before another administrative label if one follows shortly.
            tail = re.split(
                r"\b(?:место\s+(?:старта|проведения)|location|registration|регистрац|выдача|packet\s+pickup|expo|экспо)\b",
                tail,
                maxsplit=1,
                flags=re.I,
            )[0]
            dates = parse_dates(tail, year_min=year_min, year_max=year_max)
            if dates:
                return dates
    return []
