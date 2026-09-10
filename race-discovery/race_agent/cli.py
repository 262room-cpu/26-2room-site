from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import sys
from collections import Counter

from .core import candidate_from_document, classify_source, deduplicate, domain, match_score, merge_candidates
from .providers import BingRssSearchProvider, fetch_url

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
    errors: list[dict] = []
    query_count = 0
    search_provider = BingRssSearchProvider()

    if os.environ.get("DISABLE_WEB_SEARCH") != "1":
        for query in cfg.get("queries", [])[: int(os.environ.get("MAX_QUERIES", "12"))]:
            query_count += 1
            try:
                for hit in search_provider.search(query, limit=int(os.environ.get("RESULTS_PER_QUERY", "6"))):
                    urls.setdefault(hit.url, {"found_by": [], "title": hit.title, "snippet": hit.snippet})["found_by"].append(query)
            except Exception as exc:
                errors.append({"phase": "SEARCH", "query": query, "error": type(exc).__name__ + ": " + str(exc)[:240]})

    for seed in cfg.get("seed_urls", []):
        urls.setdefault(seed, {"found_by": ["SEED"], "title": "", "snippet": ""})

    state.update({"phase": "EXTRACT", "queries_completed": query_count, "urls_discovered": len(urls)})
    write_json(state_path, state)

    raw_candidates = []
    checked = 0
    max_urls = int(os.environ.get("MAX_URLS", "40"))
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
            merged = merge_candidates(prev, candidate)
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
    final.sort(key=lambda r: (r.get("date") or "9999", r.get("name") or ""))
    save_jsonl(RUNTIME / "candidates.jsonl", final)

    watchlist = load_json(RUNTIME / "watchlist.json", {"domains": {}})
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
    watchlist.setdefault("organizers", {})
    for candidate in final:
        org = (candidate.get("organizer") or "").strip()
        if org and candidate.get("confidence", 0) >= 0.80:
            rec = watchlist["organizers"].setdefault(org, {"first_seen": observed, "event_ids": []})
            if candidate.get("candidate_id") not in rec["event_ids"]:
                rec["event_ids"].append(candidate.get("candidate_id"))
            rec["last_checked"] = observed
    write_json(RUNTIME / "watchlist.json", watchlist)

    existing_queue = load_jsonl(RUNTIME / "model_queue.jsonl")
    queue_by_key = {(q.get("candidate_id"), q.get("reason")): q for q in existing_queue if q.get("status") not in {"RESOLVED", "DISMISSED"}}
    for candidate in final:
        if candidate.get("status") in {"CONFLICT", "NEEDS_REVIEW", "CANCELLED", "POSTPONED"} or candidate.get("confidence", 0) < 0.72:
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
    summary = {
        "run_id": run_id,
        "started_at": observed,
        "finished_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "queries": query_count,
        "urls_discovered": len(urls),
        "urls_checked": checked,
        "raw_candidates": len(raw_candidates),
        "deduplicated_candidates": len(candidates),
        "duplicates_discarded": dup_count,
        "new": new_count,
        "updated": updated_count,
        "conflicts": conflict_count,
        "needs_manual_review": len(model_queue),
        "status_counts": dict(status_counts),
        "errors": errors[:50],
    }
    append_jsonl(RUNTIME / "runs.jsonl", summary)
    state.update({"status": "PASS_WITH_REVIEW_QUEUE" if model_queue else "PASS", "phase": "DONE", "finished_at": summary["finished_at"], "last_summary": summary})
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
