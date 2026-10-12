"use client";

import Link from "next/link";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { CHART_INK } from "@/lib/colors";
import type { SimilarityPoint } from "@/db/queries";

// Two series, so identity is never colour-alone: the legend is always present
// and the target also carries a direct label and a larger mark. Both pairs
// (light #2a78d6/#eb6834, dark #3987e5/#d95926) pass the dataviz validator —
// worst adjacent CVD ΔE 24.7 protan, 33.6 normal vision.
const PEER_COLOR = "var(--series-1)";
const TARGET_COLOR = "var(--series-6)";

// Scatter's entry animation interpolates mark SIZE up from 0
// (recharts/lib/cartesian/Scatter.js), so a symbol sits at size 0 — path
// "M0,0", drawing nothing — until the animation runs. Anything that renders
// without advancing rAF (screenshots, print, prerender) therefore captures an
// empty plot. The marks are static; the animation buys nothing and costs this.

/** Peers needed before a cloud is worth drawing rather than describing. */
const MIN_PEERS = 2;
/** Narrowest axis window allowed, in percentage points. */
const MIN_SPAN = 40;

type Datum = {
  unitid: number;
  name: string;
  state: string | null;
  x: number;
  y: number;
  z: number;
  rank: number | null;
};

const pct = (v: number) => `${Math.round(v)}%`;

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

function ticksFor([lo, hi]: [number, number]): number[] {
  const step = (hi - lo) / 4;
  return [0, 1, 2, 3, 4].map((i) => Math.round(lo + i * step));
}

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Datum }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
      <div className="font-medium">
        {d.name}
        {d.state ? `, ${d.state}` : ""}
      </div>
      <div className="mt-1 text-[var(--text-secondary)]">
        Yield {pct(d.x)} · Graduation rate {pct(d.y)}
      </div>
      <div className="text-[var(--text-muted)]">
        {d.rank === null ? "This institution" : `Academic similarity rank ${d.rank}`}
      </div>
    </div>
  );
}

function DataTable({ points }: { points: SimilarityPoint[] }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-[var(--text-secondary)] hover:text-[var(--series-1)]">
        Show data table
      </summary>
      <table className="mt-2 w-full text-left text-xs">
        <thead className="text-[var(--text-muted)]">
          <tr>
            <th className="py-1 pr-2 font-medium">Institution</th>
            <th className="py-1 pr-2 font-medium">Rank</th>
            <th className="py-1 pr-2 text-right font-medium">Yield</th>
            <th className="py-1 text-right font-medium">Grad rate</th>
          </tr>
        </thead>
        <tbody className="text-[var(--text-secondary)]">
          {points.map((p, i) => (
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
              <td className="py-1 pr-2 text-[var(--text-muted)]">{p.isTarget ? "—" : i}</td>
              <td className="py-1 pr-2 text-right tabular-nums">
                {p.yieldTotal == null ? "—" : pct(p.yieldTotal)}
              </td>
              <td className="py-1 text-right tabular-nums">
                {p.gradRateTotal == null ? "—" : pct(p.gradRateTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function SimilarityScatter({ points }: { points: SimilarityPoint[] }) {
  const plottable: Datum[] = [];
  let missingCount = 0;

  points.forEach((p, i) => {
    if (p.yieldTotal == null || p.gradRateTotal == null) {
      missingCount++;
      return;
    }
    plottable.push({
      unitid: p.unitid,
      name: p.name,
      state: p.state,
      x: p.yieldTotal,
      y: p.gradRateTotal,
      // Constant per series; ZAxis maps it to mark area, giving the target a
      // larger mark without needing a custom shape.
      z: p.isTarget ? 2 : 1,
      // points arrive target-first in similarity order, so the index is the rank.
      rank: p.isTarget ? null : i,
    });
  });

  const target = plottable.filter((d) => d.rank === null);
  const peers = plottable.filter((d) => d.rank !== null);

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

  // A chart anchored on nothing, or on one or two stray marks, misleads more
  // than the table does. Say which measure is missing and fall back to it —
  // yield in particular goes unreported across whole sectors.
  if (target.length === 0 || peers.length < MIN_PEERS) {
    const reason =
      points.length <= 1
        ? "No academic peers have been computed for this institution."
        : target.length === 0
          ? "This institution does not report both a yield and a graduation rate for " +
            "this year, so there is nothing to plot its peers against."
          : "Too few of this institution's academic peers report both a yield and a " +
            "graduation rate to plot a comparison.";
    return shell(
      <>
        <p className="mt-6 mb-2 text-center text-sm text-[var(--text-muted)]">{reason}</p>
        <DataTable points={points} />
      </>,
    );
  }

  const xDomain = axisBounds(plottable.map((d) => d.x));
  const yDomain = axisBounds(plottable.map((d) => d.y));

  return shell(
    <>
      <div className="mt-3 h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 16, right: 24, bottom: 28, left: 8 }}>
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
            {/* Mark area, so the target reads larger without a custom shape. */}
            <ZAxis type="number" dataKey="z" range={[130, 340]} />
            <Tooltip content={<Tip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" height={28} />
            {/* Peers first so the target's mark draws on top of any overlap. */}
            <Scatter
              name="Academic peers"
              data={peers}
              fill={PEER_COLOR}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Scatter
              name="This institution"
              data={target}
              fill={TARGET_COLOR}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {/* Only the target is direct-labelled; labelling nine would collide. */}
              <LabelList
                dataKey="name"
                position="top"
                offset={10}
                style={{ fill: CHART_INK.textSecondary, fontSize: 11 }}
              />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Axes are windowed to the institutions shown, not 0–100%.
        {missingCount > 0 &&
          ` ${missingCount} of ${points.length} not plotted — no yield or graduation rate reported.`}
      </p>

      <DataTable points={points} />
    </>,
  );
}
