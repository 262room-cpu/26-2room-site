from __future__ import annotations

import difflib
import json
import os
import pathlib
import re
import urllib.request
from urllib.parse import urlparse

from .core import domain, normalize


def _unique(values):
    return list(dict.fromkeys(v for v in values if v))


def _split(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return _unique([str(x).strip() for x in value if str(x).strip()])
    return _unique([x.strip() for x in re.split(r"[;\n]+", str(value)) if x.strip()])


def _instagram(value: str) -> str:
    value = str(value or "").strip()
    if not value:
        return ""
    if value.startswith("@"):
        value = value[1:]
    if "instagram.com" not in value:
        handle = value.strip("/ ")
        return f"https://www.instagram.com/{handle}/" if handle else ""
    try:
        p = urlparse(value if "://" in value else "https://" + value)
        handle = p.path.strip("/").split("/", 1)[0]
        return f"https://www.instagram.com/{handle}/" if handle else ""
    except Exception:
        return ""


def _phone(value: str) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    return digits[-11:] if len(digits) >= 10 else digits


def _email(value: str) -> str:
    return str(value or "").strip().lower()


# CRM rows often use short legal forms while official pages spell them out. Expanding only
# well-known legal-form tokens is safer than globally lowering fuzzy-name thresholds.
_LEGAL_FORM_ALIASES = (
    (r"\bкф\b", "корпоративный фонд"),
    (r"\bоо\b", "общественное объединение"),
    (r"\bтоо\b", "товарищество с ограниченной ответственностью"),
    (r"\bип\b", "индивидуальный предприниматель"),
    (r"\bооо\b", "общество с ограниченной ответственностью"),
    (r"\bано\b", "автономная некоммерческая организация"),
)


def _identity_name(value: str) -> str:
    text = normalize(str(value or ""))
    for pattern, replacement in _LEGAL_FORM_ALIASES:
        text = re.sub(pattern, replacement, text)
    return " ".join(text.split())


def normalize_crm_row(row: dict) -> dict:
    """Normalize either exported 26.2 ROOM CRM columns or canonical JSON fields."""
    contacts = row.get("contacts") or {}
    instagram_raw = row.get("instagram") or row.get("Соцсеть / Instagram") or contacts.get("instagram") or []
    website_raw = row.get("website") or row.get("Сайт") or contacts.get("website") or []
    phone_raw = row.get("phone") or row.get("Телефон") or row.get("Телефон / WhatsApp") or contacts.get("phone") or []
    email_raw = row.get("email") or row.get("E-mail") or contacts.get("email") or []

    instagrams = _unique([_instagram(x) for x in _split(instagram_raw) if _instagram(x)])
    websites = _split(website_raw)
    phones = _unique([_phone(x) for x in _split(phone_raw) if _phone(x)])
    emails = _unique([_email(x) for x in _split(email_raw) if _email(x)])
    name = str(row.get("name") or row.get("Название") or row.get("Организатор / бренд") or "").strip()
    aliases = _split(row.get("aliases") or [])

    return {
        "crm_id": str(row.get("crm_id") or row.get("CRM ID") or row.get("id") or "").strip(),
        "section": str(row.get("section") or row.get("Раздел") or "").strip(),
        "name": name,
        "aliases": aliases,
        "city_region": str(row.get("city_region") or row.get("Город / регион") or "").strip(),
        "website": websites,
        "website_domains": _unique([domain(x) for x in websites if domain(x)]),
        "instagram": instagrams,
        "phone": phones,
        "email": emails,
        "contact_person": str(row.get("contact_person") or row.get("Контактное лицо / отдел") or row.get("Контактное лицо") or "").strip(),
        "verification_status": str(row.get("verification_status") or row.get("Статус проверки") or row.get("Уровень проверки") or "").strip(),
        "already_added": str(row.get("already_added") or row.get("Добавлен в 26.2 ROOM / CRM") or row.get("Добавлен в 26.2 ROOM") or "").strip(),
        "duplicate_key": str(row.get("duplicate_key") or row.get("Ключ дубля") or "").strip(),
    }


def _read_jsonl(path: pathlib.Path) -> list[dict]:
    rows = []
    if not path.exists():
        return rows
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            rows.append(normalize_crm_row(value))
    return rows


def _read_json(path: pathlib.Path) -> list[dict]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    rows = payload if isinstance(payload, list) else payload.get("rows", []) if isinstance(payload, dict) else []
    return [normalize_crm_row(r) for r in rows if isinstance(r, dict)]


def load_organizer_crm(runtime: pathlib.Path) -> tuple[list[dict], str]:
    """Load an organizer CRM index without allowing private data into a public persisted runtime.

    Safe default:
      - optional `runtime/organizer_crm_public_index.jsonl` contains a deliberately sanitized index.
    Private mode (dedicated private repo/private runtime only):
      - set PRIVATE_RUNTIME=1 and ORGANIZER_CRM_FILE or ORGANIZER_CRM_URL.
    The current public prototype intentionally does not set PRIVATE_RUNTIME.
    """
    public_index = runtime / "organizer_crm_public_index.jsonl"
    if public_index.exists():
        return _read_jsonl(public_index), f"PUBLIC_INDEX:{public_index.name}"

    if os.environ.get("PRIVATE_RUNTIME") != "1":
        return [], "PRIVATE_CRM_BLOCKED_IN_PUBLIC_RUNTIME"

    file_path = os.environ.get("ORGANIZER_CRM_FILE", "").strip()
    if file_path:
        path = pathlib.Path(file_path)
        if path.suffix.lower() == ".jsonl":
            return _read_jsonl(path), f"PRIVATE_FILE:{path.name}"
        if path.suffix.lower() == ".json":
            return _read_json(path), f"PRIVATE_FILE:{path.name}"

    url = os.environ.get("ORGANIZER_CRM_URL", "").strip()
    if url.startswith("https://"):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "262room-race-discovery/0.3"})
            with urllib.request.urlopen(req, timeout=15) as response:
                raw = response.read(5_000_000).decode("utf-8", errors="replace")
            rows = []
            if url.lower().endswith(".jsonl"):
                for line in raw.splitlines():
                    if line.strip():
                        value = json.loads(line)
                        if isinstance(value, dict):
                            rows.append(normalize_crm_row(value))
            else:
                payload = json.loads(raw)
                values = payload if isinstance(payload, list) else payload.get("rows", [])
                rows = [normalize_crm_row(x) for x in values if isinstance(x, dict)]
            return rows, "PRIVATE_HTTPS_ENDPOINT"
        except Exception as exc:
            return [], f"PRIVATE_CRM_LOAD_FAILED:{type(exc).__name__}"

    return [], "PRIVATE_CRM_NOT_CONFIGURED"


def _profile_values(profile: dict, key: str) -> set[str]:
    values = (profile.get("contacts") or {}).get(key, [])
    if key == "instagram":
        return {normalize(_instagram(x)) for x in values if _instagram(x)}
    if key == "email":
        return {_email(x) for x in values if _email(x)}
    if key in {"phone", "whatsapp"}:
        return {_phone(x) for x in values if _phone(x)}
    return {normalize(str(x)) for x in values if x}


def _name_similarity(profile: dict, row: dict) -> float:
    names = [str(profile.get("name") or "")] + list(profile.get("aliases", []))
    targets = [row.get("name", "")] + list(row.get("aliases", []))
    best = 0.0
    for a in names:
        for b in targets:
            na, nb = _identity_name(a), _identity_name(b)
            if not na or not nb:
                continue
            if na == nb:
                return 1.0
            best = max(best, difflib.SequenceMatcher(None, na, nb).ratio())
    return best


def crm_match_score(profile: dict, row: dict) -> tuple[float, list[str]]:
    """Score one discovered organizer against an existing CRM row.

    Shared generic registration websites are deliberately weak. A unique social/email/phone or a
    strong name match is required for automatic EXISTING_ORGANIZER classification.
    """
    reasons = []
    score = 0.0

    profile_ig = _profile_values(profile, "instagram")
    row_ig = {normalize(x) for x in row.get("instagram", [])}
    if profile_ig & row_ig:
        score = max(score, 0.97)
        reasons.append("instagram_exact")

    profile_email = _profile_values(profile, "email")
    row_email = set(row.get("email", []))
    if profile_email & row_email:
        score = max(score, 0.98)
        reasons.append("email_exact")

    profile_phone = _profile_values(profile, "phone") | _profile_values(profile, "whatsapp")
    row_phone = set(row.get("phone", []))
    if profile_phone & row_phone:
        score = max(score, 0.97)
        reasons.append("phone_exact")

    name_sim = _name_similarity(profile, row)
    if name_sim == 1.0:
        score = max(score, 0.94)
        reasons.append("name_exact")
    elif name_sim >= 0.92:
        score = max(score, 0.86)
        reasons.append("name_very_close")
    elif name_sim >= 0.82:
        score = max(score, 0.74)
        reasons.append("name_close")

    profile_domains = {domain(x) for x in (profile.get("contacts") or {}).get("website", []) if domain(x)}
    row_domains = set(row.get("website_domains", []))
    if profile_domains & row_domains:
        # Same site alone can mean multiple brands under one registration/organizer umbrella.
        score = max(score, 0.64)
        reasons.append("website_domain")
        if name_sim >= 0.75:
            score = max(score, 0.88)
            reasons.append("website_plus_name")

    city = normalize(" ".join(profile.get("cities", [])))
    crm_city = normalize(row.get("city_region", ""))
    if score >= 0.70 and city and crm_city and (city in crm_city or crm_city in city):
        score = min(1.0, score + 0.03)
        reasons.append("city_support")

    return round(score, 3), reasons


def annotate_organizer_against_crm(profile: dict, catalog: list[dict]) -> dict:
    out = dict(profile)
    if not catalog:
        out["crm_relation"] = "CRM_NOT_CONNECTED"
        out["crm_match_id"] = ""
        out["crm_match_score"] = 0.0
        out["crm_contact_additions"] = []
        return out

    named_identity = bool(str(profile.get("name") or "").strip()) and profile.get("identity_status") != "UNRESOLVED"

    scored = []
    for row in catalog:
        score, reasons = crm_match_score(profile, row)
        if score > 0:
            scored.append((score, row, reasons))
    scored.sort(key=lambda item: item[0], reverse=True)
    if not scored:
        out["crm_relation"] = "NEW_ORGANIZER_LEAD" if named_identity else "CRM_IDENTITY_INSUFFICIENT"
        out["crm_match_id"] = ""
        out["crm_match_score"] = 0.0
        out["crm_contact_additions"] = []
        return out

    best_score, best, reasons = scored[0]
    second_score = scored[1][0] if len(scored) > 1 else 0.0
    ambiguity_gap = best_score - second_score

    exact_unique_signal = bool({"email_exact", "phone_exact", "name_exact"} & set(reasons))
    social_exact = "instagram_exact" in reasons
    automatic = best_score >= 0.92 and (exact_unique_signal or (social_exact and ambiguity_gap >= 0.06))

    if automatic:
        relation = "EXISTING_ORGANIZER"
    elif best_score >= 0.72:
        relation = "POSSIBLE_CRM_MATCH"
    else:
        relation = "NEW_ORGANIZER_LEAD" if named_identity else "CRM_IDENTITY_INSUFFICIENT"

    additions = []
    if relation == "EXISTING_ORGANIZER":
        for kind in ("instagram", "email", "phone"):
            discovered = _profile_values(profile, kind)
            existing = set(best.get(kind, [])) if kind != "instagram" else {normalize(x) for x in best.get(kind, [])}
            for value in sorted(discovered - existing):
                additions.append({"field": kind, "value": value})
        if additions:
            relation = "EXISTING_ORGANIZER_CONTACT_UPDATE"

    matched_relations = {"EXISTING_ORGANIZER", "EXISTING_ORGANIZER_CONTACT_UPDATE", "POSSIBLE_CRM_MATCH"}
    out["crm_relation"] = relation
    out["crm_match_id"] = best.get("crm_id", "") if relation in matched_relations else ""
    out["crm_match_name"] = best.get("name", "") if relation in matched_relations else ""
    out["crm_match_section"] = best.get("section", "") if relation in matched_relations else ""
    out["crm_match_score"] = best_score
    out["crm_match_reasons"] = reasons
    out["crm_second_score"] = second_score
    out["crm_contact_additions"] = additions
    return out
