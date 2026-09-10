from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "runtime"
GLOBAL = RUNTIME / "global"
MARKETS = RUNTIME / "markets"


def _read_json(path: pathlib.Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


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


def _write_json(path: pathlib.Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _event_card(row: dict) -> dict:
    return {
        "candidate_id": row.get("candidate_id", ""),
        "name": row.get("name", ""),
        "date": row.get("date", ""),
        "city": row.get("city", ""),
        "country": row.get("country", ""),
        "market_code": row.get("market_code", ""),
        "status": row.get("status", ""),
        "confidence": row.get("confidence", 0),
        "catalog_relation": row.get("catalog_relation", ""),
        "app_match_id": row.get("app_match_id", ""),
        "app_diffs": row.get("app_diffs", []),
        "organizer": row.get("organizer", ""),
        "organizer_id": row.get("organizer_id", ""),
        "organizer_contact_status": row.get("organizer_contact_status", ""),
        "source_urls": row.get("source_urls", [])[:5],
        "last_checked_at": row.get("last_checked_at", ""),
    }


def _organizer_card(row: dict) -> dict:
    contacts = row.get("contacts") or {}
    candidates = row.get("contact_candidates") or {}
    return {
        "global_organizer_id": row.get("global_organizer_id", ""),
        "organizer_id": row.get("organizer_id", ""),
        "name": row.get("name", ""),
        "display_name": row.get("display_name", ""),
        "identity_status": row.get("identity_status", ""),
        "contact_status": row.get("contact_status", ""),
        "countries": row.get("countries", []) or [row.get("country", "")],
        "cities": row.get("cities", []),
        "contacts": {k: list(contacts.get(k, []))[:5] for k in ("instagram", "telegram", "whatsapp", "email", "phone", "website")},
        "contact_candidates": {k: list(candidates.get(k, []))[:5] for k in ("instagram", "telegram", "whatsapp", "email", "phone", "website")},
        "event_ids": row.get("event_ids", [])[:20],
        "crm_status": row.get("crm_status", "NEW_LEAD"),
        "last_contacted_at": row.get("last_contacted_at", ""),
        "source_urls": row.get("source_urls", [])[:5],
    }


def build_action_report(max_items: int = 50) -> dict:
    generated_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    events = _read_jsonl(GLOBAL / "candidates.jsonl")
    organizers = _read_jsonl(GLOBAL / "organizers.jsonl")
    summary = _read_json(GLOBAL / "SUMMARY.json", {})

    relations = Counter(e.get("catalog_relation") or "UNKNOWN" for e in events)
    statuses = Counter(e.get("status") or "UNKNOWN" for e in events)
    identity_statuses = Counter(o.get("identity_status") or "UNKNOWN" for o in organizers)
    contact_statuses = Counter(o.get("contact_status") or "UNKNOWN" for o in organizers)

    catalog_connected_events = sum(v for k, v in relations.items() if k not in {"CATALOG_NOT_CONNECTED", "UNKNOWN", ""})
    catalog_connected = catalog_connected_events > 0

    not_in_app = [e for e in events if e.get("catalog_relation") == "NOT_IN_APP"]
    changed = [e for e in events if e.get("catalog_relation") == "IN_APP_CHANGED"]
    possible_matches = [e for e in events if e.get("catalog_relation") == "POSSIBLE_APP_MATCH"]
    conflicts = [e for e in events if e.get("status") in {"CONFLICT", "NEEDS_REVIEW"} or e.get("conflicts")]
    notices = [e for e in events if e.get("status") in {"CANCELLED", "POSTPONED"}]
    outreach = [
        o for o in organizers
        if o.get("identity_status") == "NAMED" and o.get("contact_status") == "READY_TO_CONTACT"
    ]
    unknown_with_route = [
        o for o in organizers
        if o.get("identity_status") != "NAMED" and o.get("contact_status") == "CONTACT_ROUTE_FOUND_IDENTITY_PENDING"
    ]
    identity_missing = [o for o in organizers if o.get("identity_status") != "NAMED"]

    market_activity = {}
    for code, market in (summary.get("markets") or {}).items():
        research = _read_json(MARKETS / code / "ORGANIZER_RESEARCH_STATE.json", {})
        market_activity[code] = {
            **market,
            "organizer_research": research,
        }

    return {
        "schema_version": 1,
        "generated_at": generated_at,
        "catalog_connected": catalog_connected,
        "catalog_note": "READ_ONLY_COMPARISON_ACTIVE" if catalog_connected else "APP_CATALOG_NOT_CONNECTED_YET",
        "counts": {
            "events_total": len(events),
            "event_statuses": dict(statuses),
            "catalog_relations": dict(relations),
            "events_not_in_app": len(not_in_app) if catalog_connected else None,
            "events_changed_in_app": len(changed) if catalog_connected else None,
            "possible_app_matches": len(possible_matches) if catalog_connected else None,
            "conflicts_or_review": len(conflicts),
            "cancelled_or_postponed": len(notices),
            "organizers_total": len(organizers),
            "organizer_identity_statuses": dict(identity_statuses),
            "organizer_contact_statuses": dict(contact_statuses),
            "outreach_ready": len(outreach),
            "unknown_organizers_with_contact_route": len(unknown_with_route),
        },
        "queues": {
            "new_events_not_in_app": [_event_card(e) for e in not_in_app[:max_items]] if catalog_connected else [],
            "app_changes": [_event_card(e) for e in changed[:max_items]] if catalog_connected else [],
            "possible_app_matches": [_event_card(e) for e in possible_matches[:max_items]] if catalog_connected else [],
            "conflicts_and_review": [_event_card(e) for e in conflicts[:max_items]],
            "cancelled_and_postponed": [_event_card(e) for e in notices[:max_items]],
            "organizers_ready_to_contact": [_organizer_card(o) for o in outreach[:max_items]],
            "organizer_identity_research": [_organizer_card(o) for o in identity_missing[:max_items]],
            "contact_route_identity_pending": [_organizer_card(o) for o in unknown_with_route[:max_items]],
        },
        "market_activity": market_activity,
    }


def _label_event(row: dict) -> str:
    place = ", ".join(x for x in (row.get("city"), row.get("country")) if x)
    date = row.get("date") or "дата уточняется"
    return f"{row.get('name') or 'Без названия'} — {date}" + (f" — {place}" if place else "")


def _label_organizer(row: dict) -> str:
    name = row.get("name") or row.get("display_name") or "Организатор не установлен"
    contacts = row.get("contacts") or {}
    route = ""
    for key in ("instagram", "telegram", "whatsapp", "email", "phone"):
        if contacts.get(key):
            route = contacts[key][0]
            break
    return f"{name}" + (f" — {route}" if route else "")


def render_markdown(report: dict) -> str:
    c = report["counts"]
    lines = [
        "# 26.2 ROOM — Race Discovery Action Report",
        "",
        f"Generated: {report['generated_at']}",
        "",
        "## Сводка",
        "",
        f"- Событий в исследовательской базе: **{c['events_total']}**",
        f"- Организаторов: **{c['organizers_total']}**",
        f"- Готовы для связи: **{c['outreach_ready']}**",
        f"- Неустановленный организатор, но найден канал связи: **{c['unknown_organizers_with_contact_route']}**",
        f"- Конфликты / требуют проверки: **{c['conflicts_or_review']}**",
    ]
    if report["catalog_connected"]:
        lines.extend([
            f"- Новые относительно приложения: **{c['events_not_in_app']}**",
            f"- Изменились относительно приложения: **{c['events_changed_in_app']}**",
            f"- Возможные совпадения: **{c['possible_app_matches']}**",
        ])
    else:
        lines.append("- ⚠️ Каталог мобильного 26.2 ROOM ещё не подключён; считать события `новыми для приложения` пока нельзя.")

    sections = [
        ("Новые старты для приложения", "new_events_not_in_app", _label_event),
        ("Изменения существующих стартов", "app_changes", _label_event),
        ("Конфликты и ручная проверка", "conflicts_and_review", _label_event),
        ("Организаторы — можно писать", "organizers_ready_to_contact", _label_organizer),
        ("Организаторы — нужно установить личность", "organizer_identity_research", _label_organizer),
    ]
    for title, key, formatter in sections:
        rows = report["queues"].get(key, [])
        if not rows:
            continue
        lines.extend(["", f"## {title}", ""])
        for row in rows[:25]:
            lines.append(f"- {formatter(row)}")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-items", type=int, default=50)
    args = parser.parse_args()
    report = build_action_report(args.max_items)
    _write_json(GLOBAL / "ACTION_REPORT.json", report)
    (GLOBAL / "ACTION_REPORT.md").write_text(render_markdown(report), encoding="utf-8")
    print(json.dumps(report["counts"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
