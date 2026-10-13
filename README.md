This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the database

All data lives in a Neon Postgres database; nothing is read from disk at
runtime. Copy the example env file and paste in your own connection string:

```bash
cp .env.example .env.local
```

`.env.local` is gitignored — don't commit the real credential, this repo is
public.

If the database is empty, create the schema with `npx drizzle-kit push`
(there is no `drizzle/` migrations directory; the schema in
`src/db/schema.ts` is pushed directly).

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Loading IPEDS data

`scripts/etl/load-year.ts` downloads the IPEDS zip for a given year straight
from nces.ed.gov into `ipeds_data/ipeds-cache/` (gitignored, rebuilt on
demand) and loads the Access database inside it.

```bash
npx tsx scripts/etl/load-year.ts 2010 2011 2012   # one or more years
npx tsx scripts/etl/materialize.ts                # ALWAYS follows a backfill
npx tsx scripts/etl/sanity-check.ts               # optional spot check
```

`materialize.ts` is not optional. It precomputes `nationwide_trends` and
`academic_similarity`, which the app reads with plain indexed selects — they
never update themselves, so skipping it leaves `/compare` and every
institution's peer table silently serving stale data. See
`.claude/skills/precompute-over-live-query`.

Pages are cached until the data changes, so `materialize.ts` ends by asking
the deployed site to drop its cache (`SITE_URL` and `REVALIDATE_SECRET` in
`.env.local`; see `.env.example`). If it reports the site was **not**
refreshed, the new data appears only after the next deploy.

`load-year.ts` upserts but never deletes. If a change alters *which*
institutions are in scope, run `npx tsx scripts/etl/truncate-all.ts` first,
then backfill every year — otherwise orphaned rows survive. See
`.claude/skills/institution-scope`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
