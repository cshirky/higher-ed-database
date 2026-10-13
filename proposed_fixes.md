# Proposed fixes

Review of the app, display logic, ETL scripts, CSS and stored data, 2026-10-12
(at commit `cf23cad`). Nothing here has been changed — these are
recommendations only.

How it was checked: every file under `src/` and `scripts/` read in full;
`npx tsc --noEmit` (clean); `npx eslint .` (31 errors, see C9); and read-only
`SELECT`s against the Neon database to confirm the data claims. Items marked
**confirmed** were verified by a query or a command; items marked **by
reading** come from the code alone.

Priorities: **A** = wrong data or wrong output a user can see, **B** = crashes
and robustness, **C** = unused / redundant code, CSS and data, **D** =
confusing code and stale documentation.

---

## A. Bugs that produce wrong data or wrong display

### A1. Eleven columns are silently NULL in every row (ETL key-casing bug) — confirmed

> **Code fixed 2026-10-12**, including the throw-on-missing-column helper
> (`strictRow` / `opt` in `load-year.ts`). The columns stay NULL until
> `load-year.ts` is re-run for every year.

`tableOrNull()` upper-cases every column key (`scripts/etl/load-year.ts:90`),
but the row mappers then read some of them in mixed case, which is always
`undefined` → `null`:

- `load-year.ts:206-207` `r.EnrFt`, `r.EnrPt`
- `load-year.ts:211-213, 215, 218-219` `r.PctEnrWh`, `r.PctEnrBK`, `r.PctEnrHS`, `r.PctEnrAN`, `r.PctEnrUn`, `r.PctEnrNr`
- `load-year.ts:343-345` `r.SalProf`, `r.SalAssc`, `r.SalAsst`

Database, all years: `enrollment` has 66,121 rows with **0** non-null
`full_time`, `part_time`, `pct_white`, `pct_black`, `pct_hispanic`,
`pct_am_indian_ak_native`, `pct_race_unknown`, `pct_nonresident` (while
`pct_women` and `pct_asian`, read in upper case, are fully populated).
`faculty` has 67,178 rows with **0** non-null professor / associate /
assistant salaries.

Nothing in the UI reads these columns yet, which is why it has gone unnoticed.

**Fix:** upper-case those eleven property names, then re-run `load-year.ts`
for all years. To stop this recurring, have the mappers go through a small
`get(row, "NAME")` helper that throws on a column that does not exist.

### A2. "% receiving any grant" is actually "% receiving any aid" — by reading, high confidence

> **Renamed 2026-10-12** to `num_awarded_any_aid` / `pct_awarded_any_aid`,
> chart retitled "% receiving any aid". A rename keeps the stored values, so
> no re-load is needed for this. The `SCUGRAD` denominator mismatch below is
> still open.

`load-year.ts:366-368` loads `ANYAIDN` / `ANYAIDP` into
`num_awarded_any_grant` / `pct_awarded_any_grant`, and the institution page
charts it as "Financial aid: % receiving any grant"
(`src/app/institutions/[unitid]/page.tsx:151-156`). In IPEDS SFA, `ANYAID*`
is *any financial aid, loans included*; grant aid is `AGRNT_N` / `AGRNT_P`
(the same family as `AGRNT_A`, which line 369 already uses for the average
amount). The 2023 mean of the stored column is 87.8%, which fits "any aid".

Related: `num_total_students` is loaded from `SCUGRAD` (all undergraduates),
but the `ANYAID*`/`AGRNT_*` figures are for the full-time first-time cohort
(`SCUGFFN`), so the count and its apparent denominator don't match.

I could not check the IPEDS data dictionary directly — the
`ipeds_data/ipeds-cache/` download isn't on this machine — so confirm with
`scripts/dict-ci.mjs <accdb> sfa` before changing.

**Fix:** either load `AGRNT_N` / `AGRNT_P` (and `SCUGFFN`), or keep the data
and rename the columns and chart title to "any aid". Requires a re-load of
`financial_aid`.

### A3. Browse page says "academic year 2023-24" but shows 2024-25 — confirmed

> **Fixed 2026-10-12.** Both labels are now derived (`academicYearLabel(DEFAULT_YEAR)`; min/max year of the trend rows).

`src/app/institutions/page.tsx:36` hardcodes the label; the query underneath
uses `DEFAULT_YEAR = 2024`, which `queries.ts:22` itself describes as the
2024-25 release.

**Fix:** derive the label from `DEFAULT_YEAR`
(`${y}-${String(y + 1).slice(2)}`). Same for the hardcoded "2010–2024" on
`src/app/compare/page.tsx:41` — correct today, but should come from the data's
min/max year.

### A4. Degree counts render without thousands separators — confirmed

> **Fixed 2026-10-12** with `SUM(...)::int`.

`getTopAndBottomDegrees` types `SUM(count)` as `sql<number>`
(`src/db/queries.ts:262`), but Postgres `SUM(integer)` is `bigint` and the
Neon HTTP driver returns it as a **string** (`"1520"`). The page then calls
`d.total.toLocaleString()` (`[unitid]/page.tsx:64, 78`), which on a string is
a no-op, so large counts show as `1520` rather than `1,520`.

**Fix:** `sql<number>\`SUM(...)::int\`` (or `.mapWith(Number)`).

### A5. "Most Popular" and "Least Common" degrees show the same rows for most small institutions — confirmed

> **Resolved 2026-10-12** by removing the "Least Common" panel entirely; the query is now `getTopDegrees`, with the tiebreak. The "Degrees" vs "fields" wording is unchanged.

`queries.ts:270-273` takes the first five and last five of one list with no
check for overlap. In 2024, 1,772 of 3,905 institutions have fewer than ten
subject areas, so the lists overlap; 1,387 have five or fewer, so the two
panels are the *same* list in reverse order.

**Fix:** only fill `bottom5` from rows not already in `top5` (and hide the
"Least Common" panel when nothing is left). Also add a tiebreak
(`, prefix`) to the `ORDER BY` so equal counts don't reorder between requests.

Smaller wording point: the panels say "Degrees" but list 2-digit CIP subject
areas summed over all award levels — "Most popular fields" would be accurate.

### A6. Similarity scatter can draw uneven, non-round axis ticks — by reading

> **Fixed 2026-10-12.** Ticks fall on multiples of 10, or 20 when the window is wider than 60 points.

`ticksFor()` (`src/components/similarity-scatter.tsx:73-76`) always makes five
ticks, so the step is `span / 4`. `axisBounds()` returns spans that are
multiples of 10 and ≥ 40, so spans of 50, 70 or 90 give fractional steps that
are then rounded: a 40–90 window yields ticks at 40, 53, 65, 78, 90, with
unequal gaps and gridlines that don't sit where the labels say.

**Fix:** tick every 10 (every 20 when the span is over 60) instead of forcing
exactly five ticks.

### A7. Currency tooltips on /compare show three decimals — by reading

> **Fixed 2026-10-12.** Whole dollars; millions get one decimal below $10M.

`FORMATTERS.currency` is `` `$${v.toLocaleString()}` ``
(`src/components/time-series-chart.tsx:21`). On `/compare` the values are
averages (`avg_tuition` = 10647.682461538461), so the tooltip reads
`$10,647.682`.

**Fix:** `v.toLocaleString(undefined, { maximumFractionDigits: 0 })`.
Similarly `currencyM` (`:22`) rounds anything under $500k to `$0M` — use one
decimal below $10M.

### A8. Materialized tables keep stale rows forever — confirmed

> **Partly addressed 2026-10-12:** the stale rows were cleared by hand during the for-profit cleanup. `materialize.ts` itself still only upserts, so they will accumulate again.

`materialize.ts` only upserts. Consequences visible now:

- `academic_similarity` still holds 47,244 rows for **2023** that nothing
  reads (the app only queries `DEFAULT_YEAR`, and materialize only writes it).
- Within a year, if an institution ends up with fewer than 12 peers than it
  had on a previous run, or drops out of scope, its old higher-rank rows
  survive and are served as current.
- Same for a `nationwide_trends` (type, year) cell that stops existing.

**Fix:** inside `materialize.ts`, delete before inserting — `nationwide_trends`
entirely, and the target year's rows of `peer_network` /
`academic_similarity`. (This needs your go-ahead as it deletes rows; the
2023 `academic_similarity` rows would go with it.)

### A9. `truncate-all.ts` doesn't truncate everything — by reading

> **Table list fixed 2026-10-12.** The missing confirmation prompt and `.catch` are still open.

`scripts/etl/truncate-all.ts:7-17` omits `completions_by_field`,
`nationwide_trends`, `peer_network` and `academic_similarity`. The README and
the `institution-scope` skill both prescribe this script precisely so that
out-of-scope institutions don't survive a scope change — but their
`completions_by_field` rows (the 219 MB table) would.

**Fix:** add the four tables. While there: it runs with no confirmation
prompt and `main()` has no `.catch`, so a failure mid-way exits 0.

### A10. A failed download permanently poisons the cache directory — by reading

> **Fixed 2026-10-13** together with B5.

`ensureAccdb()` creates `extractDir` *before* downloading
(`load-year.ts:35-36`). If the fetch or the unzip throws, the empty directory
remains, and every later run skips the download (`existsSync(extractDir)` is
now true) and fails with "no .accdb found".

**Fix:** extract first into a temp dir and rename on success, or key the
skip on the `.accdb` being present rather than the directory.

### A11. Admissions data gaps that make charts look emptier than the data is — confirmed

- **Admit rate and yield are NULL for 2010–2013** (0 of ~4,900 rows per
  year), because `DRVADM` doesn't exist before 2014 and those two fields come
  only from it (`load-year.ts:177-178`). The raw counts are there
  (`applicants_total` is populated for ~2,100 institutions a year), so the
  "Admissions" chart and `/compare`'s "Average admit rate" start in 2014 for
  no good reason. **Fix:** fall back to `admits / applicants` and
  `enrolled / admits` when `DRVADM` is missing.
- **SAT/ACT 50th percentile exist only from 2022** (0 rows before), while the
  25th/75th go back to 2010. The "SAT scores (50th percentile)" and "ACT
  Composite (50th percentile)" charts therefore show three points at most.
  **Fix:** chart the 25th–75th range (or its midpoint) so the series spans
  all years.
- **11,151 all-NULL admissions rows for 2010–2013**: the pre-2014 fallback
  reads `IC{year}`, which has a row for every institution, and the filter
  `r.APPLCN !== undefined` (`load-year.ts:162`) only tests that the column
  exists. **Fix:** filter on `cleanInt(r.APPLCN) !== null`.

---

## B. Crashes and robustness

> **Concrete proposals added 2026-10-13.** Nothing in this section has been
> changed yet. Each item now has the exact change proposed, what it was checked
> against, and anything to decide. Line numbers are as of commit `a2a439e`.

### B1. Bad URL parameters produce a 500 instead of a 404 / page 1 — confirmed

> **Implemented 2026-10-13** as proposed, with the redirect. Verified locally: bad ids → 404, bad page numbers → page 1, a page past the end → 307 to the last page.

Re-checked 2026-10-13 against the local server: `/institutions/abc` → 500,
`/institutions/99999999999` → 500 (new: `value … is out of range for type
integer`), `/institutions?page=0` → 500, `/institutions?page=9999` → 200 with
"Page 9999 of 136" over an empty table.

**Proposed — institution page** (`src/app/institutions/[unitid]/page.tsx:15`).
Validate the text before it becomes a number. Nine digits is comfortably
inside a Postgres `integer` (IPEDS ids are six), and the pattern also rejects
`123abc`, which `parseInt` silently reads as 123:

```ts
const { unitid: unitidParam } = await params;
if (!/^\d{1,9}$/.test(unitidParam)) notFound();
const unitid = Number(unitidParam);
```

**Proposed — browse page** (`src/app/institutions/page.tsx:11`). Anything
that is not a whole number ≥ 1 becomes page 1:

```ts
const requested = Number(params.page);
const page = Number.isInteger(requested) && requested >= 1 ? requested : 1;
```

and, after the query returns, send a page past the end to the last real page
rather than rendering an empty one:

```ts
if (page > totalPages) redirect(pageHref({ page: String(totalPages) }));
```

(`redirect` from `next/navigation`; `pageHref` has to move above this line.)

**To decide:** redirect, as above, or silently show the last page under the
out-of-range URL. Redirect keeps the address bar honest and costs one extra
round trip only for a bad link; I'd redirect.

Not a problem, checked: a repeated parameter (`?state=NY&state=CA`) returns
200.

### B2. Search treats `%` and `_` as wildcards — confirmed

> **Implemented 2026-10-13:** escape and trim. The 100-character cap was not requested and is not included.

Checked against the database: `a_m` currently matches 69 institutions in 2024
(any one character between an `a` and an `m`, as in "Alab**ama**") and 0 once the
underscore is escaped, which is the right answer since no name contains a
literal `a_m`.

**Proposed** (`src/db/queries.ts:48`). Backslash is Postgres's default `LIKE`
escape character, so no `ESCAPE` clause is needed:

```ts
const q = params.q?.trim().slice(0, 100);
if (q) conditions.push(ilike(institutionYears.name, `%${q.replace(/[\\%_]/g, "\\$&")}%`));
```

The `trim` and the 100-character cap are additions: a search of only spaces
currently filters on `%   %`, and nothing bounds the length of what is sent to
the database.

### B3. `global-error.tsx` renders unstyled — confirmed against the Next docs

> **Deferred 2026-10-13** at the user's request.

The bundled Next 16.4 docs (`error.md`) say the global error UI "must define
its own `<html>` and `<body>` tags, global styles, fonts" and that it does
"not include your global styles".

**Proposed** (`src/app/global-error.tsx`):

```tsx
"use client";

import "./globals.css";
```

and `className="h-full"` on its `<html>`, without which the `min-h-full`
already on `<body>` has nothing to fill and the message sits at the top of the
page instead of centred.

**How to test:** this boundary only catches errors thrown by the root layout,
so the practical check is to add a temporary `throw` to `layout.tsx` in a
production build (`npm run build && npm start`; dev shows its own overlay
instead), look, and remove it.

### B4. `load-year.ts` exits 0 when years fail — by reading

> **Implemented 2026-10-13:** non-four-digit arguments are rejected up front, and a failed year now sets a non-zero exit code. The missing `.catch` in the two neighbouring scripts is still open.

**Proposed** (`scripts/etl/load-year.ts:446-463`). Reject bad arguments before
any work starts, and report failure through the exit code:

```ts
const years = args.map(Number);
const bad = args.filter((a) => !/^\d{4}$/.test(a));
if (bad.length > 0) {
  console.error(`not a four-digit year: ${bad.join(", ")}`);
  process.exit(1);
}
…
if (failed.length > 0) {
  console.log(`\nCompleted with failures for years: ${failed.join(", ")}`);
  process.exitCode = 1;
}
```

Why it matters: the documented routine is `load-year.ts` followed by
`materialize.ts`. Anyone chaining the two with `&&`, or running them from a
script, gets a materialize over incomplete data after a partial load, because
the loader reports success.

Same gap, same one-line fix, in two neighbours: `truncate-all.ts` and
`sanity-check.ts` call `main()` with no `.catch`, so an error there is an
unhandled rejection rather than a clean non-zero exit.

### B5. Provisional/final status is hardcoded — confirmed

> **Implemented 2026-10-13**, including the temp-name download and extract from A10. Verified on a real run: 2024 logs `using PROVISIONAL release (no Final published yet)`. Cache folders were renamed in place (`2024-Provisional/`, `2023-Final/` …). The `sanity-check.ts` listing of provisional years was not requested and is not included.

Checked the NCES server 2026-10-13: it returns a clean 404 for a file that
does not exist (`IPEDS_2024-25_Final.zip` → 404, `IPEDS_2025-26_Provisional.zip`
→ 404) and 200 for one that does, so the release status can be discovered
rather than hardcoded. It also keeps both once a year is finalised — 2023-24
has a Final (94 MB) *and* still a Provisional (76 MB) — so "whichever exists"
is not enough; Final has to be preferred.

**Proposed** (`zipInfoForYear` / `ensureAccdb`, `load-year.ts:20-51`):

1. Resolve the status per run: use a cached Final if there is one; otherwise
   ask the server for Final (`fetch(url, { method: "HEAD" })`); otherwise fall
   back to Provisional. Log which, loudly for Provisional:
   `2024: using PROVISIONAL release (no Final published yet)`.
2. Put the status in the extract directory's name (`2024-Provisional/`,
   `2024-Final/`) as it already is in the zip's. Today both extract to
   `2024/`, so a cached provisional extraction would be reused forever even
   after the Final zip is downloaded beside it.
3. If the HEAD request itself fails (offline), fall back to whatever is
   cached and say so, rather than failing a run that needs no download.

This is the same function as **A10** (a failed download leaves an empty
extract directory that blocks every later run), and I would fix both in one
change: extract into `…​.tmp` and rename on success. That bug was hit for real
on 2026-10-12, when an interrupted load left an empty `2011/`.

**Consequences to accept:** one small HEAD request per year per run while a
year is still provisional; and the existing cache directories (`2010/` …
`2024/`) are re-extracted once under their new names, from zips already on
disk, so no re-download.

**To decide:** when a Final replaces a Provisional that is already loaded,
the numbers for that year change. The loader would pick it up on the next run
of that year, but nothing prompts that run. If you want it noticed, the
simplest thing is for `sanity-check.ts` to print which years in the cache are
still provisional.

---

## C. Unused or redundant code, CSS and data

### C1. Dead query code left behind by the scatter replacement (`cf23cad`) — confirmed by grep

- `getPeers`, `getAcademicPeers`, `peersFromTable` (`queries.ts:145-180`) —
  no callers.
- `SimilarityPoint.distance` (`queries.ts:190-191, 218, 251`) — computed and
  shipped to the client, never displayed.
- `InstitutionSearchParams.pageSize` — never passed; `page` in the return
  value of `searchInstitutions` — never read.

### C2. `peer_network` is computed and stored but nothing reads it — confirmed

With `getPeers` unused, no page reads `peer_network` (48,096 rows). It is the
most expensive step in `materialize.ts` (a ~4,000² self-join,
`materialize.ts:92-204`). `DATA/similarity_proposal.md` may intend to revive
it, so this is your call: **either** drop the table, its schema entry and
that block, **or** leave it and add a one-line comment saying it is parked.

### C3. Two wasted queries on every institution page — confirmed by grep

`getInstitutionTimeSeries` (`queries.ts:92, 99`) fetches `institution_years`
and `faculty` for all years; the page uses neither `series.institution` nor
`series.faculty`. Meanwhile `getInstitution` (`queries.ts:71-78`) fetches
every year's `institution_years` row *again* just to take the newest.
**Fix:** drop both from the time-series fetch and add `.limit(1)` to
`getInstitution`. That takes the page from 13 HTTP round-trips to 11.

Also worth considering: the institution page is fully dynamic, so all of
these run on every view of data that changes once a year. Caching it the way
`/compare` is (`revalidate`) fits the project's own precompute rule.

### C4. The `"other"` institution type is dead everywhere — confirmed

There are **0** `other` rows in any year (the `DEGGRANT` gate removed them,
and the `institution-scope` skill says they must not exist). Yet it is still
carried in: `INSTITUTION_TYPES`, `INSTITUTION_TYPE_LABELS.other`,
`INSTITUTION_TYPE_COLORS.other` (`src/lib/institution-types.ts:5, 12, 22`),
the `Exclude<…, "other">` on `compare/page.tsx:13`, the
`.filter((t) => t !== "other")` on `institutions/page.tsx:65`, and three
`institution_type in (…)` filters in `materialize.ts`. **Fix:** remove
`other` from the type; have `institutionType()` in `load-year.ts` throw (or
skip the row with a warning) if it ever would return it.

### C5. Unused exports and constants — confirmed by grep

- `SECTOR_LEVEL_LABELS` (`institution-types.ts:31-35`) — unused.
- `CHART_INK.surface` (`src/lib/colors.ts:18`) — unused; both charts write
  the literal `"var(--surface)"` instead. Use it or remove it.
- `CONTROL_LABELS` exists but `institutions/page.tsx:104` re-implements it as
  a nested ternary. Use the constant.
- The type-label lookup with its `as keyof typeof …` cast is repeated three
  times (`compare/page.tsx:34`, `institutions/page.tsx:101`,
  `[unitid]/page.tsx:27`) — one `institutionTypeLabel(t: string)` helper.

### C6. Fonts and CSS that are loaded but never applied — confirmed by grep

- **Geist and Geist Mono are downloaded and never used.** `layout.tsx:6-14`
  loads both and `globals.css:26-27` maps them to `--font-sans` /
  `--font-mono`, but `globals.css:55` then sets
  `body { font-family: system-ui, … }`, and no element uses `font-sans` or
  `font-mono`. Decide which you want: delete the `next/font` setup (keeps the
  current look), or delete line 55 (switches the site to Geist).
- `--color-background` / `--color-foreground` (`globals.css:24-25`) — no
  `bg-background` / `text-foreground` class is used anywhere; the code uses
  `var(--background)` directly.
- `--series-5`, `--series-7`, `--series-8` are reachable only through
  `SERIES_COLORS`, and no chart has more than three series; `--series-4` is
  used only by the dead `other` colour (C4). Harmless as palette headroom —
  listed for completeness, I'd keep them.

### C7. Redundant indexes — confirmed

`peer_network_unitid_year_idx` (2.0 MB) and
`academic_similarity_unitid_year_idx` (1.4 MB) index `(unitid, year)`, which
is already the leading prefix of each table's primary key
`(unitid, year, rank)` (`schema.ts:267, 300`). Postgres uses the PK for those
lookups; the extra indexes only cost write time. **Fix:** remove both from
the schema.

### C8. Stored data nobody reads

> **2026-10-12:** the seven undeclared tables were dropped. `graduation_rates` still has eight columns that `schema.ts` does not define.

- The `faculty` table (67,178 rows, 10 MB) is loaded every run and read by
  nothing except the wasted fetch in C3.
- Most columns of `institution_years` (`zip`, `sector`, `iclevel`,
  `inst_size`, `hbcu`, `tribal`, `ug_offer`, `gr_offer`, `highest_offering`,
  `carnegie_classification`, `longitude`, `latitude`) and most of
  `enrollment`, `finance`, `pricing`, `graduation_rates` are loaded but never
  shown. That's reasonable for a warehouse you intend to chart later — the
  point is only that the A1 bug hid in exactly this unread data.
- **Seven tables exist in the database but not in the repo:** `completers`,
  `enrollment_12month`, `enrollment_by_race`, `entering_class`,
  `institution_offerings`, `net_price`, `outcome_measures` (~10 MB together).
  Nothing in `schema.ts`, the scripts, or git history mentions them. If they
  are leftovers, note that `drizzle-kit push` will offer to drop them; if
  they belong to in-progress work, the schema for them isn't committed.
  (There are also empty auth tables — `user`, `session`, `account`,
  `organization`, … — that look like Neon Auth scaffolding.)

### C9. `npm run lint` fails with 31 errors — confirmed

All are `@typescript-eslint/no-explicit-any` in `scripts/etl/` (26 in
`load-year.ts`, 3 in `materialize.ts`, 2 in `upsert.ts`). `src/` is clean.
**Fix:** either give the ETL rows a `Record<string, unknown>` type (which
would also have surfaced A1 if paired with a checked accessor), or exclude
`scripts/` in `eslint.config.mjs` — whichever, so that lint is usable as a
signal again.

### C10. Packages and files — confirmed by grep

- `d3`, `@types/d3` and `zod` are in `package.json` and imported nowhere.
- `adm-zip` and `mdb-reader` are ETL-only but listed under `dependencies`, so
  they ship in the deployed install; `dotenv`/`tsx` are already dev-only.
- `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` —
  create-next-app leftovers, referenced nowhere.
- `scripts/explore-dict.mjs` is a strict subset of `scripts/dict-ci.mjs`
  (same lookup, case-sensitive). Both, and `explore-columns.mjs`, hardcode
  `varTable23`, so they only work on the 2023 file, and none are mentioned in
  the README.
- `next.config.ts` is the empty template.
- `README.md` lines 1 and 58-70 are create-next-app boilerplate around the
  real project documentation.

### C11. Small redundancies in the scripts — by reading

- `DEFAULT_YEAR` is defined twice with a "must match" comment
  (`queries.ts:27`, `materialize.ts:25`). Move it to one module both import.
- `materialize.ts:52-56` queries all years just to log "materializing for
  years: 2010 … 2024", which is misleading — only `nationwide_trends` uses
  them all.
- `for (const year of [DEFAULT_YEAR])` plus running totals
  (`materialize.ts:93-94, 211-212, 204, 321`) are left over from the all-years
  version; a plain block would read more honestly.
- `load-year.ts:42` does `await import("fs/promises")` though `readdir` is
  already statically imported from it on line 5.
- `upsert.ts:1-2` imports from `drizzle-orm` twice.
- `NationwideTrendRow` and the field-by-field copy in `getNationwideTrends`
  (`queries.ts:116-143`) duplicate the Drizzle row type; only the
  `institutionType` narrowing adds anything.

---

## D. Confusing code and stale documentation

### D1. `/compare` shows each legend twice — by reading

The page draws its own legend (`compare/page.tsx:44-54`), and every
`TimeSeriesChart` with more than one series draws Recharts' `<Legend>` too
(`time-series-chart.tsx:90`) — six more copies of the same three entries.
**Fix:** add a `showLegend` prop and turn it off on `/compare`.

Also `seriesFor(typeLabel)` (`compare/page.tsx:24-34`) threads a label
function through as a parameter only to look up `INSTITUTION_TYPE_LABELS[t]`;
it can be a module-level constant.

### D2. `byYear()` does nothing — by reading

`[unitid]/page.tsx:9-11` is an identity function whose only effect is to
widen the type to `Record<string, unknown>[]`; the name suggests it groups or
sorts. **Fix:** loosen `TimeSeriesChart`'s `data` prop type and delete it, or
rename it to say it's a cast.

### D3. Orphaned comment in the scatter — by reading

`similarity-scatter.tsx:26-30` explains why animation is off, but floats
between two unrelated constants, forty lines from the
`isAnimationActive={false}` props it justifies (`:255, 263`). Move it there.
Note that `TimeSeriesChart`'s lines still animate (Recharts' default), so the
screenshot/print problem the comment describes still applies to the other
ten charts.

### D4. `connectNulls` hides missing years — by reading

`time-series-chart.tsx:100` draws a straight line across years with no data,
so a gap (an institution that skipped a survey, the 2010–13 admit-rate hole
in A11) looks like a measured trend. The dots do mark real points, so this is
a judgement call — but worth making deliberately.

### D5. Smaller display rough edges — by reading

- The "Yield" stat (`[unitid]/page.tsx:30-33`) takes the most recent year
  that has one, without saying which year.
- `{r.city}, {r.state}` (`institutions/page.tsx:98`, `[unitid]/page.tsx:43`)
  would print a bare comma for a null city. No 2024 row has one, so this is
  latent only.
- The results table is wrapped in `overflow-hidden`
  (`institutions/page.tsx:79`), so on a narrow phone the right-hand columns
  are clipped rather than scrollable — `overflow-x-auto` instead.
- 1,768 institutions have no 2024 row (closed or merged). Their pages still
  load by URL and show history, but can't be found through Browse, and their
  header gives no hint that the data ends in an earlier year.
- Only 1,756 of 4,090 institutions in 2024 report both yield and graduation
  rate, so the scatter's text fallback is the common case, not the exception.
  This is documented as intended; mentioned because it affects how much the
  chart is worth polishing.

### D6. Comments and docs that no longer match the code — by reading

- `institution-types.ts:1` and `schema.ts:13` point to "memory
  `project-terminology`" / "project memory", which doesn't exist. They should
  point to `.claude/skills/institution-scope`.
- `materialize.ts:1-3` says it precomputes "nationwide_trends and
  peer_network … these two tables" — there are three.
- `.claude/skills/academic-similarity/SKILL.md`, section "Not yet exposed in
  the UI", says no page queries `academic_similarity` and that `getPeers()`
  reads `peer_network`. The opposite is now true.
- `.claude/skills/precompute-over-live-query/SKILL.md` says `peer_network`
  "backs the peer-similarity section of `/institutions/[unitid]`". It no
  longer does (C2).
- `cleanNum`'s doc comment (`upsert.ts:15`) says it leaves legitimate
  negatives alone, but it nulls *any* value in (−10, 0) — a real −5% equity
  ratio would be dropped. Fine for count columns; wrong for
  `equity_ratio`-style ratios. Either restrict it to the exact integer
  sentinels or apply it per column.
- JS `stddev` in `materialize.ts:27-33` is the population formula; SQL
  `stddev()` used for `peer_network` is the sample formula. Immaterial at
  n ≈ 2,000 but the two indexes are described as following the same method.

---

## Suggested order

1. **A1, A2, A11** together — all three are `load-year.ts` fixes that need a
   full re-load, so do them in one pass, then re-materialize.
2. **A8, A9** before that re-load, so it starts from clean tables.
3. **A3–A7, B1–B3** — small, independent, user-visible; no data changes.
4. **C1–C7, C10–C11, D1–D3, D6** — deletions and tidying; low risk.
5. **C2, C8, D4** — need a decision from you rather than a fix.
