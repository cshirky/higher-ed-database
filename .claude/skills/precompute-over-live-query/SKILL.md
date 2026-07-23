---
name: precompute-over-live-query
description: >-
  Prefer writing computed/aggregated results out to storage over recomputing
  them on every request. Use when adding or reviewing any page, API route, or
  query that aggregates across many institutions/years (nationwide trends,
  peer-similarity networks, rankings, leaderboards) — the underlying IPEDS
  data only changes when the ETL backfill reruns, not per-request.
---

# Precompute over live query

The underlying data (IPEDS) is static between ETL runs and often years behind
real time already (e.g. the "latest" year is frequently provisional or a year
or two stale). Given that, **prefer writing results out for display over
recalculating them dynamically on every request.** There's no freshness
benefit to live computation here — only extra latency and database load.

## Where this applies today

- `getNationwideTrends()` (`src/db/queries.ts`) — a 5-table join + `group by`
  across ~90k+ rows, run fresh on every `/compare` page load. This result
  only changes when the ETL backfill reruns (rare, manual, currently annual
  at most).
- `getPeers()` (`src/db/queries.ts`) — computes z-normalized similarity
  distance across an entire institution-type cohort, per request, for every
  `/institutions/[unitid]` page view.

Both are candidates to precompute once (as part of or right after the ETL
load) and store, rather than compute per page view.

## How to apply

- Add a "materialize" step to the ETL pipeline (either inside
  `scripts/etl/load-year.ts` or a separate `scripts/etl/materialize.ts` run
  after a backfill) that computes these aggregates once and writes them to
  dedicated tables (e.g. `nationwide_trends`, `peer_network`). Pages then do
  a plain indexed `select`, not a live join/aggregation.
- Only recompute when the ETL pipeline actually reruns — not on a timer, not
  on every deploy, and not per-request.
- If a fully precomputed table is overkill for a given case, the lighter
  option is Next.js's own static/ISR revalidation (`export const revalidate`
  on the route segment, or on-demand revalidation triggered right after an
  ETL run) so the *page* is cached even if the query itself stays live —
  but writing the result out to a real table is the preferred approach here,
  not just an HTTP/render cache.
