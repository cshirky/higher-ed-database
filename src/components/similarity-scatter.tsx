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

// There is no legend and no label on the target, by request, so the caption
// under the plot is the only statement of what the encodings mean, and the
// target is told apart by its outline (every other cue it has — pale green,
// its shape — a peer can share). The table and tooltip give every value in text.
//
// Colour is cost relative to the target: the target sits at pale green, a
// costlier peer deepens toward full green, a cheaper one shifts toward blue.
const COST_HIGHER = "var(--series-2)";
const COST_LOWER = "var(--series-1)";
// Mixed with white rather than the surface so that it stays pale in dark mode
// instead of sinking into the background.
const COST_SAME = "color-mix(in oklab, var(--series-2) 40%, white)";
const COST_UNKNOWN = "var(--baseline)";
/** Cost difference, as a share of the target's, at which a mark reaches its full hue. */
const FULL_HUE_COST_GAP = 0.5;

// The size glyphs sit on the fills above, all of which are light enough to
// carry dark ink in both colour schemes — so this is fixed, not a text token.
const GLYPH_INK = "#0b0b0b";

// Scatter's entry animation interpolates mark SIZE up from 0
// (recharts/lib/cartesian/Scatter.js), so anything that renders without
// advancing rAF (screenshots, print, prerender) captures an empty plot. The
// marks are static; hence isAnimationActive={false} on both series below.

/** Narrowest axis window allowed, in percentage points. */
const MIN_SPAN = 40;
/** Every mark is one size — nothing is encoded in it — and wide enough to hold a two-character glyph. */
const MARK_RADIUS = 9;

type Datum = {
  point: SimilarityPoint;
  x: number;
  y: number;
  fill: string;
  /** Cost relative to the target's (1.2 = 20% more); null when either is unknown. */
  costRatio: number | null;
  sizeGlyph: string | null;
};

const pct = (v: number) => `${Math.round(v)}%`;
const dollars = (v: number) => `$${Math.round(v).toLocaleString()}`;
const orDash = (v: number | null, format: (v: number) => string) => (v == null ? "—" : format(v));

function costColor(ratio: number | null): string {
  if (ratio == null) return COST_UNKNOWN;
  const strength = Math.round(Math.min(1, Math.abs(ratio - 1) / FULL_HUE_COST_GAP) * 100);
  return `color-mix(in oklab, ${ratio > 1 ? COST_HIGHER : COST_LOWER} ${strength}%, ${COST_SAME})`;
}

/**
 * Student-body size to compare on: undergraduates, since that is who the page
 * is for — unless either side has none (a graduate school), where total
 * enrolment is the only like-for-like figure.
 */
function sizeRatio(target: SimilarityPoint, peer: SimilarityPoint): number | null {
  const [a, b] =
    target.undergradTotal && peer.undergradTotal
      ? [target.undergradTotal, peer.undergradTotal]
      : [target.totalEnrollment, peer.totalEnrollment];
  return a && b ? b / a : null;
}

/** ">" from a quarter larger, ">>" from double; "<" and "<<" are the same steps downward. */
function sizeGlyph(ratio: number | null): string | null {
  if (ratio == null) return null;
  if (ratio >= 2) return ">>";
  if (ratio >= 1.25) return ">";
  if (ratio <= 0.5) return "<<";
  if (ratio <= 0.8) return "<";
  return null;
}

const SIZE_WORDS: Record<string, string> = {
  ">>": "Much larger student body",
  ">": "Larger student body",
  "<": "Smaller student body",
  "<<": "Much smaller student body",
};

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
  const p = d.point;
  const costNote =
    p.isTarget || d.costRatio == null
      ? ""
      : Math.abs(d.costRatio - 1) < 0.005
        ? " (same as this institution)"
        : ` (${Math.round(Math.abs(d.costRatio - 1) * 100)}% ${d.costRatio > 1 ? "more" : "less"})`;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
      <div className="font-medium">
        {p.name}
        {p.state ? `, ${p.state}` : ""}
      </div>
      <div className="text-[var(--text-muted)]">
        {p.isTarget ? "This institution" : `Academic similarity rank ${p.rank}`} ·{" "}
        {p.control === 1 ? "Public" : "Private"}
      </div>
      <div className="mt-1 text-[var(--text-secondary)]">
        Yield {pct(d.x)} · Graduation rate {pct(d.y)}
      </div>
      <div className="text-[var(--text-secondary)]">
        Cost {orDash(p.costOfAttendance, dollars)}
        {costNote}
      </div>
      <div className="text-[var(--text-secondary)]">
        {orDash(p.undergradTotal, (v) => v.toLocaleString())} undergraduates
        {d.sizeGlyph && ` · ${SIZE_WORDS[d.sizeGlyph]}`}
      </div>
      <div className="text-[var(--text-secondary)]">
        Admit rate {orDash(p.admitRate, pct)} · Test score {orDash(p.satIndex, (v) => Math.round(v).toLocaleString())}
      </div>
    </div>
  );
}

// Recharts hands a custom shape the point's pixel centre and its datum.
type MarkProps = { cx?: number; cy?: number; payload?: Datum };

/** A circle (private) or a diamond of matching weight (public), centred on the origin. */
function Outline({ diamond, r, ...rest }: { diamond: boolean; r: number } & React.SVGProps<SVGPathElement>) {
  // The diamond's half-diagonal is stretched so its area roughly matches the
  // circle's; at equal extent it reads as the smaller mark.
  const h = r * 1.25;
  const d = diamond
    ? `M0,${-h} L${h},0 L0,${h} L${-h},0 Z`
    : `M${-r},0 a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 Z`;
  return <path d={d} {...rest} />;
}

function Mark({ cx, cy, payload }: MarkProps) {
  if (cx == null || cy == null || !payload) return null;
  const { point } = payload;
  const diamond = point.control === 1;
  return (
    <g transform={`translate(${cx},${cy})`}>
      {/* 2px surface ring keeps overlapping marks separable. */}
      <Outline
        diamond={diamond}
        r={MARK_RADIUS}
        stroke="var(--surface)"
        strokeWidth={2}
        strokeLinejoin="round"
        style={{ fill: payload.fill }}
      />
      {/* The target's only unshared cue, now that it has no label or legend. */}
      {point.isTarget && (
        <Outline
          diamond={diamond}
          r={MARK_RADIUS + 3}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}
      {payload.sizeGlyph && (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={10}
          fontWeight={700}
          letterSpacing={-1}
          pointerEvents="none"
          style={{ fill: GLYPH_INK }}
        >
          {payload.sizeGlyph}
        </text>
      )}
    </g>
  );
}

function DataTable({ points }: { points: SimilarityPoint[] }) {
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
              <th className="py-1 pr-2 font-medium">Control</th>
              <th className="py-1 pr-2 text-right font-medium">Yield</th>
              <th className="py-1 pr-2 text-right font-medium">Grad rate</th>
              <th className="py-1 pr-2 text-right font-medium">Cost</th>
              <th className="py-1 pr-2 text-right font-medium">Undergrads</th>
              <th className="py-1 pr-2 text-right font-medium">Admit rate</th>
              <th className="py-1 text-right font-medium">Test score</th>
            </tr>
          </thead>
          <tbody className="text-[var(--text-secondary)]">
            {points.map((p) => (
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
                <td className="py-1 pr-2 text-[var(--text-muted)]">{p.rank ?? "—"}</td>
                <td className="py-1 pr-2">{p.control === 1 ? "Public" : "Private"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{orDash(p.yieldTotal, pct)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{orDash(p.gradRateTotal, pct)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{orDash(p.costOfAttendance, dollars)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {orDash(p.undergradTotal, (v) => v.toLocaleString())}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">{orDash(p.admitRate, pct)}</td>
                <td className="py-1 text-right tabular-nums">
                  {orDash(p.satIndex, (v) => Math.round(v).toLocaleString())}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function SimilarityScatter({ points }: { points: SimilarityPoint[] }) {
  const targetPoint = points.find((p) => p.isTarget);

  // The query has already chosen which peers to show (see
  // getAcademicSimilarityScatter); a point lacks a measure here only when the
  // target itself does, which is the fallback below.
  const plottable: Datum[] = [];
  for (const p of points) {
    if (p.yieldTotal == null || p.gradRateTotal == null || !targetPoint) continue;
    const costRatio =
      targetPoint.costOfAttendance && p.costOfAttendance ? p.costOfAttendance / targetPoint.costOfAttendance : null;
    plottable.push({
      point: p,
      x: p.yieldTotal,
      y: p.gradRateTotal,
      costRatio,
      fill: costColor(costRatio),
      sizeGlyph: p.isTarget ? null : sizeGlyph(sizeRatio(targetPoint, p)),
    });
  }

  const target = plottable.filter((d) => d.point.isTarget);
  const peers = plottable.filter((d) => !d.point.isTarget);

  const shell = (children: React.ReactNode) => (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="text-sm font-medium">Yield and graduation rate among academic peers</h3>
      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
        This institution and its closest academic peers — same institution type, ranked by overlap in
        subjects and degree levels offered and by how many students earn those degrees — leaving out
        any that are 10 or more points below it on yield or graduation rate.
      </p>
      {children}
    </div>
  );

  // A chart anchored on nothing misleads more than the table does. Say which
  // measure is missing and fall back to it — yield in particular goes
  // unreported across whole sectors.
  if (target.length === 0 || peers.length === 0) {
    const reason =
      points.length <= 1 && target.length === 0
        ? "No academic peers have been computed for this institution."
        : target.length === 0
          ? "This institution does not report both a yield and a graduation rate for " +
            "this year, so there is nothing to plot its peers against."
          : "None of this institution's academic peers come within 10 points of it on both " +
            "yield and graduation rate.";
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
            <Tooltip content={<Tip />} />
            {/* Peers first so the target's mark draws on top of any overlap. */}
            <Scatter data={peers} shape={(props: MarkProps) => <Mark {...props} />} isAnimationActive={false} />
            <Scatter data={target} shape={(props: MarkProps) => <Mark {...props} />} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs text-[var(--text-muted)]">
        The outlined mark is this institution. Colour is cost of attendance against it: greener costs
        more, bluer costs less. Diamonds are public, circles private. &gt; and &gt;&gt; mark a larger
        and a much larger student body, &lt; and &lt;&lt; a smaller and a much smaller one.
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">Axes are windowed to the institutions shown, not 0–100%.</p>

      <DataTable points={points} />
    </>,
  );
}
