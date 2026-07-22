import Link from "next/link";
import { searchInstitutions, getStateList } from "@/db/queries";
import { INSTITUTION_TYPE_LABELS, INSTITUTION_TYPES } from "@/lib/institution-types";

export default async function InstitutionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; type?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = params.page ? parseInt(params.page, 10) : 1;

  const [{ rows, total, pageSize }, states] = await Promise.all([
    searchInstitutions({
      q: params.q,
      state: params.state,
      institutionType: params.type,
      page,
    }),
    getStateList(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function pageHref(overrides: Record<string, string | undefined>) {
    const next = new URLSearchParams();
    const merged = { q: params.q, state: params.state, type: params.type, page: params.page, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    return `/institutions?${next.toString()}`;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Institutions</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        {total.toLocaleString()} institutions · academic year 2023-24
      </p>

      <form className="mt-6 flex flex-wrap gap-3" action="/institutions">
        <input
          type="text"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search by name…"
          className="min-w-[220px] flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--series-1)]"
        />
        <select
          name="state"
          defaultValue={params.state ?? ""}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        >
          <option value="">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          name="type"
          defaultValue={params.type ?? ""}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          {INSTITUTION_TYPES.filter((t) => t !== "other").map((t) => (
            <option key={t} value={t}>
              {INSTITUTION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-[var(--series-1)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Filter
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface)] text-left text-[var(--text-muted)]">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">City, State</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Control</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.unitid} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]">
                <td className="px-4 py-2.5">
                  <Link href={`/institutions/${r.unitid}`} className="font-medium text-[var(--series-1)] hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                  {r.city}, {r.state}
                </td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                  {INSTITUTION_TYPE_LABELS[r.institutionType as keyof typeof INSTITUTION_TYPE_LABELS] ?? r.institutionType}
                </td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                  {r.control === 1 ? "Public" : r.control === 2 ? "Private nonprofit" : r.control === 3 ? "Private for-profit" : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  No institutions match those filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-[var(--text-muted)]">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={pageHref({ page: String(page - 1) })} className="rounded-md border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--surface)]">
              Previous
            </Link>
          )}
          {page < totalPages && (
            <Link href={pageHref({ page: String(page + 1) })} className="rounded-md border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--surface)]">
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
