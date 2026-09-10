from __future__ import annotations

import copy
import re
from typing import Any


def _name_text(value: Any) -> str:
    value = str(value or "").casefold().replace("_", " ").replace("-", " ")
    return " ".join(re.findall(r"[\w]+", value, flags=re.UNICODE))


# These are event/competition variants that can legitimately share the same brand, date, city and
# official domain. They therefore must not be merged merely because fuzzy title similarity is high.
_VARIANT_PATTERNS = (
    ("super_sprint", (r"\bsuper\s+sprint\b", r"\bсупер\s+спринт\b")),
    ("relay", (r"\brelay\b", r"\bэстафет\w*\b")),
    ("standard", (r"\bstandard\b", r"\bстандарт\w*\b")),
    ("sprint", (r"\bsprint\b", r"\bспринт\w*\b")),
    ("aquathlon", (r"\baquathlon\b", r"\bакватлон\w*\b")),
    ("duathlon", (r"\bduathlon\b", r"\bдуатлон\w*\b")),
    ("canicross", (r"\bcanicross\b", r"\bканикросс\w*\b")),
    ("nordic", (r"\bnordic(?:\s+walking)?\b", r"\bскандинав\w*\b")),
    ("kids", (r"\bkids?\b", r"\bchildren(?:'s)?\b", r"\bдетск\w*\b")),
)


def event_variants(name: str) -> set[str]:
    text = _name_text(name)
    found: set[str] = set()
    for key, patterns in _VARIANT_PATTERNS:
        if any(re.search(pattern, text, flags=re.I) for pattern in patterns):
            found.add(key)

    # `super sprint` contains the token `sprint`; keep only the more specific discriminator.
    if "super_sprint" in found:
        found.discard("sprint")
    return found


def incompatible_event_variants(a: dict, b: dict) -> bool:
    """True when two otherwise-similar records explicitly name different race variants.

    We intentionally require both sides to carry an explicit discriminator. A generic umbrella
    title such as `Caspian Marathon` remains mergeable with `Caspian Marathon 2026`.
    """
    left = event_variants(str(a.get("name") or ""))
    right = event_variants(str(b.get("name") or ""))
    return bool(left and right and left != right)


def purge_incompatible_variant_evidence(row: dict) -> tuple[dict, int, list[str]]:
    """Remove provenance/conflicts leaked into a record by an older cross-format fuzzy merge.

    A URL is quarantined only when its own `name` evidence explicitly identifies another variant.
    Previously quarantined URLs remain available through `sanitized_variant_sources` so a later
    hygiene pass can also remove stale conflict objects left behind after evidence cleanup.

    The returned URL list contains only sources that caused an actual mutation in this pass. This
    keeps hygiene idempotent and prevents rewriting runtime forever after the record is clean.
    """
    canonical_variants = event_variants(str(row.get("name") or ""))
    if not canonical_variants:
        return row, 0, []

    evidence = list(row.get("evidence") or [])
    detected_blocked_urls: set[str] = set()
    for item in evidence:
        if item.get("field") != "name":
            continue
        url = str(item.get("url") or "")
        if not url:
            continue
        evidence_variants = event_variants(str(item.get("value") or ""))
        if evidence_variants and evidence_variants != canonical_variants:
            detected_blocked_urls.add(url)

    historical_blocked_urls = {
        str(url) for url in list(row.get("sanitized_variant_sources") or []) if str(url)
    }
    blocked_urls = detected_blocked_urls | historical_blocked_urls
    if not blocked_urls:
        return row, 0, []

    out = copy.deepcopy(row)
    mutated_urls: set[str] = set()

    old_evidence = list(out.get("evidence") or [])
    new_evidence = [item for item in old_evidence if str(item.get("url") or "") not in blocked_urls]
    if len(new_evidence) != len(old_evidence):
        removed_evidence_urls = {
            str(item.get("url") or "")
            for item in old_evidence
            if str(item.get("url") or "") in blocked_urls
        }
        mutated_urls.update(removed_evidence_urls)
    out["evidence"] = new_evidence

    old_source_urls = list(out.get("source_urls") or [])
    new_source_urls = [url for url in old_source_urls if str(url) not in blocked_urls]
    if new_source_urls != old_source_urls:
        mutated_urls.update(str(url) for url in old_source_urls if str(url) in blocked_urls)
    out["source_urls"] = new_source_urls

    for field in ("official_site", "registration_url"):
        if str(out.get(field) or "") in blocked_urls:
            mutated_urls.add(str(out.get(field)))
            out[field] = ""

    old_conflicts = list(out.get("conflicts") or [])
    kept_conflicts = []
    for conflict in old_conflicts:
        incoming_sources = {
            str(url) for url in list(conflict.get("incoming_sources") or []) if str(url)
        }
        if incoming_sources & blocked_urls:
            mutated_urls.update(incoming_sources & blocked_urls)
            continue
        kept_conflicts.append(conflict)
    out["conflicts"] = kept_conflicts

    # If CONFLICT existed only because older code merged another explicit race format into this
    # record, return it to the normal pipeline once those false conflicts are gone.
    if old_conflicts and not kept_conflicts and str(out.get("status") or "") == "CONFLICT":
        if list(out.get("changes") or []):
            out["status"] = "UPDATED"
            out["pipeline_status"] = "READY_FOR_REVIEW"
        elif float(out.get("confidence", 0) or 0) >= 0.9:
            out["status"] = "VERIFIED"
            out["pipeline_status"] = "READY_FOR_REVIEW"
        else:
            out["status"] = "NEW"
            out["pipeline_status"] = "DISCOVERED"

    audit = list(out.get("sanitized_variant_sources") or [])
    for url in sorted(detected_blocked_urls):
        if url not in audit:
            audit.append(url)
    if audit != list(out.get("sanitized_variant_sources") or []):
        mutated_urls.update(detected_blocked_urls)
    if audit:
        out["sanitized_variant_sources"] = audit[-50:]

    if not mutated_urls:
        return row, 0, []
    return out, len(old_evidence) - len(new_evidence), sorted(mutated_urls)


def install(core_module) -> None:
    original = core_module.match_score
    if getattr(original, "_variant_guard_installed", False):
        return

    def guarded_match_score(a: dict, b: dict) -> float:
        if incompatible_event_variants(a, b):
            return 0.0
        return original(a, b)

    guarded_match_score._variant_guard_installed = True
    guarded_match_score._unguarded_match_score = original
    core_module.match_score = guarded_match_score
