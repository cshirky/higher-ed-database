import { LETTER_COLORS, type Letter, type Region } from "@/lib/triangle";

// Three-circle Venn as a summary and a jump list: each region shows how many
// things fall in it and links to that region's card below. Circle centres form
// a triangle (A upper left, B upper right, C below), matching the card layout.
const R = 85;
const CENTRES: Record<Letter, [number, number]> = { A: [110, 100], B: [190, 100], C: [150, 170] };
// A point inside each region and outside the circles it excludes.
const LABEL_AT: Record<Region, [number, number]> = {
  A: [72, 82],
  B: [228, 82],
  C: [150, 222],
  AB: [150, 68],
  AC: [104, 160],
  BC: [196, 160],
  ABC: [150, 126],
};
const BADGE_AT: Record<Letter, [number, number]> = { A: [30, 22], B: [270, 22], C: [150, 272] };

export function Venn({
  counts,
  describe,
}: {
  counts: Record<Region, number>;
  /** Tooltip text for a region, e.g. "Only at Grinnell College: 3 traits, 12 majors". */
  describe: (r: Region) => string;
}) {
  return (
    <svg viewBox="0 0 300 290" className="h-auto w-full max-w-[320px]" role="img" aria-label="Venn diagram of the three colleges">
      {(Object.keys(CENTRES) as Letter[]).map((l) => (
        <circle
          key={l}
          cx={CENTRES[l][0]}
          cy={CENTRES[l][1]}
          r={R}
          fill={LETTER_COLORS[l]}
          fillOpacity={0.12}
          stroke={LETTER_COLORS[l]}
          strokeWidth={2}
        />
      ))}
      {(Object.keys(BADGE_AT) as Letter[]).map((l) => (
        <g key={l}>
          <circle cx={BADGE_AT[l][0]} cy={BADGE_AT[l][1]} r={12} fill={LETTER_COLORS[l]} />
          <text
            x={BADGE_AT[l][0]}
            y={BADGE_AT[l][1]}
            dy="0.35em"
            textAnchor="middle"
            className="fill-white text-[13px] font-semibold"
          >
            {l}
          </text>
        </g>
      ))}
      {(Object.keys(LABEL_AT) as Region[]).map((r) => (
        <a key={r} href={`#region-${r}`} className="group">
          <title>{describe(r)}</title>
          {/* Hit target well beyond the digits. */}
          <circle cx={LABEL_AT[r][0]} cy={LABEL_AT[r][1]} r={18} fill="transparent" />
          <text
            x={LABEL_AT[r][0]}
            y={LABEL_AT[r][1]}
            dy="0.35em"
            textAnchor="middle"
            className={`tabular-nums group-hover:underline ${
              r === "ABC" ? "text-[20px] font-semibold" : "text-[16px] font-medium"
            } ${counts[r] === 0 ? "fill-[var(--text-muted)]" : "fill-[var(--foreground)]"}`}
          >
            {counts[r]}
          </text>
        </a>
      ))}
    </svg>
  );
}
