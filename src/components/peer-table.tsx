"use client";

import { useState } from "react";
import Link from "next/link";
import type { AcademicPeer } from "@/db/queries";
import { CIP_PREFIX_LABELS } from "@/lib/cip-labels";
import { selectivityGap } from "@/lib/selectivity";

type SortKey = "similarity" | "name" | "yield" | "gradRate" | "selectivity" | "undergrads" | "majors" | "cost";
type Direction = "asc" | "desc";
type Row = AcademicPeer & {
  /** Selectivity relative to the target, in steps (see selectivityGap); 0 on the target itself. */
  selectivity: number | null;
};

const pct = (v: number) => `${Math.round(v)}%`;
const dollars = (v: number) => `$${Math.round(v).toLocaleString()}`;
const orDash = (v: number | null, format: (v: number) => string) => (v == null ? "—" : format(v));
const majorLabel = (prefix: string) => CIP_PREFIX_LABELS[prefix] ?? `CIP ${prefix}`;

const COLUMNS: {
  key: SortKey;
  label: string;
  numeric: boolean;
  /** Direction a first click sorts in: biggest first for measures, A–Z for text. */
  first: Direction;
  value: (r: Row) => number | string | null;
}[] = [
  { key: "name", label: "Name", numeric: false, first: "asc", value: (r) => r.name },
  { key: "yield", label: "Yield", numeric: true, first: "desc", value: (r) => r.yieldTotal },
  { key: "gradRate", label: "Grad rate", numeric: true, first: "desc", value: (r) => r.gradRateTotal },
  // Sorted on the combined admit-rate-and-test-score gap from this institution,
  // so "most selective first" holds even where a school reports only one of the two.
  { key: "selectivity", label: "Selectivity", numeric: true, first: "desc", value: (r) => r.selectivity },
  { key: "undergrads", label: "Undergrads", numeric: true, first: "desc", value: (r) => r.undergradTotal },
  // A list has no natural order; sort on the largest subject area's name.
  {
    key: "majors",
    label: "Top 5 majors",
    numeric: false,
    first: "asc",
    value: (r) => (r.topMajors.length > 0 ? majorLabel(r.topMajors[0].prefix) : null),
  },
  { key: "cost", label: "Average cost", numeric: true, first: "desc", value: (r) => r.costOfAttendance },
];

function sortRows(rows: Row[], key: SortKey, direction: Direction): Row[] {
  // The query's own order: this institution first, then peers by academic similarity.
  if (key === "similarity") return rows;
  const column = COLUMNS.find((c) => c.key === key)!;
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const [x, y] = [column.value(a), column.value(b)];
    // Missing values go last in either direction, rather than leading a descending sort.
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    const order = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
    return sign * order;
  });
}

export function PeerTable({ rows: peers }: { rows: AcademicPeer[] }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction }>({ key: "similarity", direction: "asc" });

  const target = peers.find((p) => p.isTarget);
  const rows: Row[] = peers.map((p) => ({
    ...p,
    selectivity: p.isTarget ? 0 : target ? selectivityGap(target, p) : null,
  }));
  const sorted = sortRows(rows, sort.key, sort.direction);

  const onSort = (key: SortKey, first: Direction) =>
    setSort((current) =>
      current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: first },
    );

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 className="text-sm font-medium">Academic peers</h3>
        {sort.key !== "similarity" && (
          <button
            type="button"
            onClick={() => setSort({ key: "similarity", direction: "asc" })}
            className="text-xs text-[var(--series-1)] hover:underline"
          >
            Reset to similarity order
          </button>
        )}
      </div>
      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
        This institution and its closest academic peers — same institution type, ranked by overlap in
        subjects and degree levels offered and by how many students earn those degrees — leaving out
        any that are 10 or more points below it on yield or graduation rate. Select a column heading
        to sort.
      </p>

      {rows.length <= 1 ? (
        <p className="mt-6 mb-2 text-center text-sm text-[var(--text-muted)]">
          {rows.length === 0 || target?.yieldTotal == null || target?.gradRateTotal == null
            ? "No academic peers have been computed for this institution."
            : "None of this institution's academic peers come within 10 points of it on both yield and graduation rate."}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                {COLUMNS.map((c) => {
                  const active = sort.key === c.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                      className={`py-2 pr-4 align-bottom font-medium last:pr-0 ${c.numeric ? "text-right" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => onSort(c.key, c.first)}
                        className={`inline-flex items-baseline gap-1 whitespace-nowrap hover:text-[var(--foreground)] ${
                          active ? "text-[var(--foreground)]" : ""
                        }`}
                      >
                        {c.label}
                        {/* Reserves its width when inactive so headings do not shift on sort. */}
                        <span aria-hidden="true" className={active ? "" : "invisible"}>
                          {sort.direction === "asc" ? "▲" : "▼"}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.unitid}
                  className={`border-b border-[var(--border)] align-top last:border-0 ${
                    r.isTarget ? "bg-[var(--background)] font-medium" : "text-[var(--text-secondary)]"
                  }`}
                >
                  <td className="py-2 pr-4">
                    {r.isTarget ? (
                      r.name
                    ) : (
                      <Link href={`/institutions/${r.unitid}`} className="text-[var(--series-1)] hover:underline">
                        {r.name}
                      </Link>
                    )}
                    <div className="text-xs font-normal text-[var(--text-muted)]">
                      {r.isTarget ? "This institution" : [r.state, r.control === 1 ? "Public" : "Private"].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{orDash(r.yieldTotal, pct)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{orDash(r.gradRateTotal, pct)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums whitespace-nowrap">
                    {orDash(r.admitRate, pct)} admitted
                    <div className="text-xs font-normal text-[var(--text-muted)]">
                      {r.satIndex == null ? "No test scores" : `SAT ${Math.round(r.satIndex).toLocaleString()}`}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {orDash(r.undergradTotal, (v) => v.toLocaleString())}
                  </td>
                  <td className="py-2 pr-4 text-xs font-normal">
                    {r.topMajors.length === 0 ? (
                      "—"
                    ) : (
                      <ol className="min-w-[14rem] list-inside list-decimal">
                        {r.topMajors.map((m) => (
                          <li key={m.prefix}>{majorLabel(m.prefix)}</li>
                        ))}
                      </ol>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">{orDash(r.costOfAttendance, dollars)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Selectivity sorts on admit rate and test score together, relative to this institution; the
        test score is the SAT total, or the ACT converted to it. Majors are subject areas by
        bachelor&apos;s degrees conferred. Average cost is the published annual cost of attendance,
        averaged over in-state and out-of-state students.
      </p>
    </div>
  );
}
