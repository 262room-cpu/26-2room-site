from __future__ import annotations

import json
import pathlib

from .core import domain, stable_id

SOCIAL_DOMAINS = {"instagram.com", "facebook.com", "t.me", "telegram.me", "wa.me", "whatsapp.com"}


def _unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(v for v in values if v))


def _research_domains(event: dict) -> list[str]:
    urls = list(event.get("source_urls", [])) + [event.get("official_site") or ""]
    out = []
    for url in urls:
        d = domain(url)
        if not d or d in SOCIAL_DOMAINS or any(d.endswith("." + s) for s in SOCIAL_DOMAINS):
            continue
        out.append(d)
    return _unique(out)[:3]


def _query_pack(event: dict, organizer: dict | None) -> list[str]:
    event_name = str(event.get("name") or "").strip()
    country = str(event.get("country") or "").strip()
    city = str(event.get("city") or "").strip()
    org_name = str((organizer or {}).get("name") or "").strip()
    domains = _research_domains(event)

    queries: list[str] = []
    if org_name:
        # When identity is already known, finding a real contact is the priority.
        for d in domains:
            queries.append(f'site:{d} "{org_name}" (контакты OR contact OR Instagram OR Telegram)')
        queries.extend([
            f'"{org_name}" (Instagram OR Telegram OR WhatsApp OR email) {country}',
            f'"{event_name}" "{org_name}" контакты {city} {country}',
            f'site:instagram.com "{org_name}" {country}',
            f'site:t.me "{org_name}" {country}',
        ])
    else:
        # Unknown identity: first interrogate the event's own domains. This is both safer and
        # usually more precise than starting with a broad social search.
        for d in domains:
            queries.append(f'site:{d} "{event_name}" (организатор OR organizer OR организаторы OR contacts)')
        queries.extend([
            f'"{event_name}" (организатор OR organizer) {city} {country}',
            f'"{event_name}" (Instagram OR Telegram) {city} {country}',
            f'site:instagram.com "{event_name}" {city}',
            f'site:t.me "{event_name}" {city}',
        ])

    return _unique([" ".join(q.split()) for q in queries if q.strip()])


def build_progressive_organizer_research_queue(
    events: list[dict],
    organizers: list[dict],
    previous_queue: list[dict],
    run_id: str,
    observed_at: str,
) -> list[dict]:
    """Build a stable research queue while preserving useful history across discovery runs.

    The old v2 queue was regenerated from scratch on every discovery pass. That erased research
    evidence/status and made the worker repeatedly rediscover the same first clues. The queue now
    keeps one stable task per event and refreshes only the query plan/reason.
    """
    by_id = {p.get("organizer_id"): p for p in organizers if p.get("organizer_id")}
    previous_by_event = {q.get("candidate_id"): q for q in previous_queue if q.get("candidate_id")}
    queue: list[dict] = []

    for event in events:
        organizer = by_id.get(event.get("organizer_id"))
        if not organizer:
            reason = "ORGANIZER_IDENTITY_MISSING"
        elif organizer.get("identity_status") != "NAMED":
            reason = "ORGANIZER_IDENTITY_AMBIGUOUS"
        elif organizer.get("contact_status") != "READY_TO_CONTACT":
            reason = "ORGANIZER_CONTACTS_MISSING"
        else:
            continue

        queries = _query_pack(event, organizer)
        previous = previous_by_event.get(event.get("candidate_id"), {})
        task = {
            "task_id": previous.get("task_id") or stable_id("organizer-research", event.get("candidate_id") or run_id),
            "candidate_id": event.get("candidate_id"),
            "organizer_id": event.get("organizer_id") or "",
            "reason": reason,
            "status": previous.get("status") or "PENDING_DISCOVERY",
            "created_at": previous.get("created_at") or observed_at,
            "last_seen_at": observed_at,
            "search_queries": queries,
            "search_hits_checked": int(previous.get("search_hits_checked", 0) or 0),
            "discovered_contact_candidates": list(previous.get("discovered_contact_candidates", []))[:50],
            "contacts_promoted": int(previous.get("contacts_promoted", 0) or 0),
            "identity_resolved": bool(previous.get("identity_resolved", False)),
            "last_researched_at": previous.get("last_researched_at", ""),
            "errors": list(previous.get("errors", []))[-10:],
        }
        # A task that was previously resolved but is no longer ready must be reopened; otherwise
        # stale status could suppress a real contact regression/change.
        if task["status"] in {"RESOLVED_READY_TO_CONTACT", "DISMISSED", "STALE_EVENT"}:
            task["status"] = "PENDING_RECHECK"
        queue.append(task)

    return queue


def _read_runtime_queue() -> list[dict]:
    path = pathlib.Path(__file__).resolve().parents[1] / "runtime" / "organizer_research_queue.jsonl"
    if not path.exists():
        return []
    out: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(row, dict):
            out.append(row)
    return out


def build_runtime_progressive_organizer_research_queue(
    events: list[dict], organizers: list[dict], run_id: str, observed_at: str
) -> list[dict]:
    """Drop-in replacement for the legacy four-argument queue builder used by cli.py."""
    return build_progressive_organizer_research_queue(
        events,
        organizers,
        _read_runtime_queue(),
        run_id,
        observed_at,
    )
