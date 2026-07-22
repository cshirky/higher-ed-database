// Fixed categorical order — never cycled or reassigned by filter state.
export const SERIES_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
] as const;

export const CHART_INK = {
  grid: "var(--gridline)",
  axis: "var(--baseline)",
  textMuted: "var(--text-muted)",
  textSecondary: "var(--text-secondary)",
  surface: "var(--surface)",
};
