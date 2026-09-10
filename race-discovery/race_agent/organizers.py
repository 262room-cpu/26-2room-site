from __future__ import annotations

import difflib
import html
import re
from urllib.parse import parse_qs, urlparse

from .core import domain, extract_jsonld_events, match_score, normalize, source_weight, stable_id

SOCIAL_PATH_BLOCKLIST = {"p", "reel", "reels", "stories", "explore", "tv", "accounts"}


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


def extract_public_contacts(raw_html: str, page_url: str = "") -> dict:
    """Extract only contact channels explicitly published on the page.

    We intentionally do not infer private phone numbers or enrich people from unrelated data.
    Plain-text e-mail is accepted because publishing an e-mail address on an event page is an
    explicit public contact signal. Phones are accepted only from tel:/WhatsApp links to reduce
    accidental capture of dates, IDs and prices.
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
            addr = href[7:].split("?", 1)[0].strip()
            if re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", addr):
                emails.append(addr.lower())
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

    visible_email_candidates = re.findall(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", raw_html, flags=re.I)
    emails.extend(x.lower() for x in visible_email_candidates)

    websites: list[str] = []
    if page_url.startswith("http") and domain(page_url) not in {"instagram.com", "t.me", "telegram.me"}:
        websites.append(page_url)

    return {
        "instagram": _unique(instagram),
        "telegram": _unique(telegram),
        "whatsapp": _unique(whatsapp),
        "email": _unique(emails),
        "phone": _unique(phones),
        "website": _unique(websites),
    }


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


def organizer_lead_from_document(event: dict, raw_html: str, page_url: str, source_type: str, observed_at: str) -> dict | None:
    contacts = extract_public_contacts(raw_html, page_url)
    structured_name, structured_url = _jsonld_organizer(raw_html)
    name = (structured_name or event.get("organizer") or "").strip()

    if structured_url.startswith("http"):
        contacts["website"] = _unique(contacts["website"] + [structured_url])
    event_ig = event.get("instagram") or ""
    if event_ig:
        ig = _instagram_profile(event_ig)
        if ig:
            contacts["instagram"] = _unique(contacts["instagram"] + [ig])
    if "instagram.com" in domain(page_url):
        ig = _instagram_profile(page_url)
        if ig:
            contacts["instagram"] = _unique(contacts["instagram"] + [ig])

    identity = name
    if not identity and contacts["instagram"]:
        identity = urlparse(contacts["instagram"][0]).path.strip("/")
    if not identity and contacts["email"]:
        identity = contacts["email"][0]
    if not identity:
        return None

    named = bool(name)
    contact_count = sum(len(contacts[k]) for k in ("instagram", "telegram", "whatsapp", "email", "phone"))
    confidence = min(0.98, 0.35 + 0.45 * source_weight(source_type) + (0.10 if named else 0) + (0.05 if contact_count else 0))
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

    return {
        "organizer_id": organizer_id,
        "name": name or identity,
        "aliases": [],
        "country": event.get("country") or "",
        "cities": _unique([event.get("city") or ""]),
        "contacts": contacts,
        "event_ids": [event.get("candidate_id")] if event.get("candidate_id") else [],
        "source_urls": _unique([page_url]),
        "evidence": evidence,
        "confidence": round(confidence, 2),
        "identity_status": "NAMED" if named else "PROVISIONAL_IDENTITY",
        "contact_status": "READY_TO_CONTACT" if contact_count else "CONTACTS_MISSING",
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
    website_a = {domain(x) for x in (a.get("contacts") or {}).get("website", []) if x}
    website_b = {domain(x) for x in (b.get("contacts") or {}).get("website", []) if x}
    if website_a & website_b:
        return 0.94
    name_score = difflib.SequenceMatcher(None, normalize(a.get("name")), normalize(b.get("name"))).ratio()
    same_country = normalize(a.get("country")) == normalize(b.get("country"))
    return round(name_score * (1.0 if same_country else 0.88), 4)


def _merge_profiles(base: dict, incoming: dict) -> dict:
    out = dict(base)
    if incoming.get("name") and normalize(incoming.get("name")) != normalize(out.get("name")):
        aliases = list(out.get("aliases", []))
        if out.get("name") and out["name"] not in aliases:
            aliases.append(out["name"])
        if incoming["name"] not in aliases:
            aliases.append(incoming["name"])
        if float(incoming.get("confidence", 0)) > float(out.get("confidence", 0)):
            out["name"] = incoming["name"]
        out["aliases"] = aliases

    contacts = dict(out.get("contacts") or {})
    for key in ("instagram", "telegram", "whatsapp", "email", "phone", "website"):
        contacts[key] = _unique(list(contacts.get(key, [])) + list((incoming.get("contacts") or {}).get(key, [])))
    out["contacts"] = contacts
    out["cities"] = _unique(list(out.get("cities", [])) + list(incoming.get("cities", [])))
    out["event_ids"] = _unique(list(out.get("event_ids", [])) + list(incoming.get("event_ids", [])))
    out["source_urls"] = _unique(list(out.get("source_urls", [])) + list(incoming.get("source_urls", [])))
    out["evidence"] = (list(out.get("evidence", [])) + list(incoming.get("evidence", [])))[-200:]
    out["confidence"] = round(max(float(out.get("confidence", 0)), float(incoming.get("confidence", 0))), 2)
    out["last_seen_at"] = incoming.get("last_seen_at") or out.get("last_seen_at")
    out.setdefault("first_seen_at", incoming.get("first_seen_at"))
    out.setdefault("crm_status", "NEW_LEAD")
    out.setdefault("last_contacted_at", "")
    out.setdefault("notes", "")
    if out.get("identity_status") != "NAMED" and incoming.get("identity_status") == "NAMED":
        out["identity_status"] = "NAMED"
    channel_count = sum(len(contacts.get(k, [])) for k in ("instagram", "telegram", "whatsapp", "email", "phone"))
    out["contact_status"] = "READY_TO_CONTACT" if channel_count else "CONTACTS_MISSING"
    out.pop("event_snapshot", None)
    return out


def build_organizer_database(events: list[dict], raw_leads: list[dict], previous_rows: list[dict], observed_at: str) -> list[dict]:
    leads = list(raw_leads)

    # Ensure a named organizer discovered in an event is never lost merely because the page had no contact links.
    for event in events:
        if not (event.get("organizer") or "").strip():
            continue
        if any((lead.get("event_snapshot") or {}).get("candidate_id") == event.get("candidate_id") for lead in leads):
            continue
        leads.append({
            "organizer_id": stable_id("organizer", event.get("organizer"), event.get("country") or ""),
            "name": event.get("organizer"),
            "aliases": [],
            "country": event.get("country") or "",
            "cities": _unique([event.get("city") or ""]),
            "contacts": {"instagram": _unique([event.get("instagram") or ""]), "telegram": [], "whatsapp": [], "email": [], "phone": [], "website": _unique([event.get("official_site") or ""])},
            "event_ids": [event.get("candidate_id")],
            "source_urls": _unique(event.get("source_urls", [])),
            "evidence": [e for e in event.get("evidence", []) if e.get("field") in {"organizer", "instagram"}],
            "confidence": min(0.90, float(event.get("confidence", 0))),
            "identity_status": "NAMED",
            "contact_status": "READY_TO_CONTACT" if event.get("instagram") else "CONTACTS_MISSING",
            "first_seen_at": observed_at,
            "last_seen_at": observed_at,
            "crm_status": "NEW_LEAD",
            "last_contacted_at": "",
            "notes": "",
            "event_snapshot": {k: event.get(k) for k in ("candidate_id", "name", "date", "city", "country", "source_urls")},
        })

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

    db = [dict(x) for x in previous_rows]
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

    for event in events:
        matches = [p for p in db if event.get("candidate_id") in p.get("event_ids", [])]
        if not matches:
            event["organizer_id"] = ""
            event["organizer_contact_status"] = "NOT_FOUND"
            continue
        matches.sort(key=lambda p: (p.get("identity_status") == "NAMED", float(p.get("confidence", 0))), reverse=True)
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
