# Memo: centralizing college data in the cloud

2026-11-09. Decision memo, not a plan. Figures marked (verify) are from memory
and should be checked against current vendor pricing before committing.

## Where things stand

| Project | How it gets its data today |
|---|---|
| `higher-ed-database` | **Already cloud-backed.** Next.js + Drizzle + Neon Postgres (13 tables, IPEDS only, ~4,000 in-scope institutions), loaded by `scripts/etl/`. |
| `college-dashboard` | Observable Framework static site. A stdlib-Python pipeline joins Carnegie 2025 with IPEDS 2023 and writes CSVs that are committed to git (~25 MB of raw files, plus xlsx in the repo root). |
| `comparator_vercel` | Static page + a small Vercel Python API over a 377 KB `schools.json`. |
| `school_comparisons` | Python scripts that write JSON/CSV (`comparison_groups_2024.json`, 308 KB) for static HTML pages. |
| `scratch` | Static AAUP faculty-employment charts; data embedded in the HTML. |

So the real choice is not "files vs. cloud". It is whether to make the
Neon database the one place every tool and every data source goes through.

Two facts shape everything below:

1. **The data is small and changes rarely.** IPEDS, Scorecard and Carnegie
   release roughly once a year. Even with every source loaded, this is a
   gigabytes-at-most, read-mostly dataset. Scale is not the argument for the
   cloud; consistency and shared identity are.
2. **The hard problem is joining sources, not storing them.** IPEDS and
   Scorecard share the UNITID key, but Carnegie, USNWR and Wikipedia need a
   crosswalk (names, aliases, mergers, closures, branch campuses). Whatever
   you choose, that crosswalk table is the most valuable thing you'll build.

## 1. Centralize in the cloud and rewrite the tools to call it?

### Pros
- **One definition of an institution.** A single `institutions` spine plus
  per-source tables ends the situation where each tool has its own idea of
  "a school", its own slug file, and its own join logic.
- **Adding a source becomes a data task, not a tool task.** Load Scorecard once
  and every interface can use it.
- **Computed results are shared.** Similarity/peer distances, comparison groups
  and Carnegie peers are currently rebuilt per tool.
- **Repos get lighter.** Today's college-dashboard history carries tens of MB
  of raw downloads. Raw files can move to object storage.
- **You already have the pieces**: a schema, ETL scripts, Drizzle, a Neon
  project and skills for both.

### Cons
- **You trade zero-ops static sites for a live dependency.** The Observable and
  plain-HTML tools run free on GitHub Pages and cannot break. With a database
  they need an API layer, secrets, and something that can be down, paused or
  billed.
- **Rewrite cost is real and mostly mechanical but not trivial**: five tools,
  two languages (Python pipelines, JS front ends), and every page that assumes
  a CSV column name.
- **Exploration gets slower.** Experiments in a notebook or a CSV are fast and
  disposable; a schema change means a migration and an ETL rerun. Messy,
  colloquial sources (USNWR, Wikipedia) change shape often.
- **Licensing travels with the data.** Scorecard/IPEDS/Carnegie are public.
  Wikipedia text is CC BY-SA (attribution and share-alike if you redistribute).
  USNWR rankings are proprietary: a public database or public API built on them
  is a terms-of-service question, not just a technical one. A private store is
  much safer for that source. (verify)
- **Lock-in is mild but not zero** (Drizzle/Postgres port easily; Neon-specific
  features and any Vercel Marketplace wiring do not).

### A middle option worth naming
"Central" does not have to mean "live database". A canonical, versioned
**Parquet/CSV snapshot set in object storage**, built by one pipeline, with
static sites reading snapshots at build time and Postgres used only for the apps
that need live queries. This keeps the static tools static, keeps one source of
truth, and makes the database a derived artifact you can rebuild. It is the
lowest-risk way to get most of the benefit.

**Recommendation:** yes to one central store and one crosswalk, built on the
Neon database you already have. Keep static tools static by feeding them
exported snapshots at build time rather than rewriting each to query live.
Rewrite to live queries only the interfaces that survive consolidation.

## 2. Before, as, or after merging the interfaces?

| | Pros | Cons |
|---|---|---|
| **Data first, then merge** | Interfaces get built once against the final shape. Forces the crosswalk and schema decisions early. Works even if you never merge. | Longest stretch with nothing visibly new. Risk of designing a schema for tools you later drop. |
| **Both at once** | One rewrite per page. Pages and tables co-designed. | Big-bang risk across five codebases; hard to ship partial progress; every bug has two possible causes. |
| **Merge first, data later** | Fast, visible win. Reveals which of the ~20+ pages you actually want, so you only port those. | Bakes CSV assumptions into the merged app, and the later data migration is a second rewrite. Merging Observable and Next.js is itself a framework decision. |

**Recommendation: a staged hybrid, "spine first, then port page by page".**

1. Add the institution crosswalk and the non-IPEDS sources (Carnegie, then
   Scorecard) to the existing Neon schema. No UI changes needed yet.
2. Make `higher-ed-database` the home of the merged interface (it is already
   the one with a database layer) and port pages from the other repos one at a
   time, each reading from the DB.
3. Until a page is ported, regenerate its CSV/JSON from the database so the old
   tool keeps working. This is the "strangler" approach, with no big-bang cutover.
4. Leave Wikipedia and USNWR for last: they are the messiest and the riskiest
   legally, and they will benefit most from the spine existing already.

Decide first which pages you'd merge. A page inventory (which of the 13
college-dashboard pages, the comparator and the network graph you actually use)
shrinks the rewrite more than any hosting choice does.

## 3. Where to host it

You already have a GCP project (`wikipedia-data-store`: GCS + BigQuery) and a
Neon/Vercel setup, so those two are not hypothetical.

| | Strengths | Weaknesses | Fit here |
|---|---|---|---|
| **Vercel** | Not a database itself. Postgres is provided through Marketplace partners such as Neon, which is what you use now. Scale-to-zero, branching, tight Next.js integration, near-zero ops. Blob storage for files. | Function time/size limits and egress charges at scale; another bill and dashboard; heavy ETL doesn't belong there. Free-tier sleep adds first-query latency. | Best for the **serving** side, and you already have it. |
| **Google Cloud** | Already in use. **BigQuery** suits whole-dataset analytics and similarity work, billed per query with a free monthly allowance (verify). GCS for raw files and snapshots. Cloud SQL if you want managed Postgres. | Cloud SQL runs (and bills) all the time, even idle. Auth/IAM and service accounts are fiddly for a hobby-scale static-site workflow. BigQuery is poor for low-latency web queries. | Good for **raw storage and analysis**, especially next to the Wikipedia data. Less good as the app's live DB. |
| **AWS** | Broadest toolbox: RDS/Aurora Postgres, S3 + Athena (query Parquet in place), Lambda. Most mature. | Most complexity and the easiest to get a surprising bill from. Nothing here that GCP or Neon doesn't already give you. | Hard to justify adding a third provider. |
| **DigitalOcean** | Simplest pricing: managed Postgres at a flat monthly rate (~$15+/mo, verify) plus Spaces (S3-compatible). Already on your hosting list. Easy to reason about. | No scale-to-zero, so you pay 24/7. Fewer analytics tools. Less integrated with Next.js/Vercel. | Reasonable if you want one boring flat bill, but it duplicates what you have. |

**Recommendation:** don't add a new provider.

- **Live database: stay on Neon** via Vercel. It is the cheapest and
  lowest-effort path for a small read-mostly dataset, and the existing code
  already targets it.
- **Raw downloads and snapshots: GCS** (or Neon's object storage, if it is out
  of beta by then), because you already pay the setup cost there and it keeps
  the large raw files out of git.
- Revisit **BigQuery** only if you start doing heavy whole-dataset analysis
  (network/similarity across all sources); Postgres handles ~4,000 schools
  comfortably.
- AWS and DigitalOcean only make sense if you want to leave the Vercel/Neon
  arrangement for cost-predictability or lock-in reasons; neither is better on
  the merits for this workload.

## Open questions for you
1. Which existing pages would you actually keep in a merged tool?
2. Is this strictly personal/research use, or will it be public? That decides
   the USNWR and Wikipedia question.
3. How much do you value the static sites staying free and serverless versus
   having one live system?
4. Is the 2025-Public-Data-File.xlsx / SAEC data the only Carnegie input, or do
   you also want earlier Carnegie years in the store?

## Suggested first steps
1. Page/feature inventory across the five repos (one afternoon).
2. Design the `institutions` crosswalk table and load Carnegie into Neon.
3. Add a script that exports a repo's CSV/JSON from the database, and use it on
   `college-dashboard` as the first proof that the old tools can keep running.

## Addendum: your answers (2026-11-09)

1. **Scope:** all current non-archived tools (`college-dashboard`, `comparator_vercel`,
   `school_comparisons`, `higher-ed-database`, `scratch`), developed and merged together.
   This fits the staged "spine first, port page by page" plan. `college-scatterplot`
   (archived) is out.
2. **Public:** USNWR rankings must stay out of any public table or API unless licensing
   is cleared; keep them in a private schema or link out. Wikipedia text needs CC BY-SA
   attribution. Wikidata (CC0) is the better source for structured facts, and its IPEDS ID
   property (verify) may give a free Wikipedia-to-UNITID crosswalk.
3. **One live system with controlled costs:** the risk is public traffic, not storage.
   Cache and precompute heavy views, keep the browser off raw SQL (use a read-only role
   behind an API), cap compute and set spend limits and budget alerts on Neon and Vercel.
4. **All years, all sources, slice by SQL:** store raw tall tables keyed by (UNITID, year),
   with raw downloads landing in GCS and the queryable layer in Postgres. Size it before
   committing: load one IPEDS year and one Carnegie year, measure, extrapolate to all years,
   then price Neon storage against that number. If Postgres gets too big or slow for
   whole-history analysis, add BigQuery for analysis and keep Postgres for serving slices.
