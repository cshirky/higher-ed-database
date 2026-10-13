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

> **Concrete proposals added 2026-10-13.** Nothing in this section has been
> changed yet. Every observation was re-checked against commit `042c967` and
> the live database; several had moved since the review, and two new ones
> turned up (C8). Items are marked **safe** (delete-only, no behaviour
> change), **decide** (needs a choice from you), or **data** (touches the
> database).

### C1. Dead query code — safe

> **Partly done 2026-10-13:** the three peer functions went with C2. The `pageSize` / `page` tidy-up is still open.

Still true: `peersFromTable`, `getPeers`, `getAcademicPeers`
(`src/db/queries.ts:154-189`) have no callers. (`SimilarityPoint.distance`
from the original note is already gone.)

**Proposed:** delete those three functions and the now-unused `peerNetwork`
import. In `searchInstitutions`, replace the never-passed `pageSize` option
with a module constant and stop returning `page`, which no caller reads:

```ts
const PAGE_SIZE = 25;
…
return { rows, total: count, pageSize: PAGE_SIZE };
```

### C2. `peer_network` is computed and stored but nothing reads it — decide, data

> **Done 2026-10-13:** table dropped; removed from the schema, `materialize.ts`, `truncate-all.ts`, the README and the three skills. `DATA/similarity_proposal.md` has a dated note rather than a rewrite.

Still true, and it now has a cost: the `peer_network` step is a
3,381 × 3,381 self-join, and on one of the last four `materialize.ts` runs the
database took long enough over it to time out the connection, aborting the run
before it reached `academic_similarity`, which the app does use.

**Proposed: drop it.** `DATA/similarity_proposal.md` describes replacing both
fixed-weight indexes with a new design, so this table is not the thing that
would be revived; and it is fully recoverable from git plus a materialize run.
Concretely:

- `drop table peer_network` (39,708 rows, 9.6 MB);
- remove `peerNetwork` from `src/db/schema.ts`;
- remove the `peer_network` block and `PEER_LIMIT` from `materialize.ts`
  (about 115 lines, and most of its runtime);
- remove it from `truncate-all.ts`, and update the four places that describe
  it as live: `README.md:48`, the `precompute-over-live-query` skill, the
  `academic-similarity` skill, and the note in `queries.ts:23-27`.

**Alternative:** keep the table and its data but stop recomputing it (delete
only the materialize block). The data then goes stale silently, so I would
not.

### C3. Wasted queries on every institution page — safe, plus one decide

> **Done 2026-10-13.** The two unused queries are gone and `getInstitution` takes one row. Caching went further than proposed, at the user's direction: no timer at all — institution pages and `/compare` are cached until `materialize.ts` calls the new `/api/revalidate` endpoint (or a deploy happens). Verified on a local production build: first view 0.65s, cached views 0.005s, and a refresh call makes the next view re-render. **Needs `REVALIDATE_SECRET` set in Vercel to work in production.**

Still true. An institution page now makes 15 database round trips;
`getInstitutionTimeSeries` (`queries.ts:89-123`) fetches every year of
`institution_years` and of `faculty`, and the page reads neither.
`getInstitution` (`:80-87`) fetches every year's row to use the newest.

**Proposed (safe):** drop the `institution` and `faculty` entries from
`getInstitutionTimeSeries`, and add `.limit(1)` to `getInstitution`. 15 round
trips become 13, and two of the larger result sets disappear.

**Proposed (decide): cache the institution page.** Its data changes when the
ETL runs, about once a year, yet every view re-queries all of it. The bundled
Next 16.4 docs give the form for a dynamic route outside Cache Components
(which this project does not enable): a `revalidate` plus an empty
`generateStaticParams`, so each institution is rendered on first request and
then served from cache:

```ts
export const revalidate = 3600; // same reasoning as /compare
export function generateStaticParams() {
  return [];
}
```

The trade-off is the one `/compare` already accepts: after a re-load, a page
can show the old numbers for up to an hour. Worth doing if page speed
matters to you now; harmless to leave.

### C4. The `"other"` institution type is dead everywhere — safe

Still true: 0 rows in any year, and the scope rules say there must be none.

**Proposed:**

- `src/lib/institution-types.ts`: remove `"other"` from `INSTITUTION_TYPES`,
  and its entries in the label and colour maps.
- `src/app/compare/page.tsx:13`: `TYPES` becomes just `INSTITUTION_TYPES`.
- `src/app/institutions/page.tsx:71`: drop `.filter((t) => t !== "other")`.
- `scripts/etl/materialize.ts:80, 133`: drop the two
  `institution_type in (…)` filters.
- `scripts/etl/load-year.ts:165`: `institutionType()` can still *return*
  `"other"` for a degree-granting institution flagged as offering neither
  undergraduate nor graduate programmes. Rather than store it, skip the
  institution and log it:
  `!! 2024: 2 institutions skipped — degree-granting but no UG or grad offering`.
  Skipping, not throwing: one odd HD row should not abort a whole year.

### C5. Unused exports and constants — safe

Re-checked. Two changes since the review: `CHART_INK.textSecondary` is now
unused as well (the scatter was its only user), and `CONTROL_LABELS` still
carries `3: "Private for-profit"`, which the for-profit rule makes
unreachable.

**Proposed:**

- Delete `SECTOR_LEVEL_LABELS`, `CHART_INK.surface`, `CHART_INK.textSecondary`.
- Delete the `3:` entry from `CONTROL_LABELS`, and replace the nested ternary
  at `institutions/page.tsx:110` with `CONTROL_LABELS[r.control] ?? "—"`.
- Add one helper beside the label map and use it in the three places that
  repeat the cast (`compare/page.tsx:34`, `institutions/page.tsx:107`,
  `[unitid]/page.tsx:30`):

```ts
export function institutionTypeLabel(type: string) {
  return INSTITUTION_TYPE_LABELS[type as InstitutionType] ?? type;
}
```

### C6. Fonts and CSS that are loaded but never applied — decide

> **Done 2026-10-13:** Geist removed, along with the unused `@theme` block. The site looks as it did.

Still true: no element uses `font-sans`, `font-mono`, `bg-background` or
`text-foreground`, and `body` sets `font-family: system-ui, …`
(`globals.css:55`).

**Proposed: keep the look the site has today and remove Geist.** Delete the
two `next/font` loaders and the `className` variables in `layout.tsx`, and the
whole `@theme inline` block in `globals.css` (all four of its lines are then
unused). The site renders exactly as it does now and stops downloading two
font families.

**Alternative:** delete `globals.css:55` instead, which switches the whole
site to Geist. That is a visible change, so it is your call; say so and I
will do that one instead.

The spare palette variables (`--series-4` to `--series-8`) stay: they are the
documented categorical order, and removing them would only have to be undone
when a chart needs a fourth series.

### C7. Redundant indexes — safe, data

> **Done 2026-10-13:** `academic_similarity_unitid_year_idx` dropped and removed from the schema; the other went with the `peer_network` table.

Still true: `peer_network_unitid_year_idx` (2.0 MB) and
`academic_similarity_unitid_year_idx` (2.8 MB, doubled since the table went
60 deep) duplicate the leading columns of their primary keys.

**Proposed:** remove both `index(…)` lines from `schema.ts` and run

```sql
drop index academic_similarity_unitid_year_idx;
drop index peer_network_unitid_year_idx;  -- moot if C2 drops the table
```

directly rather than through `drizzle-kit push`. **Do not use `push` until C8
is settled:** it compares the whole schema, and would also offer to drop the
seven undeclared `graduation_rates` columns below.

### C8. Stored data nobody reads — decide, data

> **2026-10-13:** the seven undeclared `graduation_rates` columns were dropped, so `drizzle-kit push` is safe to use again. The cache clean-up is still open.

Re-checked, with two corrections and one new finding.

- **Undeclared columns (correction: seven, not eight).** `graduation_rates`
  has `bachelor_rate_200pct`, `less_than_4yr_rate_100pct`, `…_150pct`,
  `…_200pct`, `pell_adjusted_cohort`, `subsidized_loan_no_pell_grad_rate`,
  `no_pell_no_loan_grad_rate`, with values in 1,822 of 44,434 rows (2023
  only). They are not in `schema.ts` and no script writes them — the same
  one-off experiment as the seven tables already dropped.
  **Proposed:** drop the seven columns. If any is wanted, the alternative is
  to add it to the schema and the loader so it is filled for every year.
- **`faculty`** (51,661 rows, 11 MB) is still read by nothing once C3 lands,
  but since the A1 fix it holds real salary data for all 15 years.
  **Proposed:** keep loading it; it is cheap and is plausible page content.
- **New — the download cache is 9.3 GB and the disk is 88% full** (2.6 GB
  free of 21 GB). The zips are 1 GB; the other 8.3 GB is the extracted Access
  files, which are only needed while a year is loading.
  **Proposed:** have `load-year.ts` delete a year's extracted folder after
  that year loads successfully, keeping the zip. A re-load then re-extracts
  (seconds per year) instead of re-downloading. This frees about 8 GB now and
  keeps it from growing by ~600 MB per future year.
- The unread columns in `institution_years`, `enrollment`, `finance`,
  `pricing` and `graduation_rates` stay — that is what a warehouse is for.
  The nine empty tables in the separate `neon_auth` schema are Neon Auth
  scaffolding, not this project's, and are left alone.

### C9. `npm run lint` fails — safe

Now 32 errors, all `no-explicit-any` in `scripts/etl/`; `src/` is clean.

**Proposed: turn that one rule off for the ETL scripts** in
`eslint.config.mjs`, so lint passes and means something again:

```js
{
  files: ["scripts/**"],
  rules: { "@typescript-eslint/no-explicit-any": "off" },
},
```

The original note suggested typing the rows instead, on the grounds that it
would have caught the A1 casing bug. That job is now done at run time by
`strictRow`, which catches more (it knows the real columns of each table,
which a type cannot). Typing 30-odd call sites would add work and a full
re-load to verify, for no further protection.

### C10. Packages and files — safe

Still true throughout.

**Proposed:**

- `npm uninstall d3 @types/d3 zod` — imported nowhere.
- Move `adm-zip` and `mdb-reader` to `devDependencies` — only the ETL scripts
  use them. (Vercel installs dev dependencies for the build, and nothing at
  run time imports them.)
- Delete `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`,
  `window.svg`.
- Delete `scripts/explore-dict.mjs` (a case-sensitive subset of
  `dict-ci.mjs`). In `dict-ci.mjs`, find the dictionary table by pattern
  instead of the hardcoded `varTable23`, so it works on any year's file:
  `reader.getTableNames().find((n) => /^vartable\d\d$/i.test(n))`.
- `README.md`: remove the create-next-app boilerplate (line 1 and the "Learn
  More" / "Deploy on Vercel" sections from line 58), and add two lines on the
  `scripts/explore-*.mjs` / `dict-ci.mjs` helpers.
- `next.config.ts` stays as it is; an empty config is the normal form.

### C11. Small redundancies in the scripts — safe

Re-checked; the dynamic `import("fs/promises")` was already removed with B5.

**Proposed:**

- **One `DEFAULT_YEAR`.** Move it (and `academicYearLabel`) to a new
  `src/lib/default-year.ts` that both `src/db/queries.ts` and
  `scripts/etl/materialize.ts` import. It cannot simply be imported from
  `queries.ts`, which opens a database connection on import.
- `materialize.ts:56-61`: delete the query that lists every year just to log
  it; log `materializing nationwide_trends (all years) and similarity for
  ${DEFAULT_YEAR}` instead.
- `materialize.ts:99, 217`: replace `for (const year of [DEFAULT_YEAR])` and
  the running totals with plain blocks using `DEFAULT_YEAR`.
- `upsert.ts:1-2`: merge the two `drizzle-orm` imports.
- `queries.ts:125-152`: replace the hand-written `NationwideTrendRow` and the
  field-by-field copy with the row type Drizzle already infers, narrowing
  only `institutionType`.

### Suggested grouping

1. **One commit, no decisions:** C1, C3 (safe part), C4, C5, C9, C10, C11.
   Delete-only or mechanical; verified by typecheck, lint, and loading the
   three pages.
2. **Decide, then one commit each:** C2 (drop `peer_network`), C6 (fonts),
   C3 (cache the institution page).
3. **Database:** C7 (two indexes) and C8 (seven columns) together, then C8's
   cache clean-up.

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
