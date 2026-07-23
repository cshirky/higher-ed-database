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

## Implemented so far

- `nationwide_trends` table, read by `getNationwideTrends()` — backs
  `/compare`. Formerly a live 5-table join + `group by` across ~90k+ rows on
  every page load.
- `peer_network` table, read by `getPeers()` — backs the peer-similarity
  section of `/institutions/[unitid]`. Formerly an O(n²) z-normalized
  similarity computation across the whole institution-type cohort, per
  request.

Both are now filled by `scripts/etl/materialize.ts` and queried with a plain
indexed `select` — no live join/aggregation happens on request anymore.

## IMPORTANT: re-run materialize.ts after every backfill

**`scripts/etl/materialize.ts` must be re-run any time `load-year.ts` is run**
— for a fresh year, a re-backfill, or a scope/classification change (like the
`DEGGRANT` fix). `nationwide_trends` and `peer_network` are snapshots computed
from the fact tables at materialize time; they do **not** update themselves,
so skipping this step leaves `/compare` and every institution's peer network
silently serving stale data even though the underlying tables are current.

```bash
npx tsx scripts/etl/load-year.ts <years...>
npx tsx scripts/etl/materialize.ts   # always follows a backfill, no exceptions
```

If a scope change alters which institutions exist (like a `DEGGRANT` fix),
remember `load-year.ts` upserts but never deletes — truncate the affected
tables first (see `scripts/etl/truncate-all.ts`) before backfilling, same as
before materializing.

## How to apply going forward

- New aggregate views (rankings, leaderboards, additional nationwide cuts,
  etc.) should follow the same pattern: add a table, fill it in
  `materialize.ts`, query it with a plain `select`. Don't add another live
  join/aggregation query.
- Only recompute when the ETL pipeline actually reruns — not on a timer, not
  on every deploy, and not per-request.
- If a fully precomputed table is overkill for some future case, the lighter
  option is Next.js's own static/ISR revalidation (`export const revalidate`
  on the route segment, or on-demand revalidation triggered right after an
  ETL run) — but a stored table is the preferred approach here, not just an
  HTTP/render cache.
