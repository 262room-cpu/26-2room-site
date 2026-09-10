from __future__ import annotations

import json
from typing import Any


def _value_key(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    except Exception:
        return repr(value)


def evidence_key(row: dict) -> tuple:
    """Identity of one factual observation independent of the time it was rechecked."""
    return (
        row.get("field", ""),
        _value_key(row.get("value")),
        row.get("url", ""),
        row.get("source_type", ""),
        row.get("content_hash", ""),
        row.get("scope", ""),
        row.get("association", ""),
    )


def compact_evidence(rows: list[dict], max_rows: int = 600) -> list[dict]:
    """Collapse repeated identical observations while preserving first/last seen timestamps.

    Different values, URLs, source classes or content hashes remain distinct. Re-fetching the same
    unchanged page no longer creates dozens of identical evidence rows.
    """
    if not rows:
        return []
    merged: dict[tuple, dict] = {}
    order: list[tuple] = []
    for original in rows:
        if not isinstance(original, dict):
            continue
        row = dict(original)
        key = evidence_key(row)
        observed = str(row.get("observed_at") or row.get("last_observed_at") or "")
        first = str(row.get("first_observed_at") or observed)
        last = str(row.get("last_observed_at") or observed)
        if key not in merged:
            row["first_observed_at"] = first
            row["last_observed_at"] = last
            merged[key] = row
            order.append(key)
            continue

        current = merged[key]
        current_first = str(current.get("first_observed_at") or current.get("observed_at") or "")
        current_last = str(current.get("last_observed_at") or current.get("observed_at") or "")
        if first and (not current_first or first < current_first):
            current["first_observed_at"] = first
        if last and (not current_last or last > current_last):
            current["last_observed_at"] = last
            current["observed_at"] = observed or current.get("observed_at")
        current["weight"] = max(float(current.get("weight", 0) or 0), float(row.get("weight", 0) or 0))
        # Keep the strongest search relationship seen for the same fact.
        if "relation_score" in row:
            current["relation_score"] = max(
                float(current.get("relation_score", 0) or 0),
                float(row.get("relation_score", 0) or 0),
            )

    result = [merged[key] for key in order]
    # Preserve the most recent evidence window if an extreme page generated too many distinct facts.
    return result[-max_rows:]


def compact_record_provenance(row: dict) -> tuple[dict, int]:
    """Compact a candidate/organizer record and return number of evidence rows removed."""
    out = dict(row)
    before = list(out.get("evidence") or [])
    after = compact_evidence(before)
    out["evidence"] = after
    return out, max(0, len(before) - len(after))
