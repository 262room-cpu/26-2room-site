from __future__ import annotations

from .core import stable_id


def _unique(values):
    return list(dict.fromkeys(v for v in values if v))


def unresolved_organizer_id(event: dict) -> str:
    event_key = event.get("candidate_id") or stable_id(
        event.get("name") or "",
        event.get("date") or "",
        event.get("city") or "",
        event.get("country") or "",
    )
    return stable_id("organizer-unresolved", event_key, event.get("country") or "")


def install(organizers_module) -> None:
    """Install conservative identity guards over the v2 organizer extractor.

    Rules:
    - an arbitrary Instagram/Telegram handle never becomes an organizer identity;
    - unresolved organizers are scoped to one event until explicit identity evidence exists;
    - unresolved profiles from different events never deduplicate just because pages contain the
      same sponsor/partner/social account;
    - old PROVISIONAL_IDENTITY rows are not carried forward as named organizer truth.
    """
    if getattr(organizers_module, "_identity_guard_installed", False):
        return

    original_lead = organizers_module.organizer_lead_from_document
    original_match = organizers_module.organizer_match_score
    original_build = organizers_module.build_organizer_database

    def guarded_lead(event: dict, raw_html: str, page_url: str, source_type: str, observed_at: str):
        lead = original_lead(event, raw_html, page_url, source_type, observed_at)
        if lead is None:
            return None
        if lead.get("identity_status") == "NAMED" and (lead.get("name") or "").strip():
            return lead

        # Keep every public contact/social URL only as a research candidate. The organizer itself
        # remains unknown and is keyed by event, never by the first social handle on a page.
        lead["organizer_id"] = unresolved_organizer_id(event)
        lead["name"] = ""
        lead["display_name"] = f"Неустановленный организатор — {event.get('name') or 'старт'}"
        lead["aliases"] = []
        lead["contacts"] = organizers_module._empty_contacts()
        lead["identity_status"] = "UNRESOLVED"
        lead["identity_source"] = "EVENT_SCOPED_UNKNOWN"
        lead["contact_status"] = "NEEDS_IDENTITY_CHECK"
        lead["confidence"] = min(float(lead.get("confidence", 0) or 0), 0.55)
        lead["event_ids"] = _unique([event.get("candidate_id")])
        return lead

    def guarded_match(a: dict, b: dict) -> float:
        a_status = a.get("identity_status")
        b_status = b.get("identity_status")
        unresolved = {"UNRESOLVED", "PROVISIONAL_IDENTITY", "NEEDS_IDENTITY_CHECK"}
        if a.get("organizer_id") and a.get("organizer_id") == b.get("organizer_id"):
            return 1.0
        if a_status in unresolved or b_status in unresolved or not (a.get("name") or "").strip() or not (b.get("name") or "").strip():
            shared_events = set(a.get("event_ids", [])) & set(b.get("event_ids", []))
            return 0.97 if shared_events else 0.0
        return original_match(a, b)

    def guarded_build(events: list[dict], raw_leads: list[dict], previous_rows: list[dict], observed_at: str) -> list[dict]:
        # Do not let legacy social-handle identities survive as if they were organizer names.
        clean_previous = [
            row for row in previous_rows
            if row.get("identity_status") not in {"PROVISIONAL_IDENTITY", "UNRESOLVED"}
        ]
        db = original_build(events, raw_leads, clean_previous, observed_at)

        # Remove any non-named rows emitted by legacy logic, then create one explicit unknown
        # organizer record per still-unresolved event. Candidate contacts are preserved only as
        # hypotheses for the research worker.
        named = [p for p in db if p.get("identity_status") == "NAMED" and (p.get("name") or "").strip()]
        named_event_ids = {eid for p in named for eid in p.get("event_ids", []) if eid}

        raw_by_event: dict[str, list[dict]] = {}
        for lead in raw_leads:
            for eid in lead.get("event_ids", []):
                if eid:
                    raw_by_event.setdefault(eid, []).append(lead)

        out = list(named)
        for event in events:
            eid = event.get("candidate_id")
            if eid in named_event_ids:
                continue
            if (event.get("organizer") or "").strip():
                # original_build normally creates a named minimal lead for this case; if it did
                # not, leave the event unlinked rather than inventing an identity.
                continue

            candidates = organizers_module._empty_contacts()
            evidence = []
            for lead in raw_by_event.get(eid, []):
                for kind, values in (lead.get("contact_candidates") or {}).items():
                    if kind in candidates:
                        candidates[kind] = _unique(candidates[kind] + list(values or []))
                evidence.extend(lead.get("evidence", []))

            profile = {
                "schema_version": 3,
                "organizer_id": unresolved_organizer_id(event),
                "name": "",
                "display_name": f"Неустановленный организатор — {event.get('name') or 'старт'}",
                "aliases": [],
                "country": event.get("country") or "",
                "cities": _unique([event.get("city") or ""]),
                "contacts": organizers_module._empty_contacts(),
                "contact_candidates": candidates,
                "event_ids": _unique([eid]),
                "source_urls": _unique(event.get("source_urls", [])),
                "evidence": evidence[-250:],
                "confidence": min(float(event.get("confidence", 0) or 0), 0.55),
                "identity_status": "UNRESOLVED",
                "identity_source": "EVENT_SCOPED_UNKNOWN",
                "contact_status": "NEEDS_IDENTITY_CHECK",
                "first_seen_at": observed_at,
                "last_seen_at": observed_at,
                "crm_status": "NEW_LEAD",
                "last_contacted_at": "",
                "notes": "",
            }
            out.append(profile)
            event["organizer_id"] = profile["organizer_id"]
            event["organizer_contact_status"] = profile["contact_status"]

        out.sort(key=lambda p: ((p.get("country") or "").casefold(), (p.get("name") or p.get("display_name") or "").casefold()))
        return out

    organizers_module.organizer_lead_from_document = guarded_lead
    organizers_module.organizer_match_score = guarded_match
    organizers_module.build_organizer_database = guarded_build
    organizers_module._identity_guard_installed = True
