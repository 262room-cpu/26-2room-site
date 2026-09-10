from __future__ import annotations

from .core import stable_id


def _unique(values):
    return list(dict.fromkeys(v for v in values if v))


def unresolved_organizer_id(event: dict) -> str:
    event_key = event.get("candidate_id") or stable_id(
        event.get("name") or "", event.get("date") or "", event.get("city") or "", event.get("country") or ""
    )
    return stable_id("organizer-unresolved", event_key, event.get("country") or "")


def _merge_channels(module, rows: list[dict], field: str) -> dict:
    merged = module._empty_contacts()
    for row in rows:
        for kind, values in (row.get(field) or {}).items():
            if kind in merged:
                merged[kind] = _unique(merged[kind] + list(values or []))
    return merged


def _sanitize_named_socials(module, lead: dict, raw_html: str, source_type: str) -> None:
    """Do not trust every social logo on a primary page as the organizer account."""
    contacts = lead.setdefault("contacts", module._empty_contacts())
    candidates = lead.setdefault("contact_candidates", module._empty_contacts())
    structured_name, structured_url = module._jsonld_organizer(raw_html)

    # Keep all page social links as hypotheses, but only a structured organizer URL may become a
    # confirmed social contact at extraction time. Search corroboration can later promote a social
    # candidate from an organizer-owned page.
    for kind in ("instagram", "telegram"):
        candidates[kind] = _unique(list(candidates.get(kind, [])) + list(contacts.get(kind, [])))
        contacts[kind] = []

    if structured_name and structured_url:
        ig = module._instagram_profile(structured_url)
        tg = module._telegram_profile(structured_url)
        if ig:
            contacts["instagram"] = [ig]
            candidates["instagram"] = _unique(candidates["instagram"] + [ig])
        if tg:
            contacts["telegram"] = [tg]
            candidates["telegram"] = _unique(candidates["telegram"] + [tg])

    # Rewrite social evidence so downstream promotion can distinguish explicit structured ties
    # from arbitrary sponsor/partner links.
    for row in lead.get("evidence", []):
        field = str(row.get("field") or "")
        if field in {"contact.instagram", "contact.telegram"}:
            value = str(row.get("value") or "")
            is_structured = bool(structured_url and value == structured_url)
            if is_structured:
                row["association"] = "STRUCTURED_ORGANIZER_URL"
            else:
                row["field"] = field.replace("contact.", "contact_candidate.")
                row["association"] = "UNCONFIRMED_ORGANIZER_RELATION"


def install(organizers_module) -> None:
    """Install conservative identity guards over the v2 organizer extractor."""
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
            _sanitize_named_socials(organizers_module, lead, raw_html, source_type)
            return lead

        lead["schema_version"] = 3
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
        safe_unresolved_previous = [
            row for row in previous_rows
            if int(row.get("schema_version", 0) or 0) >= 3 and row.get("identity_status") == "UNRESOLVED"
        ]
        clean_previous = [
            row for row in previous_rows
            if row.get("identity_status") not in {"PROVISIONAL_IDENTITY", "UNRESOLVED"}
        ]
        db = original_build(events, raw_leads, clean_previous, observed_at)

        named = [p for p in db if p.get("identity_status") == "NAMED" and (p.get("name") or "").strip()]
        named_event_ids = {eid for p in named for eid in p.get("event_ids", []) if eid}

        previous_by_event: dict[str, list[dict]] = {}
        for row in safe_unresolved_previous:
            for eid in row.get("event_ids", []):
                if eid:
                    previous_by_event.setdefault(eid, []).append(row)

        for profile in named:
            history = []
            for eid in profile.get("event_ids", []):
                history.extend(previous_by_event.get(eid, []))
            if history:
                earliest = sorted((r.get("first_seen_at") for r in history if r.get("first_seen_at")))[0:1]
                if earliest:
                    profile["first_seen_at"] = earliest[0]
                for key in ("last_contacted_at", "notes"):
                    values = [r.get(key) for r in history if r.get(key)]
                    if values and not profile.get(key):
                        profile[key] = values[-1]
                crm_values = [r.get("crm_status") for r in history if r.get("crm_status") and r.get("crm_status") != "NEW_LEAD"]
                if crm_values:
                    profile["crm_status"] = crm_values[-1]

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
                continue

            current_rows = raw_by_event.get(eid, [])
            historical_rows = previous_by_event.get(eid, [])
            candidates = _merge_channels(organizers_module, historical_rows + current_rows, "contact_candidates")
            contacts = _merge_channels(organizers_module, historical_rows, "contacts")
            evidence = []
            for row in historical_rows + current_rows:
                evidence.extend(row.get("evidence", []))

            has_route = any(contacts.get(k) for k in ("instagram", "telegram", "whatsapp", "email", "phone"))
            previous_first_seen = [r.get("first_seen_at") for r in historical_rows if r.get("first_seen_at")]
            previous_last_contacted = [r.get("last_contacted_at") for r in historical_rows if r.get("last_contacted_at")]
            previous_notes = [r.get("notes") for r in historical_rows if r.get("notes")]
            previous_crm = [r.get("crm_status") for r in historical_rows if r.get("crm_status") and r.get("crm_status") != "NEW_LEAD"]

            profile = {
                "schema_version": 3,
                "organizer_id": unresolved_organizer_id(event),
                "name": "",
                "display_name": f"Неустановленный организатор — {event.get('name') or 'старт'}",
                "aliases": [],
                "country": event.get("country") or "",
                "cities": _unique([event.get("city") or ""]),
                "contacts": contacts,
                "contact_candidates": candidates,
                "event_ids": _unique([eid]),
                "source_urls": _unique(event.get("source_urls", [])),
                "evidence": evidence[-250:],
                "confidence": min(float(event.get("confidence", 0) or 0), 0.55),
                "identity_status": "UNRESOLVED",
                "identity_source": "EVENT_SCOPED_UNKNOWN",
                "contact_status": "CONTACT_ROUTE_FOUND_IDENTITY_PENDING" if has_route else "NEEDS_IDENTITY_CHECK",
                "first_seen_at": min(previous_first_seen) if previous_first_seen else observed_at,
                "last_seen_at": observed_at,
                "crm_status": previous_crm[-1] if previous_crm else "NEW_LEAD",
                "last_contacted_at": previous_last_contacted[-1] if previous_last_contacted else "",
                "notes": previous_notes[-1] if previous_notes else "",
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
