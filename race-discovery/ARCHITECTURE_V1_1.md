# 26.2 ROOM Race Discovery — v1.1 multi-source architecture

## Objective
Find race signals anywhere useful, but only promote facts after evidence verification. The agent is not a scraper; it is a signal collector + verifier + entity resolver + change detector.

## Discovery surface

### Tier A — directly crawlable / cheap
- event and organizer websites
- registration/timing platforms
- federation and municipal calendars
- news sites, newspapers, local media and press releases
- public club/community websites and RSS/pages
- general search engine discovery

### Tier B — social discovery
- Instagram pages/posts discovered through search and organizer watchlists
- public Telegram channels/groups and `t.me` pages
- public Facebook pages/groups where visible
- organizer handles discovered from event sites

Social content is a SIGNAL by default. It becomes VERIFIED only when the account is known-official or another primary/registration source confirms the fact.

### Tier C — authorized private signals
Private WhatsApp groups, private Telegram groups/channels and closed communities cannot be searched globally without membership/access. v1.1 therefore supports an authorized private signal inbox:
- exported chat text/JSON placed in a gitignored runtime inbox; or
- a read-only `PRIVATE_SIGNAL_INBOX_URL`; or later
- a dedicated forwarding bot/webhook/email inbox.

Private message text must never be committed to this public temporary repository. The agent extracts an event lead in memory, then tries to verify it through public/official sources. If it cannot verify it, status remains NEEDS_REVIEW.

## Noise gate
Search results are scored before URL fetch. A result must contain a race/endurance term plus Kazakhstan/city/known-source/year evidence. Ambiguous tokens such as `OCR` do not count alone. Known junk domains are rejected before fetch.

This gate exists because the first cloud prototype demonstrated that broad queries can return unrelated finance, lyrics, dictionary and other pages.

## Multi-source processing

`DISCOVER SIGNALS`
→ `RELEVANCE FILTER`
→ `FETCH ELIGIBLE URLS`
→ `EXTRACT FACT CLAIMS`
→ `SOURCE TRUST`
→ `ENTITY RESOLUTION / DEDUPE`
→ `COMPARE HISTORICAL SNAPSHOT`
→ `COMPARE 26.2 ROOM APP CATALOG`
→ `VERIFY / CONFLICT / UPDATE`
→ `DISCOVERY LIST`
→ `RECHECK`

## 26.2 ROOM catalog comparison
The production catalog integration is read-only by design.

Supported v1.1 inputs:
- `runtime/app_catalog_snapshot.jsonl`
- `APP_CATALOG_FILE`
- `APP_CATALOG_URL` returning JSON/JSONL through GET

No production write operation exists in the comparator.

Relations:
- `ALREADY_IN_APP` — matched and no confirmed tracked difference; suppress from new-event list but continue monitoring
- `IN_APP_CHANGED` — same event but date/location/distance/etc differs; send to review/update queue
- `NOT_IN_APP` — true candidate for addition
- `POSSIBLE_APP_MATCH` — ambiguous identity; manual/model review
- `CATALOG_NOT_CONNECTED` — comparison layer ready but current app snapshot unavailable

Tracked comparison fields: name, date, city, location, distances, registration status/URL and Instagram.

## Outputs
- `runtime/signals.jsonl` — public discovery signals
- `runtime/candidates.jsonl` — full persistent event knowledge
- `runtime/discovery_list.jsonl` — events not safely suppressible as already present
- `runtime/already_in_app.jsonl` — matched existing app events, still monitored
- `runtime/quarantine.jsonl` — rejected old false positives for audit
- `runtime/model_queue.jsonl` — unresolved conflicts/ambiguous matches
- `runtime/watchlist.json` — websites, organizers and social sources
- `runtime/runs.jsonl` — metrics

## Next adapters
1. Telegram client adapter with an authorized dedicated account/session for selected public channels and joined groups.
2. Instagram official-account watchlist + supported API/search provider strategy; anonymous HTML scraping is not a reliable core dependency.
3. WhatsApp forwarding/export bridge for groups where the owner has legitimate access.
4. News/RSS source registry for Kazakhstan cities and sports departments.
5. Read-only export/API from the real 26.2 ROOM event catalog.
6. Strong-model worker for conflicts/parser repairs only.

## Safety invariant
Discovery breadth may grow indefinitely. Publication authority does not. In v1.x the agent may read, compare, classify and queue; it may not publish or mutate the production app catalog.
