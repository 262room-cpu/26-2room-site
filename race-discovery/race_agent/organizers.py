from __future__ import annotations

import difflib
import html
import re
from urllib.parse import parse_qs, urlparse

from .core import domain, extract_jsonld_events, match_score, normalize, source_weight, stable_id

SOCIAL_PATH_BLOCKLIST = {"p", "reel", "reels", "stories", "explore", "tv", "accounts"}
PLACEHOLDER_EMAIL_DOMAINS = {"example.com", "example.org", "example.net", "test.com", "localhost"}


def _unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(v.strip() for v in values if isinstance(v, str) and v.strip()))


def _hrefs(raw_html: str) -> list[str]:
    return [html.unescape(x) for x in re.findall(r'''href=["']([^"']+)["']''', raw_html, flags=re.I)]


def _instagram_profile(url: str) -> str:
    try:
        parsed = urlparse(url)
        if "instagram.com" not in parsed.netloc.lower():
            return ""
        part = parsed.path.strip("/").split("/")[0]
        if not part or part.lower() in SOCIAL_PATH_BLOCKLIST:
            return ""
        return f"https://www.instagram.com/{part}/"
    except Exception:
        return ""


def _telegram_profile(url: str) -> str:
    try:
        parsed = urlparse(url)
        if parsed.netloc.lower().removeprefix("www.") not in {"t.me", "telegram.me"}:
            return ""
        part = parsed.path.strip("/").split("/")[0]
        if not part or part in {"share", "joinchat", "s"}:
            return ""
        return f"https://t.me/{part}"
    except Exception:
        return ""


def _whatsapp_link(url: str) -> str:
    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower().removeprefix("www.")
        if host == "wa.me":
            digits = re.sub(r"\D", "", parsed.path)
            return f"https://wa.me/{digits}" if 8 <= len(digits) <= 15 else ""
        if "whatsapp.com" in host:
            phone = parse_qs(parsed.query).get("phone", [""])[0]
            digits = re.sub(r"\D", "", phone)
            return f"https://wa.me/{digits}" if 8 <= len(digits) <= 15 else url
    except Exception:
        pass
    return ""


def _valid_email(addr: str) -> bool:
    addr = addr.strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", addr):
        return False
    local, host = addr.rsplit("@", 1)
    if host in PLACEHOLDER_EMAIL_DOMAINS or local in {"example", "test", "email", "name", "user"}:
        return False
    return True


def extract_public_contact_candidates(raw_html: str, page_url: str = "") -> dict:
    """Collect public contact *candidates* from a page without claiming ownership.

    A page can contain sponsors, partners and unrelated social accounts. Therefore the output of
    this function is never automatically treated as the organizer's contact set. Association is
    decided separately using source type and structured organizer evidence.
    """
    hrefs = _hrefs(raw_html)
    emails: list[str] = []
    phones: list[str] = []
    instagram: list[str] = []
    telegram: list[str] = []
    whatsapp: list[str] = []

    for href in hrefs:
        lower = href.lower()
        if lower.startswith("mailto:"):
            addr = href[7:].split("?", 1)[0].strip().lower()
            if _valid_email(addr):
                emails.append(addr)
        elif lower.startswith("tel:"):
            raw = href[4:].split("?", 1)[0]
            digits = re.sub(r"\D", "", raw)
            if 8 <= len(digits) <= 15:
                phones.append(("+" if raw.strip().startswith("+") else "") + digits)

        ig = _instagram_profile(href)
        if ig:
            instagram.append(ig)
        tg = _telegram_profile(href)
        if tg:
            telegram.append(tg)
        wa = _whatsapp_link(href)
        if wa:
            whatsapp.append(wa)

    for addr in re.findall(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", raw_html, flags=re.I):
        if _valid_email(addr):
            emails.append(addr.lower())

    websites: list[str] = []
    if page_url.startswith("http") and domain(page_url) not in {"instagram.com", "t.me", "telegram.me"}:
        websites.append(page_url)

    return {
        "instagram": _unique(instagram)[:25],
        "telegram": _unique(telegram)[:15],
        "whatsapp": _unique(whatsapp)[:15],
        "email": _unique(emails)[:15],
        "phone": _unique(phones)[:15],
        "website": _unique(websites)[:10],
    }


def _empty_contacts() -> dict:
    return {"instagram": [], "telegram": [], "whatsapp": [], "email": [], "phone": [], "website": []}


def _jsonld_organizer(raw_html: str) -> tuple[str, str]:
    for event in extract_jsonld_events(raw_html):
        org = event.get("organizer") or {}
        if isinstance(org, dict):
            name = str(org.get("name") or "").strip()
            url = str(org.get("url") or "").strip()
            if name or url:
                return name, url
        elif isinstance(org, str) and org.strip():
            return org.strip(), ""
    return "", ""


def _add_structured_url(contacts: dict, structured_url: str) -> None:
    if not structured_url.startswith("http"):
        return
    ig = _instagram_profile(structured_url)
    tg = _telegram_profile(structured_url)
    wa = _whatsapp_link(structured_url)
    if ig:
        contacts["instagram"] = _unique(contacts["instagram"] + [ig])
    elif tg:
        contacts["telegram"] = _unique(contacts["telegram"] + [tg])
    elif wa:
        contacts["whatsapp"] = _unique(contacts["whatsapp"] + [wa])
    else:
        contacts["website"] = _unique(contacts["website"] + [structured_url])


def organizer_lead_from_document(event: dict, raw_html: str, page_url: str, source_type: str, observed_at: str) -> dict | None:
    candidates = extract_public_contact_candidates(raw_html, page_url)
    structured_name, structured_url = _jsonld_organizer(raw_html)
    name = (structured_name or event.get("organizer") or "").strip()
    contacts = _empty_contacts()

    # Only an organizer-owned page can safely donate all of its own contact links.
    if source_type == "official_organizer" and name:
        for key in contacts:
            contacts[key] = list(candidates.get(key, []))

    # Structured organizer URL is explicitly tied to the organizer by the page metadata.
    if name and structured_url:
        _add_structured_url(contacts, structured_url)

    # On a named official event page, direct mail/tel/WhatsApp are useful outreach channels,
    # while arbitrary social links are not trusted because they may belong to sponsors/partners.
    if name and source_type == "official_event":
        for key in ("email", "phone", "whatsapp"):
            contacts[key] = _unique(contacts[key] + list(candidates.get(key, [])))

    event_ig = _instagram_profile(event.get("instagram") or "")
    page_ig = _instagram_profile(page_url) if "instagram.com" in domain(page_url) else ""

    # Social accounts discovered on event pages remain candidates until identity is confirmed.
    social_candidates = _empty_contacts()
    social_candidates["instagram"] = _unique(([event_ig] if event_ig else []) + ([page_ig] if page_ig else []) + list(candidates.get("instagram", [])))
    social_candidates["telegram"] = list(candidates.get("telegram", []))
    if not name:
        social_candidates["email"] = list(candidates.get("email", []))
        social_candidates["phone"] = list(candidates.get("phone", []))
        social_candidates["whatsapp"] = list(candidates.get("whatsapp", []))
    social_candidates["website"] = list(candidates.get("website", []))

    identity = name
    if not identity and event_ig:
        identity = urlparse(event_ig).path.strip("/")
    if not identity and page_ig:
        identity = urlparse(page_ig).path.strip("/")
    if not identity:
        return None

    named = bool(name)
    verified_channel_count = sum(len(contacts[k]) for k in ("instagram", "telegram", "whatsapp", "email", "phone"))
    confidence = min(0.98, 0.35 + 0.45 * source_weight(source_type) + (0.10 if named else 0) + (0.05 if verified_channel_count else 0))
    organizer_id = stable_id("organizer", identity, event.get("country") or "")

    evidence = []
    for kind, values in contacts.items():
        for value in values:
            evidence.append({
                "field": f"contact.{kind}",
                "value": value,
                "url": page_url,
                "source_type": source_type,
                "observed_at": observed_at,
                "weight": source_weight(source_type),
                "public_contact": True,
                "association": "CONFIRMED_ORGANIZER_CONTACT",
            })
    for kind, values in social_candidates.items():
        for value in values:
            evidence.append({
                "field": f"contact_candidate.{kind}",
                "value": value,
                "url": page_url,
                "source_type": source_type,
                "observed_at": observed_at,
                "weight": source_weight(source_type),
                "public_contact": True,
                "association": "UNCONFIRMED_ORGANIZER_RELATION",
            })
    if name:
        evidence.append({
            "field": "name",
            "value": name,
            "url": page_url,
            "source_type": source_type,
            "observed_at": observed_at,
            "weight": source_weight(source_type),
        })

    contact_status = "READY_TO_CONTACT" if named and verified_channel_count else ("CONTACTS_MISSING" if named else "NEEDS_IDENTITY_CHECK")
    return {
        "schema_version": 2,
        "organizer_id": organizer_id,
        "name": name or identity,
        "aliases": [],
        "country": event.get("country") or "",
        "cities": _unique([event.get("city") or ""]),
        "contacts": contacts,
        "contact_candidates": social_candidates,
        "event_ids": [event.get("candidate_id")] if event.get("candidate_id") else [],
        "source_urls": _unique([page_url]),
        "evidence": evidence,
        "confidence": round(confidence, 2),
        "identity_status": "NAMED" if named else "PROVISIONAL_IDENTITY",
        "contact_status": contact_status,
        "first_seen_at": observed_at,
        "last_seen_at": observed_at,
        "crm_status": "NEW_LEAD",
        "last_contacted_at": "",
        "notes": "",
        "event_snapshot": {
            "candidate_id": event.get("candidate_id"),
            "name": event.get("name"),
            "date": event.get("date"),
            "city": event.get("city"),
            "country": event.get("country"),
            "source_urls": event.get("source_urls", []),
        },
    }


def _contact_values(profile: dict, key: str) -> set[str]:
    return {normalize(x) for x in (profile.get("contacts") or {}).get(key, []) if x}


def organizer_match_score(a: dict, b: dict) -> float:
    for key in ("instagram", "email", "whatsapp", "phone", "telegram"):
        if _contact_values(a, key) & _contact_values(b, key):
            return 1.0
    # Candidate social overlap is useful for identity matching, but not enough to make the
    # candidate a verified organizer contact.
    for key in ("instagram", "telegram"):
        a_vals = {normalize(x) for x in (a.get("contact_candidates") or {}).get(key, []) if x}
        b_vals = {normalize(x) for x in (b.get("contact_candidates") or {}).get(key, []) if x}
        if a_vals & b_vals:
            return 0.93
    name_score = difflib.SequenceMatcher(None, normalize(a.get("name")), normalize(b.get("name"))).ratio()
    same_country = normalize(a.get("country")) == normalize(b.get("country"))
    return round(name_score * (1.0 if same_country else 0.88), 4)


def _merge_channel_dict(a: dict, b: dict) -> dict:
    out = _empty_contacts()
    for key in out:
        out[key] = _unique(list((a or {}).get(key, [])) + list((b or {}).get(key, [])))
    return out


def _merge_profiles(base: dict, incoming: dict) -> dict:
    out = dict(base)
    out["schema_version"] = 2
    if incoming.get("name") and normalize(incoming.get("name")) != normalize(out.get("name")):
        aliases = list(out.get("aliases", []))
        if out.get("name") and out["name"] not in aliases:
            aliases.append(out["name"])
        if incoming["name"] not in aliases:
            aliases.append(incoming["name"])
        if float(incoming.get("confidence", 0)) > float(out.get("confidence", 0)):
            out["name"] = incoming["name"]
        out["aliases"] = aliases

    out["contacts"] = _merge_channel_dict(out.get("contacts") or {}, incoming.get("contacts") or {})
    out["contact_candidates"] = _merge_channel_dict(out.get("contact_candidates") or {}, incoming.get("contact_candidates") or {})
    out["cities"] = _unique(list(out.get("cities", [])) + list(incoming.get("cities", [])))
    out["event_ids"] = _unique(list(out.get("event_ids", [])) + list(incoming.get("event_ids", [])))
    out["source_urls"] = _unique(list(out.get("source_urls", [])) + list(incoming.get("source_urls", [])))
    out["evidence"] = (list(out.get("evidence", [])) + list(incoming.get("evidence", [])))[-250:]
    out["confidence"] = round(max(float(out.get("confidence", 0)), float(incoming.get("confidence", 0))), 2)
    out["last_seen_at"] = incoming.get("last_seen_at") or out.get("last_seen_at")
    out.setdefault("first_seen_at", incoming.get("first_seen_at"))
    out.setdefault("crm_status", "NEW_LEAD")
    out.setdefault("last_contacted_at", "")
    out.setdefault("notes", "")
    if out.get("identity_status") != "NAMED" and incoming.get("identity_status") == "NAMED":
        out["identity_status"] = "NAMED"
    verified_channel_count = sum(len((out.get("contacts") or {}).get(k, [])) for k in ("instagram", "telegram", "whatsapp", "email", "phone"))
    out["contact_status"] = "READY_TO_CONTACT" if out.get("identity_status") == "NAMED" and verified_channel_count else ("CONTACTS_MISSING" if out.get("identity_status") == "NAMED" else "NEEDS_IDENTITY_CHECK")
    out.pop("event_snapshot", None)
    return out


def _minimal_named_lead(event: dict, observed_at: str) -> dict:
    return {
        "schema_version": 2,
        "organizer_id": stable_id("organizer", event.get("organizer"), event.get("country") or ""),
        "name": event.get("organizer"),
        "aliases": [],
        "country": event.get("country") or "",
        "cities": _unique([event.get("city") or ""]),
        "contacts": _empty_contacts(),
        "contact_candidates": {
            "instagram": _unique([_instagram_profile(event.get("instagram") or "")]),
            "telegram": [], "whatsapp": [], "email": [], "phone": [],
            "website": _unique([event.get("official_site") or ""]),
        },
        "event_ids": [event.get("candidate_id")],
        "source_urls": _unique(event.get("source_urls", [])),
        "evidence": [e for e in event.get("evidence", []) if e.get("field") in {"organizer", "instagram"}],
        "confidence": min(0.90, float(event.get("confidence", 0))),
        "identity_status": "NAMED",
        "contact_status": "CONTACTS_MISSING",
        "first_seen_at": observed_at,
        "last_seen_at": observed_at,
        "crm_status": "NEW_LEAD",
        "last_contacted_at": "",
        "notes": "",
        "event_snapshot": {k: event.get(k) for k in ("candidate_id", "name", "date", "city", "country", "source_urls")},
    }


def _preserve_crm_metadata(profile: dict, previous: dict) -> dict:
    profile["first_seen_at"] = previous.get("first_seen_at") or profile.get("first_seen_at")
    profile["crm_status"] = previous.get("crm_status") or profile.get("crm_status") or "NEW_LEAD"
    profile["last_contacted_at"] = previous.get("last_contacted_at") or ""
    profile["notes"] = previous.get("notes") or ""
    profile["aliases"] = _unique(list(previous.get("aliases", [])) + list(profile.get("aliases", [])))
    return profile


def build_organizer_database(events: list[dict], raw_leads: list[dict], previous_rows: list[dict], observed_at: str) -> list[dict]:
    leads = list(raw_leads)

    for event in events:
        if not (event.get("organizer") or "").strip():
            continue
        if any((lead.get("event_snapshot") or {}).get("candidate_id") == event.get("candidate_id") and lead.get("identity_status") == "NAMED" for lead in leads):
            continue
        leads.append(_minimal_named_lead(event, observed_at))

    # Rebind raw leads to final historical candidate IDs after event dedup/update matching.
    for lead in leads:
        snap = lead.get("event_snapshot") or {}
        if not snap:
            continue
        best = None
        best_score = 0.0
        for event in events:
            if snap.get("candidate_id") and snap.get("candidate_id") == event.get("candidate_id"):
                best, best_score = event, 1.0
                break
            score = match_score(snap, event)
            if score > best_score:
                best, best_score = event, score
        if best and best_score >= 0.68:
            lead["event_ids"] = _unique(list(lead.get("event_ids", [])) + [best.get("candidate_id")])
            lead["cities"] = _unique(list(lead.get("cities", [])) + [best.get("city") or ""])

    # Build machine-derived contacts fresh on every run. This deliberately cleans legacy v1
    # false associations (for example sponsor Instagram links) instead of carrying them forward.
    db: list[dict] = []
    for profile in leads:
        profile = dict(profile)
        best_i, best_score = -1, 0.0
        for i, existing in enumerate(db):
            score = organizer_match_score(existing, profile)
            if score > best_score:
                best_i, best_score = i, score
        if best_i >= 0 and best_score >= 0.86:
            db[best_i] = _merge_profiles(db[best_i], profile)
        else:
            profile.pop("event_snapshot", None)
            db.append(profile)

    # Preserve only CRM/user-maintained metadata from the previous database. Contacts are rebuilt
    # from evidence so an old parser mistake cannot become permanent truth.
    unmatched_previous = list(previous_rows)
    for i, profile in enumerate(db):
        best_j, best_score = -1, 0.0
        for j, previous in enumerate(unmatched_previous):
            score = organizer_match_score(previous, profile)
            if score > best_score:
                best_j, best_score = j, score
        if best_j >= 0 and best_score >= 0.86:
            db[i] = _preserve_crm_metadata(profile, unmatched_previous.pop(best_j))

    # Keep unmatched historical named organizers as research records, but never trust legacy v1
    # contact associations. They remain useful for deduplication and future re-discovery.
    for previous in unmatched_previous:
        if not previous.get("name"):
            continue
        historical = {
            "schema_version": 2,
            "organizer_id": previous.get("organizer_id") or stable_id("organizer", previous.get("name"), previous.get("country") or ""),
            "name": previous.get("name"),
            "aliases": previous.get("aliases", []),
            "country": previous.get("country") or "",
            "cities": previous.get("cities", []),
            "contacts": previous.get("contacts", {}) if previous.get("schema_version") == 2 else _empty_contacts(),
            "contact_candidates": previous.get("contact_candidates", {}) if previous.get("schema_version") == 2 else _empty_contacts(),
            "event_ids": previous.get("event_ids", []),
            "source_urls": previous.get("source_urls", []),
            "evidence": previous.get("evidence", []) if previous.get("schema_version") == 2 else [],
            "confidence": previous.get("confidence", 0.5),
            "identity_status": previous.get("identity_status") or "NAMED",
            "contact_status": previous.get("contact_status") if previous.get("schema_version") == 2 else "CONTACTS_MISSING",
            "first_seen_at": previous.get("first_seen_at") or observed_at,
            "last_seen_at": previous.get("last_seen_at") or observed_at,
            "crm_status": previous.get("crm_status") or "NEW_LEAD",
            "last_contacted_at": previous.get("last_contacted_at") or "",
            "notes": previous.get("notes") or "",
        }
        db.append(historical)

    for event in events:
        matches = [p for p in db if event.get("candidate_id") in p.get("event_ids", [])]
        if not matches:
            event["organizer_id"] = ""
            event["organizer_contact_status"] = "NOT_FOUND"
            continue
        matches.sort(key=lambda p: (p.get("identity_status") == "NAMED", p.get("contact_status") == "READY_TO_CONTACT", float(p.get("confidence", 0))), reverse=True)
        chosen = matches[0]
        event["organizer_id"] = chosen.get("organizer_id") or ""
        event["organizer_contact_status"] = chosen.get("contact_status") or "CONTACTS_MISSING"
        if not event.get("organizer") and chosen.get("identity_status") == "NAMED":
            event["organizer"] = chosen.get("name") or ""

    db.sort(key=lambda p: (normalize(p.get("country")), normalize(p.get("name"))))
    return db


def build_organizer_research_queue(events: list[dict], organizers: list[dict], run_id: str, observed_at: str) -> list[dict]:
    by_id = {p.get("organizer_id"): p for p in organizers if p.get("organizer_id")}
    queue = []
    for event in events:
        organizer = by_id.get(event.get("organizer_id"))
        if not organizer:
            reason = "ORGANIZER_IDENTITY_MISSING"
            org_name = ""
        elif organizer.get("identity_status") != "NAMED":
            reason = "ORGANIZER_IDENTITY_AMBIGUOUS"
            org_name = organizer.get("name") or ""
        elif organizer.get("contact_status") != "READY_TO_CONTACT":
            reason = "ORGANIZER_CONTACTS_MISSING"
            org_name = organizer.get("name") or ""
        else:
            continue

        event_name = event.get("name") or ""
        country = event.get("country") or ""
        city = event.get("city") or ""
        queries = [
            f'"{event_name}" организатор Instagram {country}',
            f'"{event_name}" контакты организатора {city} {country}',
            f'site:instagram.com "{event_name}" {city}',
            f'site:t.me "{event_name}" {city}',
        ]
        if org_name:
            queries.extend([
                f'"{org_name}" Instagram {country}',
                f'"{org_name}" контакты {country}',
            ])
        queue.append({
            "task_id": f"{run_id}:{event.get('candidate_id')}:ORGANIZER_RESEARCH",
            "candidate_id": event.get("candidate_id"),
            "organizer_id": event.get("organizer_id") or "",
            "reason": reason,
            "status": "PENDING_DISCOVERY",
            "created_at": observed_at,
            "search_queries": list(dict.fromkeys(q for q in queries if q.strip())),
        })
    return queue


def outreach_ready(organizers: list[dict]) -> list[dict]:
    return [p for p in organizers if p.get("identity_status") == "NAMED" and p.get("contact_status") == "READY_TO_CONTACT"]
