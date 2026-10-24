import Link from "next/link";
import {
  AXES,
  AXIS_COLOR,
  AXIS_COLOR_ON_DARK,
  AXIS_GLYPH,
  describeSize,
  formatValue,
  type NetworkSchool,
} from "@/lib/college-network";

const VERDICT_TEXT = { same: "same", better: "better", unknown: "no data" } as const;

/**
 * What one school is, against the target: size, each axis, top majors, and
 * where to go next. Inherits its text color so the themed views can put it on
 * their own backdrops; `onDark` picks axis colors that read there.
 */
export function SchoolFacts({
  school,
  target,
  view,
  onDark = false,
}: {
  school: NetworkSchool;
  target: NetworkSchool;
  view: string;
  onDark?: boolean;
}) {
  const isTarget = school.unitid === target.unitid;
  const colors = onDark ? AXIS_COLOR_ON_DARK : AXIS_COLOR;
  return (
    <div className="text-sm">
      <p className="font-semibold leading-snug">{school.name}</p>
      <p className="opacity-70">
        {[school.state, school.control === 1 ? "Public" : school.control === 2 ? "Private nonprofit" : null]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p className="mt-2">
        {school.undergrad != null ? `${school.undergrad.toLocaleString()} undergrads` : "Undergrads unknown"}
        {!isTarget && <span className="opacity-70"> — {describeSize(school.sizeRatio)}</span>}
      </p>
      <ul className="mt-2 space-y-1">
        {AXES.map((a) => (
          <li key={a.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold"
              style={
                school.verdicts[a.key] === "better"
                  ? { background: colors[a.key], color: "#0b0b0b" }
                  : { boxShadow: `inset 0 0 0 1.5px ${colors[a.key]}` }
              }
            >
              {AXIS_GLYPH[a.key]}
            </span>
            <span className="min-w-0 flex-1">{a.label}</span>
            <span className="tabular-nums">{formatValue(a.key, school.values[a.key])}</span>
            {!isTarget && (
              <span className="w-14 text-right text-xs font-medium uppercase tracking-wide opacity-80">
                {VERDICT_TEXT[school.verdicts[a.key]]}
              </span>
            )}
          </li>
        ))}
      </ul>
      {school.topMajors.length > 0 && (
        <p className="mt-2 opacity-80">
          <span className="opacity-70">Biggest majors: </span>
          {school.topMajors.join(", ")}
        </p>
      )}
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {!isTarget && (
          <Link href={`/network/${view}?id=${school.unitid}`} className="font-medium underline underline-offset-2">
            Start from this school →
          </Link>
        )}
        <Link href={`/institutions/${school.unitid}`} className="underline underline-offset-2 opacity-80">
          Full profile
        </Link>
      </p>
    </div>
  );
}
