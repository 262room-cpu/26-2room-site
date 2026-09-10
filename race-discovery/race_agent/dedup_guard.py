from __future__ import annotations

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
