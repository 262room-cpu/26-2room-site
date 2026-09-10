# 26.2 ROOM Race Discovery Agent v1

Safe, independent discovery pipeline for endurance events. Kazakhstan is the first country profile.

## What works in the prototype
- active web discovery through Bing RSS search (zero secret bootstrap provider)
- known-source watchlist seeds
- HTML + JSON-LD extraction
- date / time / distance / price extraction
- source-priority confidence
- deterministic deduplication
- conflict detection and manual-review queue
- persistent JSON/JSONL state
- GitHub Actions cloud execution
- no connection to 26.2 ROOM production

## Run
```bash
python -m unittest discover -s tests -v
python -m race_agent.cli run --country kz
```

Environment budgets: `MAX_QUERIES` (default 12), `RESULTS_PER_QUERY` (6), `MAX_URLS` (40), `DISABLE_WEB_SEARCH=1` for seed-only tests.

## Runtime files
- `runtime/STATE.json` — checkpoint/state machine
- `runtime/candidates.jsonl` — current candidate store + evidence
- `runtime/watchlist.json` — trusted/interesting domains
- `runtime/model_queue.jsonl` — unresolved escalation queue
- `runtime/runs.jsonl` — run metrics history

## Important limitation
The zero-secret Bing RSS adapter is a bootstrap search source, not a long-term SLA. The provider interface should later add a supported search API, while keeping the rest of the pipeline unchanged.

Strong-model execution is intentionally not enabled in v1. The queue/checkpoint logic is ready; productionizing an API/Codex cloud credential strategy is a separate safety decision.

## Architecture
See `ARCHITECTURE_V1.md` for the full v1 state machine, evidence model, update matching, watchlist/lineage and escalation design.

## Temporary GitHub hosting
The first runnable prototype is hosted on an isolated `agent/race-discovery-v1` branch of the existing 26.2 ROOM site repository because the current connector cannot create a new repository. It must not be merged to the site `main`. A dedicated private repository is the intended permanent home.
