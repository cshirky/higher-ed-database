# To do

## Set `REVALIDATE_SECRET` in Vercel

**Why:** institution pages and `/compare` are cached until the data changes.
`scripts/etl/materialize.ts` ends by asking the live site to drop that cache,
and the site only obeys a request carrying the right secret. Until the secret
is set in Vercel, the live site answers that request with a 503, and newly
loaded data shows up only after the next deploy.

**The value** is already generated and sitting in `.env.local` on this machine,
on the line that starts `REVALIDATE_SECRET=`. Use the text between the quotes.
It is deliberately not written here: this repo is public.

To print it:

```bash
grep '^REVALIDATE_SECRET' .env.local | cut -d'"' -f2
```

**Steps**

1. Open the project in Vercel: https://vercel.com/dashboard → `higher-ed-database`.
2. Go to **Settings → Environment Variables**.
3. Add a variable:
   - **Key:** `REVALIDATE_SECRET`
   - **Value:** the string from `.env.local`
   - **Environments:** Production (Preview and Development are optional)
   - Mark it **Sensitive** if offered.
4. Save.
5. **Redeploy.** Vercel only gives a new variable to deployments made after it
   was added: **Deployments → the latest one → ⋯ → Redeploy**, or just push
   any commit.

**Check it worked**

```bash
# Without the secret: should print 401 (before the variable is set it prints 503).
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://higher-ed-database.vercel.app/api/revalidate

# With it: should print {"revalidated":true}
curl -s -X POST https://higher-ed-database.vercel.app/api/revalidate \
  -H "authorization: Bearer $(grep '^REVALIDATE_SECRET' .env.local | cut -d'"' -f2)"
```

After that, the last line of every `npx tsx scripts/etl/materialize.ts` run
should read `site refreshed: https://higher-ed-database.vercel.app …` rather
than `!! site NOT refreshed`.

**If the secret ever needs changing:** generate a new one
(`openssl rand -hex 32`), put it in both `.env.local` and Vercel, and redeploy.
The two must match.

**On another machine:** `.env.local` is not in git, so copy `SITE_URL` and
`REVALIDATE_SECRET` into that machine's `.env.local` as well (see
`.env.example`), or `materialize.ts` run from there will not refresh the site.
