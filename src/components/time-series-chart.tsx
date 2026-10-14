"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { SERIES_COLORS, CHART_INK } from "@/lib/colors";

type Series = { key: string; label: string; color?: string };
type FormatKind = "number" | "percent" | "currency" | "currencyM" | "compact";

const FORMATTERS: Record<FormatKind, (v: number) => string> = {
  number: (v) => v.toLocaleString(),
  percent: (v) => `${v.toFixed(0)}%`,
  currency: (v) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
  // One decimal below $10M, so a small institution's budget does not read as "$0M".
  currencyM: (v) => `$${(v / 1_000_000).toFixed(v !== 0 && Math.abs(v) < 10_000_000 ? 1 : 0)}M`,
  compact: (v) => Intl.NumberFormat("en-US", { notation: "compact" }).format(v),
};

const AXIS_WIDTH: Record<FormatKind, number> = {
  number: 56,
  percent: 44,
  currency: 64,
  currencyM: 56,
  compact: 44,
};

/**
 * One row for every year from the first to the last, with an empty row where
 * the data has none. A year with no row at all would otherwise drop off the
 * axis — the chart would draw 2017 next to 2021 with a solid line between, as
 * if they were consecutive — instead of showing as the gap it is.
 */
function everyYear(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const years = rows.map((r) => r.year).filter((y): y is number => typeof y === "number");
  if (years.length === 0) return rows;
  const byYear = new Map(rows.map((r) => [r.year, r]));
  const filled: Record<string, unknown>[] = [];
  for (let y = Math.min(...years); y <= Math.max(...years); y++) filled.push(byYear.get(y) ?? { year: y });
  return filled;
}

export function TimeSeriesChart({
  title,
  data: rows,
  series,
  format,
  subtitle,
  showLegend = true,
}: {
  title: string;
  data: Record<string, unknown>[];
  series: Series[];
  format?: FormatKind;
  subtitle?: string;
  /** Off where the page draws one shared legend for several charts. */
  showLegend?: boolean;
}) {
  const data = everyYear(rows);
  const yFormat = format ? FORMATTERS[format] : undefined;
  const hasAnyData = data.some((row) => series.some((s) => row[s.key] != null));
  if (!hasAnyData) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="mt-8 mb-8 text-center text-sm text-[var(--text-muted)]">No data available</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="text-sm font-medium">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>}
      <div className="mt-2 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_INK.grid} strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="year"
              stroke={CHART_INK.axis}
              tick={{ fill: CHART_INK.textMuted, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: CHART_INK.axis }}
            />
            <YAxis
              stroke={CHART_INK.axis}
              tick={{ fill: CHART_INK.textMuted, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={AXIS_WIDTH[format ?? "number"]}
              tickFormatter={yFormat}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value) => (yFormat && typeof value === "number" ? yFormat(value) : value)}
            />
            {showLegend && series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {/*
              Two lines per series. The solid one breaks wherever a year is
              missing, so no value is drawn that was never reported; the dotted
              one underneath joins across those gaps, so the eye can still
              follow the series. Both are straight segments ("linear"), which
              is what makes the dotted line sit exactly under the solid one
              everywhere else — a curve would bend differently around a gap.

              Animation is off: the draw-in leaves screenshots, printouts and
              link previews with dots and no lines.
            */}
            {series.map((s, i) => (
              <Line
                key={`${s.key}-gaps`}
                type="linear"
                dataKey={s.key}
                stroke={s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]}
                strokeWidth={1.5}
                strokeDasharray="2 4"
                dot={false}
                activeDot={false}
                connectNulls
                legendType="none"
                tooltipType="none"
                isAnimationActive={false}
              />
            ))}
            {series.map((s, i) => (
              <Line
                key={s.key}
                type="linear"
                dataKey={s.key}
                name={s.label}
                stroke={s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
