from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
from urllib.parse import urlparse

from .dedup_guard import purge_incompatible_variant_evidence
from .edition_dedup import collapse_same_editions
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
_GENERIC_SERIES_TITLES = {
    "детские забеги", "kids races", "kids runs", "серия забегов", "race series", "running series",
}
_GENERIC_ORGANIZER_TITLES = {
    "беговое сообщество", "running community", "running club", "беговой клуб",
}
_ORGANIZATION_NAME_MARKERS = (
    "федерация ", " federation", "federation ", "ассоциация ", " association", "association ",
)
_ANCILLARY_TITLES = {
    "pasta party", "паста пати", "expo", "экспо", "race expo", "press conference",
    "пресс конференция", "packet pickup", "race pack pickup", "выдача стартовых пакетов",
    "выдача стартовых номеров",
}
_JSON_TITLE_MARKERS = ('"@type"', "'@type'", '@type:', '"url":', '"name":', 'schema.org')


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


def _all_rootish_sources(row: dict) -> bool:
    urls = [str(x) for x in row.get("source_urls", []) if str(x).startswith("http")]
    if not urls:
        return False
    for url in urls:
        try:
            path = urlparse(url).path.casefold().rstrip("/")
        except Exception:
            return False
        if path not in {"", "/ru", "/en", "/kz"}:
            return False
    return True


def _generic_organization_multi_event_merge(row: dict, normalized_name: str) -> bool:
    """Detect an old parser record that merged several event pages under a federation/site title."""
    if not any(marker.strip() in normalized_name for marker in _ORGANIZATION_NAME_MARKERS):
        return False
    urls = [str(x) for x in row.get("source_urls", []) if str(x).startswith("http")]
    event_paths = set()
    for url in urls:
        try:
            path = urlparse(url).path.casefold().rstrip("/")
        except Exception:
            continue
        if "/events/" in path or "/event/" in path or "/competitions/" in path or "/competition/" in path:
            event_paths.add(path)
    return len(event_paths) >= 2


def artifact_reason(row: dict) -> str:
    """Return a reason only for high-precision machine-detectable non-event records.

    Ambiguous races stay in review. Specific calendar leads stay discoverable. We quarantine only
    impossible/template titles, whole-page aggregates, generic series parents, historical generic
    organization merges and clearly ancillary program items that have no race distance of their own.
    """
    name = str(row.get("name") or "").strip()
    low = name.casefold()
    normalized = _normalized_title(name)
    distances = list(row.get("distances") or [])

    if not name:
        return "EMPTY_EVENT_NAME"
    if any(marker in low for marker in _CSS_MARKERS) or ("{" in name and "}" in name):
        return "CSS_OR_TEMPLATE_AS_EVENT_TITLE"
    if sum(1 for marker in _JSON_TITLE_MARKERS if marker in low) >= 2 or "@type" in low:
        return "JSON_OR_SCHEMA_FRAGMENT_AS_EVENT_TITLE"

    calendar_only = _all_calendar_sources(row)
    if calendar_only and normalized in _GENERIC_HUB_TITLES:
        return "CALENDAR_PAGE_SERIALIZED_AS_EVENT"
    if calendar_only and len(distances) >= 10:
        return "CALENDAR_PAGE_SERIALIZED_AS_EVENT"
    if normalized in _GENERIC_HUB_TITLES:
        urls = row.get("source_urls", [])
        if any("calendar" in str(u).casefold() for u in urls):
            return "GENERIC_CALENDAR_ARTIFACT"

    rootish = _all_rootish_sources(row)
    if rootish and normalized in _GENERIC_ORGANIZER_TITLES and len(distances) >= 4:
        return "ORGANIZER_HOMEPAGE_SERIALIZED_AS_EVENT"
    if rootish and normalized in _GENERIC_SERIES_TITLES:
        return "SERIES_LANDING_PAGE_SERIALIZED_AS_SINGLE_EVENT"
    if _generic_organization_multi_event_merge(row, normalized):
        return "GENERIC_ORGANIZATION_MULTI_EVENT_MERGE"

    if normalized in _ANCILLARY_TITLES and not distances:
        return "ANCILLARY_PROGRAM_ITEM_NOT_RACE"
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
            "same_edition_duplicates_collapsed": 0, "variant_evidence_rows_removed": 0,
            "variant_sources_sanitized": 0, "candidates_after": 0,
            "evidence_rows_compacted": 0,
        }

    observed = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    kept = []
    artifact_rejected = []
    evidence_removed = 0
    for original in candidates:
        row, removed = compact_record_provenance(original)
        evidence_removed += removed
        reason = artifact_reason(row)
        if not reason:
            kept.append(row)
            continue
        artifact_rejected.append({
            **row,
            "quarantine_reason": reason,
            "quarantined_at": observed,
            "hygiene_version": 7,
        })

    # This pass is intentionally outside collapse_same_editions so sanitizer-only changes are
    # observable and persisted even when there is no quarantine, provenance compaction or duplicate.
    sanitized_kept = []
    variant_evidence_rows_removed = 0
    variant_sources_sanitized = 0
    for original in kept:
        row, removed, blocked = purge_incompatible_variant_evidence(original)
        variant_evidence_rows_removed += removed
        variant_sources_sanitized += len(blocked)
        sanitized_kept.append(row)
    kept = sanitized_kept

    kept, duplicate_archived = collapse_same_editions(kept)
    duplicate_archived = [{
        **row,
        "quarantine_reason": "SAME_EDITION_DUPLICATE_COLLAPSED",
        "quarantined_at": observed,
        "hygiene_version": 7,
    } for row in duplicate_archived]

    # The canonicalizer combines provenance from both records. Compact that union once more so
    # repeated evidence does not regrow after historical duplicate cleanup.
    compacted_kept = []
    for original in kept:
        row, removed = compact_record_provenance(original)
        evidence_removed += removed
        compacted_kept.append(row)
    kept = compacted_kept

    archived = artifact_rejected + duplicate_archived
    candidate_changed = bool(archived or evidence_removed or variant_evidence_rows_removed or variant_sources_sanitized)
    if candidate_changed:
        _write_jsonl(candidates_path, kept)

    if archived:
        old_quarantine = _read_jsonl(root / "quarantine.jsonl")
        quarantine_by_key = {}
        for row in old_quarantine + archived:
            key = (row.get("candidate_id"), row.get("quarantine_reason"), tuple(row.get("source_urls", [])))
            quarantine_by_key[key] = row
        _write_jsonl(root / "quarantine.jsonl", list(quarantine_by_key.values())[-1000:])

    active_ids = {r.get("candidate_id") for r in kept if r.get("candidate_id")}
    removed_queue = _filter_by_candidate_ids(root / "organizer_research_queue.jsonl", active_ids) if archived else 0
    removed_discovery = _filter_by_candidate_ids(root / "discovery_list.jsonl", active_ids) if archived else 0
    removed_existing = _filter_by_candidate_ids(root / "already_in_app.jsonl", active_ids) if archived else 0
    removed_model = _filter_by_candidate_ids(root / "model_queue.jsonl", active_ids) if archived else 0

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
    if organizers and (archived or organizer_evidence_removed or organizer_removed):
        _write_jsonl(root / "organizers.jsonl", organizers_kept)
        _write_jsonl(root / "organizer_outreach_ready.jsonl", outreach_ready(organizers_kept))

    return {
        "market_code": code,
        "candidates_before": len(candidates),
        "quarantined": len(artifact_rejected),
        "quarantine_reasons": dict(_count(r.get("quarantine_reason") for r in artifact_rejected)),
        "same_edition_duplicates_collapsed": len(duplicate_archived),
        "variant_evidence_rows_removed": variant_evidence_rows_removed,
        "variant_sources_sanitized": variant_sources_sanitized,
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

    if any(
        r.get("quarantined") or r.get("same_edition_duplicates_collapsed")
        or r.get("variant_evidence_rows_removed") or r.get("variant_sources_sanitized")
        or r.get("evidence_rows_compacted")
        for r in results
    ):
        from .market_runner import aggregate_global
        aggregate_global()

    payload = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "markets": results,
        "quarantined_total": sum(int(r.get("quarantined", 0)) for r in results),
        "same_edition_duplicates_collapsed_total": sum(
            int(r.get("same_edition_duplicates_collapsed", 0)) for r in results
        ),
        "variant_evidence_rows_removed_total": sum(
            int(r.get("variant_evidence_rows_removed", 0)) for r in results
        ),
        "variant_sources_sanitized_total": sum(
            int(r.get("variant_sources_sanitized", 0)) for r in results
        ),
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
