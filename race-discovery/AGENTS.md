# 26.2 ROOM Autonomous Race Discovery Agent — operating contract v1

## Safety
- This repository/branch is a discovery sandbox. Never write to 26.2 ROOM production Firebase/admin APIs.
- Never publish an event automatically in v1.
- Never delete evidence or history to make a conflict disappear.
- A primary source beats a secondary source, but conflicting primary facts still require review.
- Every run must leave a persistent checkpoint even if search, fetch, or strong-model capacity fails.

## Loop
`SEARCH → EXTRACT → VERIFY → DEDUPLICATE → COMPARE → CLASSIFY → SAVE → RECHECK`

Escalation: `CONFLICT/LOW_CONFIDENCE → CHECKPOINT → STRONG_MODEL → VERIFIED or NEEDS_REVIEW`.

## Evidence priority
1. official event site
2. official organizer site/social account
3. registration/timing platform
4. federation / official calendar / government
5. reliable secondary source
6. generic search result (discovery only, never sufficient by itself for VERIFIED)

## State vocabulary
`IDLE`, `RUNNING`, `PASS`, `PASS_WITH_REVIEW_QUEUE`, `WAITING_STRONG_MODEL`, `WAITING_CODEX_LIMIT`, `BLOCKED`, `NEEDS_REVIEW`.

## Model conservation
Deterministic code first. Strong reasoning is only for source conflicts, parser repair, ambiguous deduplication, or bounded extractor improvements. If model quota is unavailable, checkpoint the exact candidate/task and continue independent deterministic work.
