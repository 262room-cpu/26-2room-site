from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
from urllib.parse import urlparse

from .organizers import outreach_ready
from .provenance import compact_record_provenance

ROOT = pathlib.Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "runtime"
MARKETS = RUNTIME / "markets"

_CSS_MARKERS = (
    "border-left", "border-right", "font-size", "background-color", "var(--", ".race-card",
    "display: flex", "display:grid", "@media", "{ color:", "{ border", "{background",
)
_GENERIC_HUB_TITLES = {
    "calendar", "календарь", "events", "события", "tengriseries", "race calendar",
    "календарь стартов", "календарь соревнований",
}


def _read_jsonl(path: pathlib.Path) -> list[dict]:
    if not path.exists():
        return []
    out = []
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


def _write_jsonl(path: pathlib.Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")


def _normalized_title(value: str) -> str:
    return " ".join(re.sub(r"[^\w]+", " ", str(value or "").casefold(), flags=re.UNICODE).split())


def _all_calendar_sources(row: dict) -> bool:
    urls = [str(x) for x in row.get("source_urls", []) if str(x).startswith("http")]
    if not urls:
        return False
    for url in urls:
        try:
            path = urlparse(url).path.casefold().rstrip("/")
        except Exception:
            return False
        if not (path.endswith("/calendar") or "/calendar/" in path or path.endswith("/events/calendar")):
            return False
    return True


def artifact_reason(row: dict) -> str:
    """Return a reason only for high-precision machine-detectable garbage.

    A calendar entry can be a legitimate *lead* even before we find its event page, so calendar
    provenance alone is not enough to delete it. We quarantine only impossible/template titles or
    obvious whole-calendar aggregates.
    """
    name = str(row.get("name") or "").strip()
    low = name.casefold()
    normalized = _normalized_title(name)

    if not name:
        return "EMPTY_EVENT_NAME"
    if any(marker in low for marker in _CSS_MARKERS) or ("{" in name and "}" in name):
        return "CSS_OR_TEMPLATE_AS_EVENT_TITLE"

    calendar_only = _all_calendar_sources(row)
    if calendar_only and normalized in _GENERIC_HUB_TITLES:
        return "CALENDAR_PAGE_SERIALIZED_AS_EVENT"
    if calendar_only and len(row.get("distances") or []) >= 10:
        # A single race rarely exposes ten+ distinct race distances. On a calendar URL this is a
        # strong signature that the old parser concatenated several cards into one candidate.
        return "CALENDAR_PAGE_SERIALIZED_AS_EVENT"
    if normalized in _GENERIC_HUB_TITLES:
        urls = row.get("source_urls", [])
        if any("calendar" in str(u).casefold() for u in urls):
            return "GENERIC_CALENDAR_ARTIFACT"
    return ""


def _filter_by_candidate_ids(path: pathlib.Path, active_ids: set[str]) -> int:
    rows = _read_jsonl(path)
    if not rows:
        return 0
    kept = []
    removed = 0
    for row in rows:
        cid = row.get("candidate_id")
        if cid and cid not in active_ids:
            removed += 1
            continue
        kept.append(row)
    if removed:
        _write_jsonl(path, kept)
    return removed


def clean_market(code: str) -> dict:
    root = MARKETS / code
    candidates_path = root / "candidates.jsonl"
    candidates = _read_jsonl(candidates_path)
    if not candidates:
        return {
            "market_code": code, "candidates_before": 0, "quarantined": 0,
            "candidates_after": 0, "evidence_rows_compacted": 0,
        }

    observed = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    kept = []
    rejected = []
    evidence_removed = 0
    for original in candidates:
        row, removed = compact_record_provenance(original)
        evidence_removed += removed
        reason = artifact_reason(row)
        if not reason:
            kept.append(row)
            continue
        rejected.append({
            **row,
            "quarantine_reason": reason,
            "quarantined_at": observed,
            "hygiene_version": 3,
        })

    if rejected or evidence_removed:
        _write_jsonl(candidates_path, kept)

    if rejected:
        old_quarantine = _read_jsonl(root / "quarantine.jsonl")
        # Avoid appending the same artifact forever if an old parser recreates it unexpectedly.
        quarantine_by_key = {}
        for row in old_quarantine + rejected:
            key = (row.get("candidate_id"), row.get("quarantine_reason"), tuple(row.get("source_urls", [])))
            quarantine_by_key[key] = row
        _write_jsonl(root / "quarantine.jsonl", list(quarantine_by_key.values())[-1000:])

    active_ids = {r.get("candidate_id") for r in kept if r.get("candidate_id")}
    removed_queue = _filter_by_candidate_ids(root / "organizer_research_queue.jsonl", active_ids) if rejected else 0
    removed_discovery = _filter_by_candidate_ids(root / "discovery_list.jsonl", active_ids) if rejected else 0
    removed_existing = _filter_by_candidate_ids(root / "already_in_app.jsonl", active_ids) if rejected else 0
    removed_model = _filter_by_candidate_ids(root / "model_queue.jsonl", active_ids) if rejected else 0

    # Organizer rows may refer to several events. Keep the profile if at least one real event
    # survives, trim quarantined event links and compact repeated evidence on every hygiene pass.
    organizers = _read_jsonl(root / "organizers.jsonl")
    organizers_kept = []
    organizer_removed = 0
    organizer_evidence_removed = 0
    for original in organizers:
        row, removed = compact_record_provenance(original)
        organizer_evidence_removed += removed
        event_ids = [eid for eid in row.get("event_ids", []) if eid in active_ids]
        if not event_ids:
            organizer_removed += 1
            continue
        row["event_ids"] = event_ids
        organizers_kept.append(row)
    if organizers and (rejected or organizer_evidence_removed or organizer_removed):
        _write_jsonl(root / "organizers.jsonl", organizers_kept)
        _write_jsonl(root / "organizer_outreach_ready.jsonl", outreach_ready(organizers_kept))

    return {
        "market_code": code,
        "candidates_before": len(candidates),
        "quarantined": len(rejected),
        "quarantine_reasons": dict(_count(r.get("quarantine_reason") for r in rejected)),
        "candidates_after": len(kept),
        "related_rows_removed": removed_queue + removed_discovery + removed_existing + removed_model,
        "organizers_removed": organizer_removed,
        "evidence_rows_compacted": evidence_removed + organizer_evidence_removed,
    }


def _count(values):
    result = {}
    for value in values:
        result[value] = result.get(value, 0) + 1
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--market", action="append", default=[])
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()

    if args.market:
        codes = args.market
    else:
        codes = sorted(p.name for p in MARKETS.iterdir() if p.is_dir()) if MARKETS.exists() else []
    results = [clean_market(code) for code in codes]

    # Rebuild global state after artifacts or provenance compaction so the report sees clean rows.
    if any(r.get("quarantined") or r.get("evidence_rows_compacted") for r in results):
        from .market_runner import aggregate_global
        aggregate_global()

    payload = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "markets": results,
        "quarantined_total": sum(int(r.get("quarantined", 0)) for r in results),
        "evidence_rows_compacted_total": sum(int(r.get("evidence_rows_compacted", 0)) for r in results),
    }
    (RUNTIME / "global").mkdir(parents=True, exist_ok=True)
    (RUNTIME / "global" / "HYGIENE_REPORT.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
