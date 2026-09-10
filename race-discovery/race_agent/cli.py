from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import sys
from collections import Counter

from .catalog import annotate_against_catalog, load_catalog
from .core import candidate_from_document, classify_source, deduplicate, domain, match_score, merge_candidates
from .inbox import load_private_signals
from .providers import BingRssSearchProvider, SearchHit, fetch_url
from .signals import accept_hit, should_fetch_direct, signal_as_html, signal_record, social_queries

ROOT = pathlib.Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "runtime"
CONFIG = ROOT / "config"


def load_json(path: pathlib.Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: pathlib.Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def append_jsonl(path: pathlib.Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, ensure_ascii=False) + "\n")


def load_jsonl(path: pathlib.Path) -> list[dict]:
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return out


def save_jsonl(path: pathlib.Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)
    path.write_text(text, encoding="utf-8")


def _previous_still_relevant(row: dict, cfg: dict) -> bool:
    if float(row.get("confidence", 0)) >= 0.72 or row.get("status") in {"VERIFIED", "CONFLICT", "UPDATED", "CANCELLED", "POSTPONED"}:
        return True
    meta = row.get("discovery") or {}
    hit = SearchHit(title=str(meta.get("title") or row.get("name") or ""), url=(row.get("source_urls") or [""])[0], snippet=str(meta.get("snippet") or ""))
    return accept_hit(hit, cfg)


def run(country: str = "kz") -> int:
    observed = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    run_id = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    cfg = load_json(CONFIG / f"{country}.json", {})
    state_path = RUNTIME / "STATE.json"
    state = load_json(state_path, {})
    state.update({"status": "RUNNING", "run_id": run_id, "started_at": observed, "phase": "SEARCH"})
    write_json(state_path, state)

    source_hints = cfg.get("source_hints", {})
    urls: dict[str, dict] = {}
    search_signal_candidates: list[dict] = []
    signals: list[dict] = []
    errors: list[dict] = []
    query_count = 0
    hits_seen = hits_accepted = hits_rejected = 0
    search_provider = BingRssSearchProvider()

    queries = list(dict.fromkeys(cfg.get("queries", []) + social_queries(cfg)))
    if os.environ.get("DISABLE_WEB_SEARCH") != "1":
        for query in queries[: int(os.environ.get("MAX_QUERIES", "20"))]:
            query_count += 1
            try:
                for hit in search_provider.search(query, limit=int(os.environ.get("RESULTS_PER_QUERY", "8"))):
                    hits_seen += 1
                    if not accept_hit(hit, cfg):
                        hits_rejected += 1
                        continue
                    hits_accepted += 1
                    signals.append(signal_record(hit, query, observed, cfg))
                    meta = {"found_by": [query], "title": hit.title, "snippet": hit.snippet}
                    if should_fetch_direct(hit.url):
                        existing = urls.setdefault(hit.url, {"found_by": [], "title": hit.title, "snippet": hit.snippet})
                        if query not in existing["found_by"]:
                            existing["found_by"].append(query)
                    else:
                        candidate = candidate_from_document(hit.url, signal_as_html(hit), "search_result", observed, known_cities=cfg.get("cities", []), country=cfg.get("country", "Kazakhstan"))
                        if candidate:
                            candidate["discovery"] = meta
                            candidate["signal_only"] = True
                            search_signal_candidates.append(candidate)
            except Exception as exc:
                errors.append({"phase": "SEARCH", "query": query, "error": type(exc).__name__ + ": " + str(exc)[:240]})

    for seed in cfg.get("seed_urls", []):
        urls.setdefault(seed, {"found_by": ["SEED"], "title": "", "snippet": ""})

    private_signals, private_inbox_source = load_private_signals(RUNTIME)
    for item in private_signals:
        text = item.get("text", "")
        link = item.get("url", "")
        title = item.get("chat_name") or item.get("source") or "Private signal"
        hit = SearchHit(title=title, url=link or "https://private.signal.local/", snippet=text[:6000])
        if not accept_hit(hit, cfg, threshold=0.35):
            continue
        signals.append({
            "observed_at": observed,
            "query": "AUTHORIZED_PRIVATE_INBOX",
            "title": title,
            "snippet": text[:1200],
            "url": link,
            "domain": "",
            "source_family": str(item.get("source") or "PRIVATE_SIGNAL").upper(),
            "relevance": 1.0,
            "private": True,
        })
        candidate = candidate_from_document(link or "https://private.signal.local/", signal_as_html(hit), "search_result", observed, known_cities=cfg.get("cities", []), country=cfg.get("country", "Kazakhstan"))
        if candidate:
            candidate["discovery"] = {"found_by": ["AUTHORIZED_PRIVATE_INBOX"], "title": title, "snippet": text[:1200]}
            candidate["signal_only"] = True
            search_signal_candidates.append(candidate)
        if link.startswith("http") and should_fetch_direct(link):
            urls.setdefault(link, {"found_by": ["PRIVATE_SIGNAL_LINK"], "title": title, "snippet": text[:800]})

    save_jsonl(RUNTIME / "signals.jsonl", signals[-1000:])
    state.update({"phase": "EXTRACT", "queries_completed": query_count, "urls_discovered": len(urls), "signals_accepted": len(signals)})
    write_json(state_path, state)

    raw_candidates = list(search_signal_candidates)
    checked = 0
    max_urls = int(os.environ.get("MAX_URLS", "60"))
    for url, meta in list(urls.items())[:max_urls]:
        try:
            raw = fetch_url(url)
            checked += 1
            if not raw:
                continue
            source_type = classify_source(url, source_hints)
            candidate = candidate_from_document(url, raw, source_type, observed, known_cities=cfg.get("cities", []), country=cfg.get("country", "Kazakhstan"))
            if candidate:
                candidate["discovery"] = meta
                raw_candidates.append(candidate)
        except Exception as exc:
            errors.append({"phase": "FETCH", "url": url, "error": type(exc).__name__ + ": " + str(exc)[:240]})

    state.update({"phase": "DEDUPLICATE", "urls_checked": checked, "raw_candidates": len(raw_candidates)})
    write_json(state_path, state)
    candidates, dup_count = deduplicate(raw_candidates)

    previous_rows = load_jsonl(RUNTIME / "candidates.jsonl")
    quarantined = [r for r in previous_rows if not _previous_still_relevant(r, cfg)]
    previous_rows = [r for r in previous_rows if _previous_still_relevant(r, cfg)]
    if quarantined:
        for row in quarantined:
            row = dict(row)
            row["quarantine_reason"] = "LOW_CONFIDENCE_IRRELEVANT_SEARCH_RESULT"
            row["quarantined_at"] = observed
            append_jsonl(RUNTIME / "quarantine.jsonl", row)

    previous = {r.get("candidate_id"): r for r in previous_rows if r.get("candidate_id")}
    final: list[dict] = []
    new_count = updated_count = conflict_count = 0
    for candidate in candidates:
        prev_id = candidate.get("candidate_id") if candidate.get("candidate_id") in previous else None
        if not prev_id:
            best_id, best_score = None, 0.0
            for pid, prow in previous.items():
                score = match_score(prow, candidate)
                if score > best_score:
                    best_id, best_score = pid, score
            if best_id and best_score >= 0.68:
                prev_id = best_id
        if prev_id:
            prev = previous[prev_id]
            candidate["candidate_id"] = prev_id
            candidate["lineage_id"] = prev.get("lineage_id") or candidate.get("lineage_id")
            merged = merge_candidates(prev, candidate, historical=True)
            if merged.get("status") == "CONFLICT":
                conflict_count += 1
            elif merged.get("changes"):
                updated_count += 1
            final.append(merged)
            previous.pop(prev_id, None)
        else:
            new_count += 1
            final.append(candidate)
    final.extend(previous.values())

    app_catalog, catalog_source = load_catalog(RUNTIME)
    final = [annotate_against_catalog(c, app_catalog) for c in final]
    final.sort(key=lambda r: (r.get("date") or "9999", r.get("name") or ""))
    save_jsonl(RUNTIME / "candidates.jsonl", final)

    already_in_app = [c for c in final if c.get("catalog_relation") == "ALREADY_IN_APP"]
    discovery_list = [c for c in final if c.get("catalog_relation") != "ALREADY_IN_APP"] if app_catalog else list(final)
    save_jsonl(RUNTIME / "discovery_list.jsonl", discovery_list)
    save_jsonl(RUNTIME / "already_in_app.jsonl", already_in_app)

    watchlist = load_json(RUNTIME / "watchlist.json", {"domains": {}, "organizers": {}, "social_sources": {}})
    for candidate in final:
        if candidate.get("confidence", 0) >= 0.85:
            for url in candidate.get("source_urls", []):
                d = domain(url)
                if d:
                    rec = watchlist["domains"].setdefault(d, {"first_seen": observed, "source_urls": [], "event_count": 0})
                    if url not in rec["source_urls"]:
                        rec["source_urls"].append(url)
                    rec["last_checked"] = observed
    for d, rec in watchlist["domains"].items():
        rec["event_count"] = sum(1 for c in final if any(domain(u) == d for u in c.get("source_urls", [])))
    for candidate in final:
        org = (candidate.get("organizer") or "").strip()
        if org and candidate.get("confidence", 0) >= 0.80:
            rec = watchlist["organizers"].setdefault(org, {"first_seen": observed, "event_ids": []})
            if candidate.get("candidate_id") not in rec["event_ids"]:
                rec["event_ids"].append(candidate.get("candidate_id"))
            rec["last_checked"] = observed
    for signal in signals:
        if signal.get("source_family") in {"INSTAGRAM", "TELEGRAM", "FACEBOOK"} and signal.get("url"):
            rec = watchlist["social_sources"].setdefault(signal["url"], {"first_seen": observed, "family": signal["source_family"]})
            rec["last_seen"] = observed
    write_json(RUNTIME / "watchlist.json", watchlist)

    final_ids = {c.get("candidate_id") for c in final}
    existing_queue = [q for q in load_jsonl(RUNTIME / "model_queue.jsonl") if q.get("candidate_id") in final_ids and q.get("status") not in {"RESOLVED", "DISMISSED"}]
    queue_by_key = {(q.get("candidate_id"), q.get("reason")): q for q in existing_queue}
    for candidate in discovery_list:
        relation = candidate.get("catalog_relation")
        needs_queue = candidate.get("status") in {"CONFLICT", "NEEDS_REVIEW", "CANCELLED", "POSTPONED"} or candidate.get("confidence", 0) < 0.72 or relation in {"IN_APP_CHANGED", "POSSIBLE_APP_MATCH"}
        if not needs_queue:
            continue
        if relation == "IN_APP_CHANGED":
            reason = "APP_CATALOG_CHANGED"
        elif relation == "POSSIBLE_APP_MATCH":
            reason = "AMBIGUOUS_APP_MATCH"
        else:
            reason = "CONFLICT" if candidate.get("conflicts") else (candidate.get("status") if candidate.get("status") in {"CANCELLED", "POSTPONED"} else "LOW_CONFIDENCE")
        key = (candidate.get("candidate_id"), reason)
        if key not in queue_by_key:
            queue_by_key[key] = {
                "task_id": f"{run_id}:{candidate.get('candidate_id')}:{reason}",
                "candidate_id": candidate.get("candidate_id"),
                "reason": reason,
                "status": "WAITING_STRONG_MODEL" if os.environ.get("OPENAI_API_KEY") else "CHECKPOINTED_NO_MODEL_CREDENTIAL",
                "created_at": observed,
                "attempts": 0,
                "last_error": "",
            }
        queue_by_key[key]["last_seen_at"] = observed
    model_queue = list(queue_by_key.values())
    save_jsonl(RUNTIME / "model_queue.jsonl", model_queue)

    status_counts = Counter(c.get("status", "UNKNOWN") for c in final)
    relation_counts = Counter(c.get("catalog_relation", "UNKNOWN") for c in final)
    summary = {
        "run_id": run_id,
        "started_at": observed,
        "finished_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "queries": query_count,
        "search_hits_seen": hits_seen,
        "search_hits_accepted": hits_accepted,
        "search_hits_rejected": hits_rejected,
        "signals": len(signals),
        "private_signals": len(private_signals),
        "private_inbox_source": private_inbox_source,
        "urls_discovered": len(urls),
        "urls_checked": checked,
        "raw_candidates": len(raw_candidates),
        "deduplicated_candidates": len(candidates),
        "duplicates_discarded": dup_count,
        "quarantined_noise": len(quarantined),
        "new": new_count,
        "updated": updated_count,
        "conflicts": conflict_count,
        "catalog_source": catalog_source,
        "catalog_events": len(app_catalog),
        "catalog_relations": dict(relation_counts),
        "review_list": len(discovery_list),
        "suppressed_already_in_app": len(already_in_app),
        "needs_manual_review": len(model_queue),
        "status_counts": dict(status_counts),
        "errors": errors[:50],
    }
    append_jsonl(RUNTIME / "runs.jsonl", summary)
    state.update({"status": "PASS_WITH_REVIEW_QUEUE" if model_queue else "PASS", "phase": "DONE", "finished_at": summary["finished_at"], "last_summary": summary, "catalog_source": catalog_source})
    write_json(state_path, state)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["run"])
    parser.add_argument("--country", default="kz")
    args = parser.parse_args()
    return run(args.country)

if __name__ == "__main__":
    sys.exit(main())
