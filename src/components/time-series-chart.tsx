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
  currency: (v) => `$${v.toLocaleString()}`,
  currencyM: (v) => `$${(v / 1_000_000).toFixed(0)}M`,
  compact: (v) => Intl.NumberFormat("en-US", { notation: "compact" }).format(v),
};

const AXIS_WIDTH: Record<FormatKind, number> = {
  number: 56,
  percent: 44,
  currency: 64,
  currencyM: 56,
  compact: 44,
};

export function TimeSeriesChart({
  title,
  data,
  series,
  format,
  subtitle,
}: {
  title: string;
  data: Record<string, unknown>[];
  series: Series[];
  format?: FormatKind;
  subtitle?: string;
}) {
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
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
