from __future__ import annotations

import json
import pathlib

from .core import domain, stable_id

SOCIAL_DOMAINS = {"instagram.com", "facebook.com", "t.me", "telegram.me", "wa.me", "whatsapp.com"}
QUERY_BATCH_HINT = 2
DEEP_RESEARCH_CYCLES = 3
_COMPLETED_RESEARCH_STATUSES = {
    "RESEARCHED_NO_CONTACT",
    "FOUND_CANDIDATES_NEEDS_VERIFICATION",
    "RESEARCHED_IDENTITY_MISSING",
    "IDENTITY_MISSING_CONTACT_CANDIDATES",
}


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
        for d in domains:
            queries.append(f'site:{d} "{org_name}" (контакты OR contact OR Instagram OR Telegram)')
        queries.extend([
            f'"{org_name}" (Instagram OR Telegram OR WhatsApp OR email) {country}',
            f'"{event_name}" "{org_name}" контакты {city} {country}',
            f'site:instagram.com "{org_name}" {country}',
            f'site:t.me "{org_name}" {country}',
        ])
    else:
        for d in domains:
            queries.append(f'site:{d} "{event_name}" (организатор OR organizer OR организаторы OR contacts)')
        queries.extend([
            f'"{event_name}" (организатор OR organizer) {city} {country}',
            f'"{event_name}" (Instagram OR Telegram) {city} {country}',
            f'site:instagram.com "{event_name}" {city}',
            f'site:t.me "{event_name}" {city}',
        ])

    return _unique([" ".join(q.split()) for q in queries if q.strip()])


def _rotate_queries(queries: list[str], completed_batches: int) -> tuple[list[str], int, int]:
    if not queries:
        return [], 0, 0
    offset = (max(0, completed_batches) * QUERY_BATCH_HINT) % len(queries)
    rotated = queries[offset:] + queries[:offset]
    completed_cycles = (max(0, completed_batches) * QUERY_BATCH_HINT) // len(queries)
    return rotated, offset, completed_cycles


def _completed_batches(previous: dict, same_plan: bool, reason: str) -> int:
    if not previous or not same_plan:
        if previous and not previous.get("query_plan_id") and previous.get("reason") == reason and previous.get("last_researched_at"):
            return 1
        return 0

    scheduled_round = max(1, int(previous.get("research_round", 1) or 1))
    status = str(previous.get("status") or "")
    if status in _COMPLETED_RESEARCH_STATUSES:
        return scheduled_round
    if status == "DEEP_RESEARCH_EXHAUSTED_NEEDS_REVIEW":
        return max(0, scheduled_round)
    # PENDING_* means the current scheduled batch has not actually been processed yet.
    return max(0, scheduled_round - 1)


def build_progressive_organizer_research_queue(
    events: list[dict],
    organizers: list[dict],
    previous_queue: list[dict],
    run_id: str,
    observed_at: str,
) -> list[dict]:
    """Build a stable queue whose rotation advances only after a real worker pass."""
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

        base_queries = _query_pack(event, organizer)
        plan_id = stable_id("organizer-query-plan", *base_queries)
        previous = previous_by_event.get(event.get("candidate_id"), {})
        same_plan = previous.get("query_plan_id") == plan_id and previous.get("reason") == reason
        completed_batches = _completed_batches(previous, same_plan, reason)
        queries, query_offset, completed_cycles = _rotate_queries(base_queries, completed_batches)
        exhausted = completed_cycles >= DEEP_RESEARCH_CYCLES
        scheduled_round = completed_batches + 1

        task = {
            "task_id": previous.get("task_id") or stable_id("organizer-research", event.get("candidate_id") or run_id),
            "candidate_id": event.get("candidate_id"),
            "organizer_id": event.get("organizer_id") or "",
            "reason": reason,
            "status": "DEEP_RESEARCH_EXHAUSTED_NEEDS_REVIEW" if exhausted else "PENDING_RECHECK",
            "created_at": previous.get("created_at") or observed_at,
            "last_seen_at": observed_at,
            "search_queries": [] if exhausted else queries,
            "query_plan_id": plan_id,
            "query_plan_size": len(base_queries),
            "query_offset": query_offset,
            "research_round": completed_batches if exhausted else scheduled_round,
            "completed_query_cycles": completed_cycles,
            "deep_research_exhausted": exhausted,
            "escalation_recommended": "STRONG_MODEL_OR_MANUAL_REVIEW" if exhausted else "",
            "search_hits_checked": int(previous.get("search_hits_checked", 0) or 0),
            "discovered_contact_candidates": list(previous.get("discovered_contact_candidates", []))[:50],
            "contacts_promoted": int(previous.get("contacts_promoted", 0) or 0),
            "identity_resolved": bool(previous.get("identity_resolved", False)),
            "last_researched_at": previous.get("last_researched_at", ""),
            "errors": list(previous.get("errors", []))[-10:],
        }
        queue.append(task)

    # Pending work first; exhausted checkpoints remain visible but never consume a worker slot first.
    queue.sort(key=lambda r: (bool(r.get("deep_research_exhausted")), r.get("last_researched_at") or ""))
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
    return build_progressive_organizer_research_queue(
        events,
        organizers,
        _read_runtime_queue(),
        run_id,
        observed_at,
    )
