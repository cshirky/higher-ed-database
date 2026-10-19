import { searchUndergradInstitutions } from "@/db/queries";

// Name lookup for the triangle picker's autocomplete: GET ?q=<text>.
// Not cached — every keystroke is a different query, and each is one indexed
// select over a single year.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.slice(0, 100) ?? "";
  if (q.trim().length < 2) return Response.json({ results: [] });
  return Response.json({ results: await searchUndergradInstitutions(q) });
}
