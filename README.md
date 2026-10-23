# Higher-Ed Database

A web app for exploring U.S. colleges, universities, and graduate schools using
[IPEDS](https://nces.ed.gov/ipeds/) data from the National Center for Education
Statistics. You can see it live at https://higher-ed-database.vercel.app.

- **Institutions** (`/institutions`): search and browse institutions. Each
  institution has a page with charts of its enrollment, admissions, cost,
  finance, and graduation outcomes over time, plus a table of its most similar
  peers.
- **Compare 3** (`/triangle`): pick three four-year colleges and see what is
  unique to each, what each pair shares, and what all three have in common,
  covering both traits and bachelor's majors.
- **Compare** (`/compare`): nationwide trends across all institutions.

The site covers degree-granting public and private nonprofit institutions. It
excludes for-profit institutions. The deployed database holds the IPEDS
collection years 2010 through 2024.

Built with Next.js, Neon Postgres, Drizzle ORM, Tailwind, and Recharts/D3.

## Requirements

- Node.js 20.9 or later
- A [Neon](https://neon.tech) Postgres database. The free tier is enough to
  start with.

## Install and run

### 1. Install dependencies

```bash
git clone https://github.com/cshirky/higher-ed-database.git
cd higher-ed-database
npm install
```

### 2. Configure the database

The app reads all its data from Postgres, not from local files. Copy the
example env file and paste in your own Neon connection string:

```bash
cp .env.example .env.local
```

`.env.example` explains each variable. Git ignores `.env.local`. Never commit
the real credential, because this repo is public.

### 3. Create the schema

On an empty database, create the tables:

```bash
npx drizzle-kit push
```

There is no `drizzle/` migrations directory. This command pushes the schema in
`src/db/schema.ts` directly. If it hangs, use the direct (non-`-pooler`) Neon
host in `DATABASE_URL`.

### 4. Load the data

The app is empty until you load at least one year of IPEDS data (see
[Loading IPEDS data](#loading-ipeds-data) below). To load everything the live
site has:

```bash
npx tsx scripts/etl/load-year.ts 2010 2011 2012 2013 2014 2015 2016 2017 \
  2018 2019 2020 2021 2022 2023 2024
npx tsx scripts/etl/materialize.ts
```

### 5. Run the dev server

```bash
npm run dev
```

Then open http://localhost:3000.

## Loading IPEDS data

`scripts/etl/load-year.ts` downloads the IPEDS zip for each year you give it
straight from nces.ed.gov. It saves the zip in `ipeds_data/ipeds-cache/`,
which git ignores and the script rebuilds as needed, and loads the Access
database inside it. Years are named by the fall that starts the collection
cycle, so `2023` means academic year 2023–24. When NCES has published a Final
release of a year, the script uses it; otherwise it uses the Provisional one.

```bash
npx tsx scripts/etl/load-year.ts 2010 2011 2012   # one or more years
npx tsx scripts/etl/materialize.ts                # ALWAYS follows a load
npx tsx scripts/etl/sanity-check.ts               # optional spot check
```

**Always run `materialize.ts` after a load.** It precomputes
`nationwide_trends` and `academic_similarity`, which the app reads with plain
indexed selects. Those tables never update themselves, so if you skip this
step, `/compare` and every institution's peer table quietly show stale data.
See `.claude/skills/precompute-over-live-query`.

Pages stay cached until the data changes, so `materialize.ts` finishes by
asking the deployed site to drop its cache. That needs `SITE_URL` and
`REVALIDATE_SECRET` in `.env.local` (see `.env.example`). If it reports that
the site was **not** refreshed, the new data appears only after the next
deploy. For local development you can ignore this, because `npm run dev`
doesn't cache.

`load-year.ts` inserts and updates rows but never deletes them. If a change
alters *which* institutions are in scope, run
`npx tsx scripts/etl/truncate-all.ts` first, then load every year again.
Otherwise rows for institutions that are no longer in scope stay in the
database. See `.claude/skills/institution-scope`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server at http://localhost:3000 |
| `npm run build` | Make a production build |
| `npm start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `node scripts/gen-cip-labels.mjs <file.accdb>` | Regenerate the major names in `src/lib/cip-series-labels.ts` from any year's IPEDS `.accdb`, which you can unzip from one of the zips in `ipeds_data/ipeds-cache/`. Rerun it if the CIP codes change. |

## Deploying

The live site runs on Vercel and deploys every push to `main`. In the Vercel
project's environment variables, set `DATABASE_URL`, and set
`REVALIDATE_SECRET` to the same value as in your `.env.local`.

## Project layout

```
src/app/          pages and API routes (Next.js App Router)
src/db/           Drizzle schema and queries
src/lib/          shared logic, such as the Compare 3 trait bands in triangle.ts
scripts/etl/      IPEDS download, load, and precompute scripts
.claude/skills/   notes on scope, similarity, and caching decisions
```
