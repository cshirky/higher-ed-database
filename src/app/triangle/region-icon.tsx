import type { ReactNode } from "react";
import { LETTERS, LETTER_COLORS, type Letter, type Region } from "@/lib/triangle";
import { CENTRES, R } from "./venn";

// A small copy of the Venn diagram with one region filled in, marking which
// part of the big diagram a list belongs to. The fill is the members' colours
// mixed evenly: each is laid over the last at 1/n opacity, so a pair comes out
// half and half and all three a third each.

const VIEWBOX = "18 8 264 264";
const clipId = (l: Letter) => `tri-clip-${l}`;
const maskId = (r: Region) => `tri-mask-${r}`;

/** Shared clip paths and masks; render once on any page that uses RegionIcon. */
export function RegionIconDefs({ regions }: { regions: readonly Region[] }) {
  return (
    // Zero-size rather than display:none, which would disable the clip paths in some browsers.
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        {LETTERS.map((l) => (
          <clipPath key={l} id={clipId(l)}>
            <circle cx={CENTRES[l][0]} cy={CENTRES[l][1]} r={R} />
          </clipPath>
        ))}
        {regions.map((r) => (
          <mask key={r} id={maskId(r)} maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="300">
            <rect width="300" height="300" fill="white" />
            {LETTERS.filter((l) => !r.includes(l)).map((l) => (
              <circle key={l} cx={CENTRES[l][0]} cy={CENTRES[l][1]} r={R} fill="black" />
            ))}
          </mask>
        ))}
      </defs>
    </svg>
  );
}

export function RegionIcon({ region, className = "h-9 w-9" }: { region: Region; className?: string }) {
  const members = region.split("") as Letter[];
  // Intersect the members' circles by nesting one clip inside another.
  const fill = members.reduceRight<ReactNode>(
    (inner, l) => <g clipPath={`url(#${clipId(l)})`}>{inner}</g>,
    members.map((l, i) => (
      <rect key={l} width="300" height="300" fill={LETTER_COLORS[l]} fillOpacity={1 / (i + 1)} />
    )),
  );
  return (
    <svg viewBox={VIEWBOX} className={`shrink-0 ${className}`} aria-hidden="true">
      <g mask={`url(#${maskId(region)})`}>{fill}</g>
      {LETTERS.map((l) => (
        <circle
          key={l}
          cx={CENTRES[l][0]}
          cy={CENTRES[l][1]}
          r={R}
          fill="none"
          stroke={LETTER_COLORS[l]}
          strokeWidth={12}
        />
      ))}
    </svg>
  );
}
