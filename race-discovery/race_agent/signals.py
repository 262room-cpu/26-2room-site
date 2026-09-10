from __future__ import annotations

import re
from urllib.parse import urlparse

from .core import EVENT_KEYWORDS, normalize
from .providers import SearchHit

SOCIAL_DOMAINS = {"instagram.com", "facebook.com", "t.me", "telegram.me"}
JUNK_DOMAINS = {
    "etsy.com", "genius.com", "shazam.com", "merriam-webster.com", "microsoft.com",
    "investing.com", "compareforexbrokers.com", "boomplay.com", "unicourt.com",
}


def _domain(url: str) -> str:
    try:
        return urlparse(url).netloc.lower().removeprefix("www.")
    except Exception:
        return ""


def relevance_score(hit: SearchHit, cfg: dict, query: str = "") -> float:
    d = _domain(hit.url)
    if d in JUNK_DOMAINS:
        return 0.0
    text = normalize(f"{hit.title} {hit.snippet} {hit.url}")
    q = normalize(query)
    if not text:
        return 0.0

    event_terms = [normalize(x) for x in EVENT_KEYWORDS if normalize(x) != "ocr"]
    extra = [normalize(x) for x in cfg.get("event_terms", [])]
    has_event = any(term and term in text for term in event_terms + extra)
    if "ocr" in text and any(x in text for x in ("obstacle", "препятств", "race", "забег")):
        has_event = True
    if not has_event:
        return 0.0

    geo_terms = ["казахстан", "kazakhstan", "қазақстан"] + [normalize(c) for c in cfg.get("cities", [])]
    has_geo = any(g and g in text for g in geo_terms)
    query_has_geo = any(g and g in q for g in geo_terms)
    known_source = any(key in d or key in hit.url for key in cfg.get("source_hints", {}))
    social = d in SOCIAL_DOMAINS or d.endswith("instagram.com") or d.endswith("t.me")
    current_year = bool(re.search(r"\b20(?:26|27|28)\b", text))
    kz_domain = d.endswith(".kz")

    score = 0.30
    if has_geo:
        score += 0.25
    if query_has_geo:
        score += 0.10
    if known_source:
        score += 0.25
    if current_year:
        score += 0.15
    if kz_domain:
        score += 0.10
    if social:
        score += 0.10
    return min(1.0, score)


def accept_hit(hit: SearchHit, cfg: dict, query: str = "", threshold: float = 0.55) -> bool:
    return relevance_score(hit, cfg, query=query) >= threshold


def source_family(url: str) -> str:
    d = _domain(url)
    if "instagram.com" in d:
        return "INSTAGRAM"
    if d in {"t.me", "telegram.me"}:
        return "TELEGRAM"
    if "facebook.com" in d:
        return "FACEBOOK"
    return "WEB"


def should_fetch_direct(url: str) -> bool:
    d = _domain(url)
    return "instagram.com" not in d and "facebook.com" not in d


def signal_record(hit: SearchHit, query: str, observed_at: str, cfg: dict) -> dict:
    return {
        "observed_at": observed_at,
        "query": query,
        "title": hit.title,
        "snippet": hit.snippet,
        "url": hit.url,
        "domain": _domain(hit.url),
        "source_family": source_family(hit.url),
        "relevance": round(relevance_score(hit, cfg, query=query), 3),
    }


def signal_as_html(hit: SearchHit) -> str:
    title = (hit.title or "").replace("<", "&lt;").replace(">", "&gt;")
    snippet = (hit.snippet or "").replace("<", "&lt;").replace(">", "&gt;")
    return f"<html><title>{title}</title><body>{snippet}</body></html>"


def page_has_kazakhstan_evidence(raw_html: str, candidate: dict, url: str, source_type: str, cfg: dict) -> bool:
    if source_type != "secondary":
        return True
    if candidate.get("city"):
        return True
    d = _domain(url)
    if d.endswith(".kz"):
        return True
    text = normalize(raw_html[:120000])
    geo_terms = ["казахстан", "kazakhstan", "қазақстан"] + [normalize(c) for c in cfg.get("cities", [])]
    return any(g and g in text for g in geo_terms)


def social_queries(cfg: dict) -> list[str]:
    base = [
        'site:instagram.com (марафон OR забег OR trail OR триатлон) Казахстан 2026',
        'site:instagram.com (марафон OR забег OR trail OR триатлон) Казахстан 2027',
        'site:t.me (марафон OR забег OR trail OR триатлон) Казахстан 2026',
        'site:t.me (марафон OR забег OR trail OR триатлон) Казахстан 2027',
        'site:facebook.com (марафон OR забег OR trail OR триатлон) Казахстан 2026',
        '"регистрация" "забег" Казахстан 2026',
        '"старт" "дистанция" Казахстан марафон 2026',
    ]
    return list(dict.fromkeys(cfg.get("social_queries", []) + base))
