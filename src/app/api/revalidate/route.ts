import { timingSafeEqual } from "crypto";
import { revalidatePath } from "next/cache";

// Pages here are cached until told otherwise: the data only changes when the
// ETL runs, so scripts/etl/materialize.ts calls this at the end of a run
// instead of every page expiring on a timer. A deploy clears the cache too.
//
// Guarded by REVALIDATE_SECRET, which must be set to the same value in the
// deployment's environment and in the .env.local the ETL runs with.
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return Response.json({ error: "REVALIDATE_SECRET is not set on this deployment" }, { status: 503 });
  }

  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // Everything under the root layout, i.e. every page. Each is re-rendered on
  // its next visit rather than all at once.
  revalidatePath("/", "layout");
  return Response.json({ revalidated: true });
}
