from __future__ import annotations

import copy
import re
from typing import Any

from .dedup_guard import incompatible_event_variants, purge_incompatible_variant_evidence


def _known(value: Any) -> bool:
    return value not in (None, "", [], {}, "UNKNOWN")


def same_edition(a: dict, b: dict) -> bool:
    """High-precision historical duplicate predicate.

    A lineage represents the recurring event family; the date pins one concrete edition. We still
    refuse explicitly different competition formats even if historical data accidentally reused a
    lineage id.
    """
    lineage_a = str(a.get("lineage_id") or "")
    lineage_b = str(b.get("lineage_id") or "")
    date_a = str(a.get("date") or "")
    date_b = str(b.get("date") or "")
    if not lineage_a or lineage_a != lineage_b or not date_a or date_a != date_b:
        return False
    country_a = str(a.get("country") or "").casefold().strip()
    country_b = str(b.get("country") or "").casefold().strip()
    if country_a and country_b and country_a != country_b:
        return False
    return not incompatible_event_variants(a, b)


def canonical_score(row: dict) -> float:
    """Prefer the record with the richest trustworthy event facts, not simply the newest row."""
    evidence = list(row.get("evidence") or [])
    max_weight = max((float(e.get("weight", 0) or 0) for e in evidence), default=0.0)
    score = max_weight * 100.0 + float(row.get("confidence", 0) or 0) * 25.0

    for field, points in (
        ("official_site", 7), ("registration_url", 6), ("organizer", 5),
        ("instagram", 3), ("registration_deadline", 3), ("location", 3),
    ):
        if _known(row.get(field)):
            score += points
    score += min(len(row.get("distances") or []), 8) * 2.0
    score += min(len(row.get("start_times") or []), 4) * 0.5
    score += min(len(row.get("registration_prices") or []), 4) * 0.5
    if _known(row.get("registration_status")):
        score += 3
    if re.search(r"\b20\d{2}\b", str(row.get("name") or "")):
        score += 2
    if row.get("conflicts"):
        score += 2  # conflict evidence is valuable and must not be displaced by a sparse clean row
    return score


def _unique_dicts(rows: list[dict]) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for row in rows:
        key = repr(sorted(row.items(), key=lambda kv: kv[0]))
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def merge_same_edition(canonical: dict, duplicate: dict) -> dict:
    """Merge only supplemental evidence into the selected canonical representation.

    Conflicting rich facts are not silently overwritten. The canonical record keeps its primary
    values, while both records' evidence/conflict history remains available for review.
    """
    out = copy.deepcopy(canonical)

    for field in (
        "name", "city", "region", "location", "organizer", "official_site", "instagram",
        "registration_url", "registration_deadline", "event_type",
    ):
        if not _known(out.get(field)) and _known(duplicate.get(field)):
            out[field] = copy.deepcopy(duplicate[field])

    if not _known(out.get("registration_status")) and _known(duplicate.get("registration_status")):
        out["registration_status"] = duplicate.get("registration_status")
    for field in ("distances", "start_times", "registration_prices"):
        if not out.get(field) and duplicate.get(field):
            out[field] = copy.deepcopy(duplicate[field])

    out["source_urls"] = list(dict.fromkeys(list(out.get("source_urls") or []) + list(duplicate.get("source_urls") or [])))
    out["evidence"] = list(out.get("evidence") or []) + list(duplicate.get("evidence") or [])
    out["changes"] = _unique_dicts(list(out.get("changes") or []) + list(duplicate.get("changes") or []))[-100:]
    out["conflicts"] = _unique_dicts(list(out.get("conflicts") or []) + list(duplicate.get("conflicts") or []))[-100:]
    out["confidence"] = max(float(out.get("confidence", 0) or 0), float(duplicate.get("confidence", 0) or 0))
    out["last_checked_at"] = max(str(out.get("last_checked_at") or ""), str(duplicate.get("last_checked_at") or ""))

    merged_ids = list(out.get("merged_candidate_ids") or [])
    for value in (duplicate.get("candidate_id"), *(duplicate.get("merged_candidate_ids") or [])):
        if value and value != out.get("candidate_id") and value not in merged_ids:
            merged_ids.append(value)
    if merged_ids:
        out["merged_candidate_ids"] = merged_ids[-50:]

    statuses = {str(out.get("status") or ""), str(duplicate.get("status") or "")}
    if "CANCELLED" in statuses:
        out["status"] = "CANCELLED"
        out["pipeline_status"] = "NEEDS_REVIEW"
    elif "POSTPONED" in statuses:
        out["status"] = "POSTPONED"
        out["pipeline_status"] = "NEEDS_REVIEW"
    elif out.get("conflicts"):
        out["status"] = "CONFLICT"
        out["pipeline_status"] = "NEEDS_REVIEW"
    return out


def collapse_same_editions(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    """Sanitize historical cross-format leaks, then collapse exact edition duplicates."""
    sanitized_rows: list[dict] = []
    for row in rows:
        sanitized, _, _ = purge_incompatible_variant_evidence(row)
        sanitized_rows.append(sanitized)

    groups: dict[tuple[str, str], list[dict]] = {}
    passthrough: list[dict] = []
    for row in sanitized_rows:
        lineage = str(row.get("lineage_id") or "")
        date = str(row.get("date") or "")
        if not lineage or not date:
            passthrough.append(row)
            continue
        groups.setdefault((lineage, date), []).append(row)

    collapsed = list(passthrough)
    archived: list[dict] = []
    for _, group in groups.items():
        if len(group) == 1:
            collapsed.append(group[0])
            continue

        # A historical bug could theoretically have assigned one lineage to different explicit
        # formats. Partition conservatively instead of forcing them into one canonical record.
        partitions: list[list[dict]] = []
        for row in group:
            placed = False
            for part in partitions:
                if all(same_edition(row, existing) for existing in part):
                    part.append(row)
                    placed = True
                    break
            if not placed:
                partitions.append([row])

        for part in partitions:
            if len(part) == 1:
                collapsed.append(part[0])
                continue
            canonical = max(part, key=canonical_score)
            merged = copy.deepcopy(canonical)
            for duplicate in part:
                if duplicate is canonical:
                    continue
                merged = merge_same_edition(merged, duplicate)
                archived.append({
                    **copy.deepcopy(duplicate),
                    "duplicate_of_candidate_id": canonical.get("candidate_id"),
                })
            collapsed.append(merged)

    collapsed.sort(key=lambda r: (str(r.get("date") or "9999"), str(r.get("name") or "")))
    return collapsed, archived