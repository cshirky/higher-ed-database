"use client";

import Link from "next/link";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CHART_INK } from "@/lib/colors";
import type { SimilarityPoint } from "@/db/queries";
import { selectivityGap } from "@/lib/selectivity";

// The reader removed the legend, so nothing here may depend on one: the target
// is the only green mark and carries a direct label, and the caption under the
// plot states what colour, size and the cost tags mean. The table and tooltip
// give every value in text.
const TARGET_COLOR = "var(--series-2)";
// Diverging: blue = less selective than the target, yellow = more, meeting at
// a neutral grey rather than at a hue (a hue at the midpoint would read as a
// third category — and green there would pass for the target).
const LESS_SELECTIVE = "var(--series-1)";
const MORE_SELECTIVE = "var(--series-4)";
const NEUTRAL = "var(--baseline)";

// Scatter's entry animation interpolates mark SIZE up from 0
// (recharts/lib/cartesian/Scatter.js), so anything that renders without
// advancing rAF (screenshots, print, prerender) captures an empty plot. The
// marks are static; hence isAnimationActive={false} on both series below.

/** Peers needed before a plot is worth drawing rather than describing. */
const MIN_PEERS = 1;
/** Narrowest axis window allowed, in percentage points. */
const MIN_SPAN = 40;
/** A peer this many points or more below the target on either axis is left out. */
const HIDE_BELOW = 10;
/** Cost of attendance this far above or below the target's earns a tag. */
const COST_TAG_RATIO = 0.15;
/** The target's mark is a fixed size; only peers are sized by enrolment. */
const TARGET_DIAMETER = 10;

type Datum = {
  unitid: number;
  name: string;
  state: string | null;
  x: number;
  y: number;
  rank: number | null;
  admitRate: number | null;
  satIndex: number | null;
  undergradTotal: number | null;
  cost: number | null;
  /** Selectivity relative to the target, in steps; see selectivityGap. */
  gap: number | null;
  diameter: number;
  fill: string;
  costTag: string | null;
};

/**
 * Mark diameter in px, logarithmic in undergraduate headcount: each tenfold
 * increase adds the same 5px (100 → 8, 1,000 → 13, 10,000 → 18). A linear
 * scale would leave every small college an identical speck beside one large
 * university. 8px is the floor a mark stays legible at, and is also what an
 * institution with no undergraduates (or none reported) gets.
 */
function peerDiameter(undergrads: number | null): number {
  if (undergrads == null || undergrads <= 100) return 8;
  return Math.min(26, 8 + 5 * Math.log10(undergrads / 100));
}

/**
 * Gap at which a mark reaches its full hue: half a step, about 11 admit-rate
 * points or 80 SAT points. Academic peers are close in selectivity by
 * construction, so saturating at a whole step left nearly all of them grey.
 */
const FULL_HUE_GAP = 0.5;

/** Grey at no difference, deepening to the full hue at FULL_HUE_GAP either way. */
function selectivityColor(gap: number | null): string {
  if (gap == null) return NEUTRAL;
  const strength = Math.round(Math.min(1, Math.abs(gap) / FULL_HUE_GAP) * 100);
  return `color-mix(in oklab, ${gap > 0 ? MORE_SELECTIVE : LESS_SELECTIVE} ${strength}%, ${NEUTRAL})`;
}

function costTag(target: number | null, peer: number | null): string | null {
  if (target == null || peer == null || target <= 0) return null;
  const ratio = peer / target;
  if (ratio >= 1 + COST_TAG_RATIO) return "$>";
  if (ratio <= 1 - COST_TAG_RATIO) return "<$";
  return null;
}

const pct = (v: number) => `${Math.round(v)}%`;
const dollars = (v: number) => `$${Math.round(v).toLocaleString()}`;
const orDash = (v: number | null, format: (v: number) => string) => (v == null ? "—" : format(v));

/**
 * Clean axis bounds for a percentage measure: snap outward to multiples of 10,
 * then widen to at least MIN_SPAN and slide back inside 0–100.
 *
 * A fixed 0–100 window would be defensible but unreadable here — selective
 * institutions sit between 84% and 98% graduation, a band that collapses to a
 * sliver. Position-encoded marks carry no length, so unlike a bar they need no
 * zero baseline; the minimum span is what stops the window shrinking far enough
 * to dramatise noise.
 */
function axisBounds(values: number[]): [number, number] {
  if (values.length === 0) return [0, 100];
  let lo = Math.floor(Math.min(...values) / 10) * 10;
  let hi = Math.ceil(Math.max(...values) / 10) * 10;
  if (hi - lo < MIN_SPAN) {
    const grow = (MIN_SPAN - (hi - lo)) / 2;
    lo -= grow;
    hi += grow;
  }
  if (lo < 0) [lo, hi] = [0, hi - lo];
  if (hi > 100) [lo, hi] = [Math.max(0, lo - (hi - 100)), 100];
  return [lo, hi];
}

/**
 * Ticks on round multiples of 10 (20 once the window is wide enough to crowd
 * them). A fixed count instead divides the window into fractional steps — a
 * 40–90 window in four gives 52.5, 65, 77.5 — whose rounded labels then sit
 * off their own gridlines.
 */
function ticksFor([lo, hi]: [number, number]): number[] {
  const step = hi - lo > 60 ? 20 : 10;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  return ticks;
}

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Datum }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const selectivity =
    d.rank === null || d.gap == null
      ? null
      : Math.abs(d.gap) < 0.1
        ? "About as selective as this institution"
        : d.gap > 0
          ? "More selective than this institution"
          : "Less selective than this institution";
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
      <div className="font-medium">
        {d.name}
        {d.state ? `, ${d.state}` : ""}
      </div>
      <div className="mt-1 text-[var(--text-secondary)]">
        Yield {pct(d.x)} · Graduation rate {pct(d.y)}
      </div>
      <div className="text-[var(--text-secondary)]">
        Admit rate {orDash(d.admitRate, pct)} · Test score {orDash(d.satIndex, (v) => Math.round(v).toLocaleString())}
      </div>
      <div className="text-[var(--text-secondary)]">
        {orDash(d.undergradTotal, (v) => v.toLocaleString())} undergraduates · Cost {orDash(d.cost, dollars)}
        {d.costTag === "$>" && " (15%+ higher)"}
        {d.costTag === "<$" && " (15%+ lower)"}
      </div>
      {selectivity && <div className="text-[var(--text-secondary)]">{selectivity}</div>}
      <div className="text-[var(--text-muted)]">
        {d.rank === null ? "This institution" : `Academic similarity rank ${d.rank}`}
      </div>
    </div>
  );
}

// Recharts hands a custom shape the point's pixel centre and its datum.
type MarkProps = { cx?: number; cy?: number; payload?: Datum };

function Mark({ cx, cy, payload }: MarkProps) {
  if (cx == null || cy == null || !payload) return null;
  const r = payload.diameter / 2;
  return (
    <g>
      {/* Hover target larger than the mark, so a 10px dot is not a 10px target. */}
      <circle cx={cx} cy={cy} r={Math.max(r + 4, 12)} fill="transparent" />
      {/* 2px surface ring keeps overlapping marks separable. */}
      <circle cx={cx} cy={cy} r={r} stroke="var(--surface)" strokeWidth={2} style={{ fill: payload.fill }} />
      {/* Only the target is direct-labelled; labelling every mark would collide. */}
      {payload.rank === null && (
        <text
          x={cx}
          y={cy - r - 6}
          textAnchor="middle"
          fontSize={11}
          stroke="var(--surface)"
          strokeWidth={3}
          paintOrder="stroke"
          style={{ fill: CHART_INK.textSecondary }}
        >
          {payload.name}
        </text>
      )}
      {payload.costTag && (
        <text
          x={cx + r + 3}
          y={cy}
          dominantBaseline="central"
          fontSize={10}
          fontWeight={600}
          stroke="var(--surface)"
          strokeWidth={3}
          paintOrder="stroke"
          style={{ fill: CHART_INK.textSecondary }}
        >
          {payload.costTag}
        </text>
      )}
    </g>
  );
}

type Row = { point: SimilarityPoint; rank: number | null };

function DataTable({ rows }: { rows: Row[] }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-[var(--text-secondary)] hover:text-[var(--series-1)]">
        Show data table
      </summary>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full text-left text-xs">
          <thead className="text-[var(--text-muted)]">
            <tr>
              <th className="py-1 pr-2 font-medium">Institution</th>
              <th className="py-1 pr-2 font-medium">Rank</th>
              <th className="py-1 pr-2 text-right font-medium">Yield</th>
              <th className="py-1 pr-2 text-right font-medium">Grad rate</th>
              <th className="py-1 pr-2 text-right font-medium">Admit rate</th>
              <th className="py-1 pr-2 text-right font-medium">Test score</th>
              <th className="py-1 pr-2 text-right font-medium">Undergrads</th>
              <th className="py-1 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody className="text-[var(--text-secondary)]">
            {rows.map(({ point: p, rank }) => (
              <tr key={p.unitid} className="border-t border-[var(--border)]">
                <td className="py-1 pr-2">
                  {p.isTarget ? (
                    <span className="font-semibold">{p.name}</span>
                  ) : (
                    <Link
                      href={`/institutions/${p.unitid}`}
                      className="hover:text-[var(--series-1)] hover:underline"
                    >
                      {p.name}
                    </Link>
                  )}
                  {p.state ? `, ${p.state}` : ""}
                </td>
                <td className="py-1 pr-2 text-[var(--text-muted)]">{rank ?? "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{orDash(p.yieldTotal, pct)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{orDash(p.gradRateTotal, pct)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{orDash(p.admitRate, pct)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {orDash(p.satIndex, (v) => Math.round(v).toLocaleString())}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {orDash(p.undergradTotal, (v) => v.toLocaleString())}
                </td>
                <td className="py-1 text-right tabular-nums">{orDash(p.costOfAttendance, dollars)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function SimilarityScatter({ points }: { points: SimilarityPoint[] }) {
  // points arrive target-first in similarity order, so the index is the rank.
  const rows: Row[] = points.map((point, i) => ({ point, rank: point.isTarget ? null : i }));
  const targetPoint = points.find((p) => p.isTarget);
  const targetPlottable =
    targetPoint != null && targetPoint.yieldTotal != null && targetPoint.gradRateTotal != null;

  const plottable: Datum[] = [];
  const shownRows: Row[] = [];
  let missingCount = 0;
  let belowCount = 0;

  for (const row of rows) {
    const p = row.point;
    if (p.yieldTotal == null || p.gradRateTotal == null) {
      missingCount++;
      shownRows.push(row);
      continue;
    }
    // Deliberately one-sided: the chart is for finding comparable-or-better
    // institutions, so a peer well below the target on either measure is left
    // out of the plot and the table alike. The caption says how many.
    if (
      !p.isTarget &&
      targetPlottable &&
      (p.yieldTotal <= targetPoint.yieldTotal! - HIDE_BELOW ||
        p.gradRateTotal <= targetPoint.gradRateTotal! - HIDE_BELOW)
    ) {
      belowCount++;
      continue;
    }
    shownRows.push(row);
    const gap = p.isTarget || !targetPoint ? null : selectivityGap(targetPoint, p);
    plottable.push({
      unitid: p.unitid,
      name: p.name,
      state: p.state,
      x: p.yieldTotal,
      y: p.gradRateTotal,
      rank: row.rank,
      admitRate: p.admitRate,
      satIndex: p.satIndex,
      undergradTotal: p.undergradTotal,
      cost: p.costOfAttendance,
      gap,
      diameter: p.isTarget ? TARGET_DIAMETER : peerDiameter(p.undergradTotal),
      fill: p.isTarget ? TARGET_COLOR : selectivityColor(gap),
      costTag: p.isTarget || !targetPoint ? null : costTag(targetPoint.costOfAttendance, p.costOfAttendance),
    });
  }

  const target = plottable.filter((d) => d.rank === null);
  // Largest first, so a small mark is never buried under a big one.
  const peers = plottable.filter((d) => d.rank !== null).sort((a, b) => b.diameter - a.diameter);

  const shell = (children: React.ReactNode) => (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="text-sm font-medium">Yield and graduation rate among academic peers</h3>
      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
        This institution and its closest academic peers — same institution type, ranked by overlap in
        subjects and degree levels offered and by how many students earn those degrees.
      </p>
      {children}
    </div>
  );

  const belowNote =
    belowCount > 0
      ? ` ${belowCount} ${belowCount === 1 ? "peer is" : "peers are"} left out for being ${HIDE_BELOW} or more points below this institution on yield or graduation rate.`
      : "";

  // A chart anchored on nothing misleads more than the table does. Say which
  // measure is missing and fall back to it — yield in particular goes
  // unreported across whole sectors.
  if (target.length === 0 || peers.length < MIN_PEERS) {
    const reason =
      points.length <= 1
        ? "No academic peers have been computed for this institution."
        : target.length === 0
          ? "This institution does not report both a yield and a graduation rate for " +
            "this year, so there is nothing to plot its peers against."
          : "None of this institution's academic peers can be plotted against it." + belowNote;
    return shell(
      <>
        <p className="mt-6 mb-2 text-center text-sm text-[var(--text-muted)]">{reason}</p>
        <DataTable rows={shownRows} />
      </>,
    );
  }

  const xDomain = axisBounds(plottable.map((d) => d.x));
  const yDomain = axisBounds(plottable.map((d) => d.y));

  return shell(
    <>
      <div className="mt-3 h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 24, right: 32, bottom: 28, left: 8 }}>
            <CartesianGrid stroke={CHART_INK.grid} strokeDasharray="0" />
            <XAxis
              type="number"
              dataKey="x"
              domain={xDomain}
              ticks={ticksFor(xDomain)}
              tickFormatter={pct}
              stroke={CHART_INK.axis}
              tick={{ fill: CHART_INK.textMuted, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: CHART_INK.axis }}
              label={{
                value: "Yield (admitted students who enrol)",
                position: "insideBottom",
                offset: -18,
                style: { fill: CHART_INK.textSecondary, fontSize: 12 },
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={yDomain}
              ticks={ticksFor(yDomain)}
              tickFormatter={pct}
              width={48}
              stroke={CHART_INK.axis}
              tick={{ fill: CHART_INK.textMuted, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              label={{
                value: "Graduation rate",
                angle: -90,
                position: "insideLeft",
                style: { fill: CHART_INK.textSecondary, fontSize: 12, textAnchor: "middle" },
              }}
            />
            <Tooltip content={<Tip />} />
            {/* Peers first so the target's mark draws on top of any overlap. */}
            <Scatter data={peers} shape={(props: MarkProps) => <Mark {...props} />} isAnimationActive={false} />
            <Scatter data={target} shape={(props: MarkProps) => <Mark {...props} />} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs text-[var(--text-muted)]">
        The green mark is this institution. Peers are yellower the more selective they are than it and
        bluer the less selective (admit rate and test scores); larger marks have more undergraduates.
        $&gt; marks a cost of attendance at least 15% higher, &lt;$ at least 15% lower.
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Axes are windowed to the institutions shown, not 0–100%.
        {belowNote}
        {missingCount > 0 &&
          ` ${missingCount} of ${points.length} not plotted — no yield or graduation rate reported.`}
      </p>

      <DataTable rows={shownRows} />
    </>,
  );
}
