# 26.2 ROOM Autonomous Race Discovery Agent — Architecture v1

## 1. Goal
Build a quality-first, production-isolated research pipeline for endurance events. Kazakhstan is profile `kz`; countries are configuration/adapters, not forks of the code.

The v1 loop is:

`SEARCH -> FETCH -> EXTRACT -> VERIFY -> DEDUPLICATE -> COMPARE -> CLASSIFY -> SAVE -> RECHECK`

Escalation is separate:

`CONFLICT / LOW_CONFIDENCE / PARSER_FAILURE -> CHECKPOINT -> STRONG_MODEL -> RESOLVED or NEEDS_REVIEW`

No stage in v1 can publish to the 26.2 ROOM production app or mutate production Firebase/admin data.

## 2. Components

### Scheduler / cloud runner
GitHub Actions is the bootstrap cloud runner. It executes deterministic tests first, then one bounded discovery run. The final dedicated repository can run on a schedule; this temporary branch also runs on branch pushes/manual dispatch.

### Search adapters
`SearchProvider` is replaceable. The bootstrap implementation uses a zero-secret Bing RSS endpoint only to discover URLs. Search output has the lowest trust and can never by itself make a candidate VERIFIED. A supported search API should replace/augment it for production reliability.

Country config defines query families, seed sources, known cities and source trust hints. Future country profiles can add local-language query sets and source registries without changing the core pipeline.

### Fetch + extraction
For each URL the agent records check time and source URL, fetches bounded HTML, extracts JSON-LD Event data where available, then deterministic HTML facts: title, date, city, location, distances, times, prices, registration state, organizer, Instagram and registration URL.

Each important value is stored as evidence rather than only as a flattened field.

### Evidence / verification
Evidence record:
- field
- extracted value
- URL
- source type
- source weight
- observed timestamp
- content hash

Priority:
1. official event site
2. official organizer site/social account
3. registration platform
4. federation / government / official calendar
5. reliable secondary source
6. search result, discovery only

A confidence score is a routing aid, not proof. Conflicting high-quality sources must remain a conflict until resolved.

### Entity resolution and deduplication
Current-run duplicates are scored by normalized title + date + city + overlapping source domains. Source records are merged into one event candidate.

Edition identity is deliberately more stable than a source URL. Candidate IDs use name/year/city/country and are preserved when an existing edition is matched after a date/location/name change. A separate `lineage_id` connects recurring editions of the same event family.

Before declaring an incoming candidate NEW, the agent compares it against prior candidates with a relaxed update threshold. This is what allows a moved date to be detected as a change instead of creating a duplicate event.

### Change detector
Tracked fields in v1 include:
- name
- date
- city/location
- distances
- registration prices
- registration status
- registration deadline
- registration URL
- Instagram

Explicit cancellation/postponement phrases are routed to CANCELLED/POSTPONED + review. Later versions should add source-specific semantic extractors for announcement posts and archived page diffs.

### Candidate state machine
Evidence state:
`NEW / VERIFIED / UPDATED / CONFLICT / CANCELLED / POSTPONED / NEEDS_REVIEW`

Publishing workflow state:
`DISCOVERED -> VERIFIED -> READY_FOR_REVIEW -> APPROVED -> PUBLISHED`

In v1, the boundary stops at `READY_FOR_REVIEW`; APPROVED/PUBLISHED are reserved for a later human-controlled integration.

### Organizer/source watchlist
High-confidence source domains and named organizers are promoted into `watchlist.json`. Future runs can recheck them without rediscovering them through broad search. Source cadence can later depend on event proximity, historical reliability and whether registration is open.

### Event lineage
Each candidate carries `lineage_id`. A later lineage job will connect e.g. 2025 -> 2026 -> 2027 and create proactive searches for the next edition based on prior timing and organizer history.

### Strong-model escalation
The strong model is not in the hot path. It is reserved for:
- conflicting primary facts
- ambiguous dedupe/entity matching
- difficult page structure
- parser repair/new source adapter
- semantic cancellation/postponement announcements

Unresolved tasks are persisted to `runtime/model_queue.jsonl`. If no credential/quota is available, tasks remain checkpointed rather than failing the discovery run. Maximum repair attempts and owner-review rules should mirror the GuardControl QA discipline.

## 3. Persistent state
Bootstrap storage is reviewable files committed back by the cloud runner:
- `runtime/STATE.json` — phase/checkpoint
- `runtime/candidates.jsonl` — candidate snapshots + evidence
- `runtime/watchlist.json` — organizer/source watchlist
- `runtime/model_queue.jsonl` — escalation checkpoints
- `runtime/runs.jsonl` — metrics journal

This is intentionally simple for v1. When event volume/multi-country concurrency grows, move these interfaces to Postgres/Cloud SQL or a dedicated non-production Firestore project while retaining append-only evidence/change history.

## 4. Safety boundaries
- production write capability = false
- no production Firebase credentials in the workflow
- no automatic APPROVED/PUBLISHED transition
- no secrets required for the deterministic discovery loop
- bounded URL count, response size and timeouts
- deterministic tests must pass before search
- state is saved even with partial source failures
- unresolved evidence is never deleted to manufacture confidence

## 5. Metrics per run
`runs.jsonl` records at least queries, URLs discovered/checked, raw candidates, deduplicated candidates, duplicates discarded, new, updated, conflicts, review queue size, status counts and bounded errors.

Next metrics: source hit rate, primary-source confirmation rate, stale-event rate, false-positive rate after human review, per-source parser failure rate and strong-model cost/usage.

## 6. v1 -> v2 path
1. Prove discovery quality in Kazakhstan for several weeks.
2. Replace bootstrap web search with a supported search provider and add source-specific adapters for the highest-yield sites.
3. Add a review UI/export and explicit human approval records.
4. Add robust lineage scheduling and recency-based recheck policy.
5. Enable a strong-model worker only after choosing an explicit credential/budget strategy.
6. Only then build a read-only adapter to the real 26.2 ROOM event database for comparison.
7. Production writes/autopublishing remain a separate owner-approved stage.
