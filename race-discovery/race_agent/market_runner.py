from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
from typing import Any

from .core import domain, stable_id
from .market_config import enabled_markets, load_market_config
from .organizers import organizer_match_score

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config"
RUNTIME = ROOT / "runtime"
MARKET_ROOT = RUNTIME / "markets"
GLOBAL_ROOT = RUNTIME / "global"

STATE_FILES = [
    "STATE.json", "candidates.jsonl", "organizers.jsonl", "watchlist.json",
    "model_queue.jsonl", "runs.jsonl", "signals.jsonl", "discovery_list.jsonl",
    "already_in_app.jsonl", "organizer_outreach_ready.jsonl",
    "organizer_research_queue.jsonl", "organizer_new_leads.jsonl", "quarantine.jsonl",
    "hubs.jsonl", "organizer_research_evidence.jsonl", "ORGANIZER_RESEARCH_STATE.json",
]


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
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def _write_json(path: pathlib.Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _write_jsonl(path: pathlib.Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")


def _copy_legacy_kz_state(target: pathlib.Path) -> None:
    if (target / "candidates.jsonl").exists():
        return
    target.mkdir(parents=True, exist_ok=True)
    for name in STATE_FILES:
        src = RUNTIME / name
        if src.exists() and src.is_file():
            shutil.copy2(src, target / name)


def _prepare_sandbox(code: str, cfg: dict, sandbox: pathlib.Path) -> None:
    shutil.copytree(ROOT / "race_agent", sandbox / "race_agent")
    (sandbox / "config").mkdir(parents=True, exist_ok=True)
    _write_json(sandbox / "config" / f"{code}.json", cfg)
    target_state = MARKET_ROOT / code
    if code == "kz":
        _copy_legacy_kz_state(target_state)
    if target_state.exists():
        shutil.copytree(target_state, sandbox / "runtime", dirs_exist_ok=True)
    else:
        (sandbox / "runtime").mkdir(parents=True, exist_ok=True)


def run_market(code: str, cfg: dict) -> dict:
    started = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    with tempfile.TemporaryDirectory(prefix=f"262room-{code}-") as td:
        sandbox = pathlib.Path(td)
        _prepare_sandbox(code, cfg, sandbox)
        env = os.environ.copy()
        env["PYTHONPATH"] = str(sandbox)
        env["RACE_NEWS_GL"] = str(cfg.get("news_gl") or "KZ")
        env["RACE_NEWS_LANGUAGE"] = str(cfg.get("news_language") or "ru")
        env["RACE_NEWS_CEID"] = str(cfg.get("news_ceid") or f"{env['RACE_NEWS_GL']}:{env['RACE_NEWS_LANGUAGE']}")
        env.setdefault("MAX_QUERIES", os.environ.get("MARKET_MAX_QUERIES", "16"))
        env.setdefault("RESULTS_PER_QUERY", os.environ.get("MARKET_RESULTS_PER_QUERY", "7"))
        env.setdefault("MAX_URLS", os.environ.get("MARKET_MAX_URLS", "45"))

        proc = subprocess.run(
            [sys.executable, "-m", "race_agent.cli", "run", "--country", code],
            cwd=sandbox,
            env=env,
            text=True,
            capture_output=True,
            timeout=int(os.environ.get("MARKET_TIMEOUT_SECONDS", "420")),
        )
        target = MARKET_ROOT / code
        target.mkdir(parents=True, exist_ok=True)
        if (sandbox / "runtime").exists():
            shutil.copytree(sandbox / "runtime", target, dirs_exist_ok=True)
        state = _read_json(target / "STATE.json", {})
        return {
            "market_code": code,
            "country": cfg.get("country"),
            "started_at": started,
            "finished_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "returncode": proc.returncode,
            "status": state.get("status", "FAILED" if proc.returncode else "UNKNOWN"),
            "summary": state.get("last_summary", {}),
            "stdout_tail": proc.stdout[-2000:],
            "stderr_tail": proc.stderr[-2000:],
        }


def choose_markets(limit: int) -> list[str]:
    enabled = enabled_markets(CONFIG)
    codes = [code for code, _ in enabled]
    if limit <= 0 or limit >= len(codes):
        return codes

    schedule = _read_json(GLOBAL_ROOT / "market_schedule.json", {"last_success": {}})
    last = schedule.get("last_success", {})
    forced = [code for code in ("kz", "ru") if code in codes]
    remaining = [item for item in enabled if item[0] not in forced]
    remaining.sort(key=lambda item: (last.get(item[0], ""), -int(item[1].get("priority", 0)), item[0]))
    slots = max(0, limit - len(forced))
    return forced + [code for code, _ in remaining[:slots]]


def _unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(v for v in values if v))


def _merge_global_organizer(base: dict, incoming: dict) -> dict:
    out = dict(base)
    out["markets"] = _unique(list(out.get("markets", [])) + list(incoming.get("markets", [])))
    out["countries"] = _unique(list(out.get("countries", [])) + [out.get("country", ""), incoming.get("country", "")])
    out["cities"] = _unique(list(out.get("cities", [])) + list(incoming.get("cities", [])))
    out["event_ids"] = _unique(list(out.get("event_ids", [])) + list(incoming.get("event_ids", [])))
    out["source_urls"] = _unique(list(out.get("source_urls", [])) + list(incoming.get("source_urls", [])))
    out["market_organizer_ids"] = _unique(list(out.get("market_organizer_ids", [])) + [out.get("organizer_id", ""), incoming.get("organizer_id", "")])
    contacts = dict(out.get("contacts") or {})
    candidates = dict(out.get("contact_candidates") or {})
    for key in ("instagram", "telegram", "whatsapp", "email", "phone", "website"):
        contacts[key] = _unique(list(contacts.get(key, [])) + list((incoming.get("contacts") or {}).get(key, [])))
        candidates[key] = _unique(list(candidates.get(key, [])) + list((incoming.get("contact_candidates") or {}).get(key, [])))
    out["contacts"] = contacts
    out["contact_candidates"] = candidates
    out["evidence"] = (list(out.get("evidence", [])) + list(incoming.get("evidence", [])))[-300:]
    out["confidence"] = max(float(out.get("confidence", 0)), float(incoming.get("confidence", 0)))
    if incoming.get("identity_status") == "NAMED":
        out["identity_status"] = "NAMED"
    if float(incoming.get("confidence", 0)) > float(base.get("confidence", 0)) and incoming.get("name"):
        out["name"] = incoming["name"]
    return out


def _global_organizer_identity(org: dict) -> str:
    """Build stable global identity without collapsing anonymous organizers by country."""
    contacts = org.get("contacts") or {}
    if org.get("identity_status") == "NAMED":
        for key in ("instagram", "email", "telegram", "whatsapp", "phone"):
            if contacts.get(key):
                return f"{key}:{contacts[key][0]}"
        if contacts.get("website"):
            return f"website:{domain(contacts['website'][0])}"
        if org.get("name"):
            return f"named:{org.get('name')}|{'|'.join(org.get('countries', []) or [org.get('country', '')])}"

    # Unknown organizer identity must remain scoped to its race(s), never merely to a country.
    event_ids = _unique(list(org.get("event_ids", [])))
    market_ids = _unique(list(org.get("market_organizer_ids", [])) + [org.get("organizer_id", "")])
    if event_ids:
        return "unresolved-events:" + "|".join(sorted(event_ids))
    if market_ids:
        return "unresolved-market-ids:" + "|".join(sorted(market_ids))
    return f"unresolved:{org.get('display_name','')}|{org.get('country','')}"


def aggregate_global() -> dict:
    all_events: list[dict] = []
    all_organizers: list[dict] = []
    market_stats = {}
    for code, market in enabled_markets(CONFIG):
        market_dir = MARKET_ROOT / code
        events = _read_jsonl(market_dir / "candidates.jsonl")
        organizers = _read_jsonl(market_dir / "organizers.jsonl")
        for event in events:
            event = dict(event)
            event["market_code"] = code
            all_events.append(event)
        for organizer in organizers:
            organizer = dict(organizer)
            organizer["markets"] = _unique(list(organizer.get("markets", [])) + [code])
            organizer["market_organizer_ids"] = _unique(list(organizer.get("market_organizer_ids", [])) + [organizer.get("organizer_id", "")])
            all_organizers.append(organizer)
        state = _read_json(market_dir / "STATE.json", {})
        market_stats[code] = {
            "country": market.get("country"),
            "events": len(events),
            "organizers": len(organizers),
            "last_run_id": state.get("run_id", ""),
            "status": state.get("status", "NOT_RUN"),
        }

    event_by_id = {}
    for event in all_events:
        key = event.get("candidate_id") or stable_id(event.get("name", ""), event.get("date", ""), event.get("country", ""))
        event_by_id[key] = event
    global_events = sorted(event_by_id.values(), key=lambda e: (e.get("date") or "9999", e.get("country") or "", e.get("name") or ""))

    global_organizers: list[dict] = []
    for organizer in all_organizers:
        best_i, best_score = -1, 0.0
        for i, existing in enumerate(global_organizers):
            score = organizer_match_score(existing, organizer)
            if score > best_score:
                best_i, best_score = i, score
        if best_i >= 0 and best_score >= 0.90:
            global_organizers[best_i] = _merge_global_organizer(global_organizers[best_i], organizer)
        else:
            global_organizers.append(organizer)

    for org in global_organizers:
        org["global_organizer_id"] = stable_id("global-organizer", _global_organizer_identity(org))

    outreach = [
        o for o in global_organizers
        if o.get("identity_status") == "NAMED"
        and any((o.get("contacts") or {}).get(k) for k in ("instagram", "email", "telegram", "whatsapp", "phone"))
    ]
    _write_jsonl(GLOBAL_ROOT / "candidates.jsonl", global_events)
    _write_jsonl(GLOBAL_ROOT / "organizers.jsonl", global_organizers)
    _write_jsonl(GLOBAL_ROOT / "organizer_outreach_ready.jsonl", outreach)
    summary = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "markets": market_stats,
        "global_events": len(global_events),
        "global_organizers": len(global_organizers),
        "outreach_ready": len(outreach),
    }
    _write_json(GLOBAL_ROOT / "SUMMARY.json", summary)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=int(os.environ.get("MARKETS_PER_RUN", "5")))
    parser.add_argument("--market", action="append", default=[])
    args = parser.parse_args()

    selected = args.market or choose_markets(args.limit)
    manifest = dict(enabled_markets(CONFIG))
    GLOBAL_ROOT.mkdir(parents=True, exist_ok=True)
    schedule = _read_json(GLOBAL_ROOT / "market_schedule.json", {"last_success": {}, "history": []})
    results = []
    for code in selected:
        if code not in manifest:
            results.append({"market_code": code, "status": "UNKNOWN_MARKET"})
            continue
        cfg = load_market_config(CONFIG, code)
        result = run_market(code, cfg)
        results.append(result)
        if result.get("returncode") == 0 and str(result.get("status", "")).startswith("PASS"):
            schedule.setdefault("last_success", {})[code] = result.get("finished_at")
    schedule.setdefault("history", []).append({
        "at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "selected": selected,
        "results": [{"market_code": r.get("market_code"), "status": r.get("status"), "returncode": r.get("returncode")} for r in results],
    })
    schedule["history"] = schedule["history"][-60:]
    _write_json(GLOBAL_ROOT / "market_schedule.json", schedule)
    summary = aggregate_global()
    print(json.dumps({"selected": selected, "results": results, "global": summary}, ensure_ascii=False, indent=2))
    return 1 if any(r.get("returncode", 0) not in (0, None) for r in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
