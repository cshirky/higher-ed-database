/**
 * Tells the deployed site to drop its cached pages, so the next visit to each
 * one re-renders from the data just written. Never throws: a site that could
 * not be refreshed is reported, not allowed to fail an ETL run that succeeded.
 */
export async function refreshSite() {
  const { SITE_URL, REVALIDATE_SECRET } = process.env;
  if (!SITE_URL || !REVALIDATE_SECRET) {
    console.warn(
      "\n!! site NOT refreshed: SITE_URL and REVALIDATE_SECRET are not both set in .env.local.\n" +
        "   Cached pages keep showing the old data until the next deploy.",
    );
    return;
  }
  try {
    const res = await fetch(new URL("/api/revalidate", SITE_URL), {
      method: "POST",
      headers: { authorization: `Bearer ${REVALIDATE_SECRET}` },
    });
    if (res.ok) {
      console.log(`\nsite refreshed: ${SITE_URL} will re-render each page on its next visit`);
    } else {
      console.warn(
        `\n!! site NOT refreshed: ${SITE_URL} answered ${res.status} ${await res.text()}\n` +
          "   Cached pages keep showing the old data until the next deploy.",
      );
    }
  } catch (err) {
    console.warn(`\n!! site NOT refreshed: could not reach ${SITE_URL} (${(err as Error).message})`);
  }
}
