"use client";

// Transit map: the target is the hub, and one line runs out of it for each
// axis — a school is a stop on every line it beats the target on, and a
// school that beats it on several is an interchange, its stops joined by a
// connector as on a tube map. Schools the same on everything sit on the gray
// Local line. Stops run left to right in order of how close their majors
// are, grouped into fare zones; a stop's size is its undergraduate count
// against the hub's.
import { useMemo, useState } from "react";
import {
  AXES,
  AXIS_COLOR,
  AXIS_GLYPH,
  describePattern,
  patternKey,
  type AxisKey,
  type CollegeNetwork,
  type NetworkSchool,
} from "@/lib/college-network";
import { SchoolFacts } from "../school-facts";
import { allSchools, shortName } from "./geometry";

type LineKey = AxisKey | "local";
const LINES: { key: LineKey; name: string; color: string; glyph: string }[] = [
  ...AXES.map((a) => ({ key: a.key as LineKey, name: `${a.label} Line`, color: AXIS_COLOR[a.key], glyph: AXIS_GLYPH[a.key] })),
  { key: "local", name: "Local — same on all", color: "var(--text-muted)", glyph: "=" },
];

const TOP = 190; // room for the slanted stop names
const TRACK_GAP = 72;
const HUB = { x: 70, y: TOP + 1.5 * TRACK_GAP };
const FIRST = 240;
const COL = 64;
const ZONE = 5; // stops per fare zone
const R0 = 13; // hub-sized stop

const trackY = (i: number) => TOP + i * TRACK_GAP;

function servedLines(s: NetworkSchool): LineKey[] {
  const lines = AXES.filter((a) => s.verdicts[a.key] === "better").map((a) => a.key as LineKey);
  return lines.length > 0 ? lines : ["local"];
}

export function TransitView({ network }: { network: CollegeNetwork }) {
  const stops = useMemo(
    () =>
      network.peers.map((s, i) => ({
        s,
        x: FIRST + i * COL,
        r: Math.max(4.5, Math.min(27, R0 * Math.sqrt(s.sizeRatio ?? 1))),
        lines: servedLines(s),
      })),
    [network],
  );
  const [hovered, setHovered] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const focusId = hovered ?? picked;
  const focus = allSchools(network).find((s) => s.unitid === focusId) ?? network.target;
  const [lineFocus, setLineFocus] = useState<LineKey | null>(null);

  const width = FIRST + Math.max(stops.length, 1) * COL + 170;
  const height = trackY(LINES.length - 1) + 70;
  const zones = Math.ceil(stops.length / ZONE);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Highlight one line">
        {LINES.map((l) => {
          const unknown = l.key !== "local" && network.target.verdicts[l.key as AxisKey] === "unknown";
          const count = stops.filter((st) => st.lines.includes(l.key)).length;
          return (
            <button
              key={l.key}
              type="button"
              onClick={() => setLineFocus((f) => (f === l.key ? null : l.key))}
              aria-pressed={lineFocus === l.key}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
                lineFocus === l.key ? "border-[var(--foreground)]" : "border-[var(--border)]"
              }`}
            >
              <span
                aria-hidden
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-[#0b0b0b]"
                style={{ background: l.color }}
              >
                {l.glyph}
              </span>
              {l.name}
              <span className="text-[var(--text-muted)]">{unknown ? "no data" : `${count} stop${count === 1 ? "" : "s"}`}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 overflow-x-auto">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Transit map of colleges" className="block">
          {/* Fare zones: how close the majors are, nearest first. */}
          {Array.from({ length: zones }, (_, z) => {
            const x0 = FIRST + z * ZONE * COL - COL / 2;
            return (
              <g key={z}>
                <rect x={x0} y={TOP - 30} width={ZONE * COL} height={height - TOP + 20} fill={z % 2 === 0 ? "var(--gridline)" : "transparent"} opacity="0.45" />
                <text x={x0 + 6} y={height - 16} fontSize="11" fill="var(--text-muted)">
                  Zone {z + 1}
                  {z === 0 ? " · closest majors" : z === zones - 1 && zones > 1 ? " · less close" : ""}
                </text>
              </g>
            );
          })}

          {/* Lines out of the hub: a 45° run to the line's track, then straight to its last stop. */}
          {LINES.map((l, i) => {
            const served = stops.filter((st) => st.lines.includes(l.key));
            const y = trackY(i);
            const turn = HUB.x + Math.abs(y - HUB.y);
            const end = served.length > 0 ? served.at(-1)!.x + 22 : turn + 40;
            const dim = lineFocus != null && lineFocus !== l.key;
            return (
              <g key={l.key} opacity={dim ? 0.18 : 1}>
                <path
                  d={`M${HUB.x},${HUB.y} L${turn},${y} H${end}`}
                  fill="none"
                  stroke={l.color}
                  strokeWidth="8"
                  strokeLinejoin="round"
                  strokeDasharray={served.length === 0 ? "10 8" : undefined}
                />
                <line x1={end} x2={end} y1={y - 9} y2={y + 9} stroke={l.color} strokeWidth="6" />
                <text x={end + 10} y={y + 4} fontSize="11.5" fontWeight="600" fill="var(--text-secondary)">
                  {l.name}
                  {served.length === 0 ? " — no stops" : ""}
                </text>
              </g>
            );
          })}

          {stops.map((st) => {
            const ys = st.lines.map((k) => trackY(LINES.findIndex((l) => l.key === k)));
            const lit = focusId === st.s.unitid;
            const dim = lineFocus != null && !st.lines.includes(lineFocus);
            const top = Math.min(...ys);
            return (
              <g
                key={st.s.unitid}
                className="cursor-pointer"
                opacity={dim ? 0.2 : 1}
                onMouseEnter={() => setHovered(st.s.unitid)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setPicked(st.s.unitid)}
              >
                <title>
                  {st.s.name}: {describePattern(patternKey(st.s))}
                </title>
                <rect x={st.x - COL / 2} y={TOP - 40} width={COL} height={height - TOP} fill={lit ? "var(--gridline)" : "transparent"} opacity="0.8" />
                {ys.length > 1 && (
                  <line x1={st.x} x2={st.x} y1={top} y2={Math.max(...ys)} stroke="var(--foreground)" strokeWidth="9" strokeLinecap="round" />
                )}
                {ys.length > 1 && (
                  <line x1={st.x} x2={st.x} y1={top} y2={Math.max(...ys)} stroke="var(--surface)" strokeWidth="5" strokeLinecap="round" />
                )}
                {ys.map((y, i) => (
                  <circle
                    key={i}
                    cx={st.x}
                    cy={y}
                    r={st.r}
                    fill="var(--surface)"
                    stroke={ys.length > 1 ? "var(--foreground)" : LINES.find((l) => l.key === st.lines[i])!.color}
                    strokeWidth={lit ? 4 : 3}
                  />
                ))}
                <text
                  x={st.x}
                  y={TOP - 34}
                  transform={`rotate(-40 ${st.x} ${TOP - 34})`}
                  fontSize="11.5"
                  fontWeight={lit ? 700 : 500}
                  fill="var(--foreground)"
                >
                  {shortName(st.s.name, 28)}
                </text>
              </g>
            );
          })}

          {/* The hub, drawn last so every line starts under it. */}
          <g
            className="cursor-pointer"
            onMouseEnter={() => setHovered(network.target.unitid)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => setPicked(network.target.unitid)}
          >
            <circle cx={HUB.x} cy={HUB.y} r={R0 + 8} fill="var(--surface)" stroke="var(--foreground)" strokeWidth="5" />
            <circle cx={HUB.x} cy={HUB.y} r={R0} fill="var(--foreground)" />
            <text x={HUB.x} y={HUB.y + R0 + 26} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--foreground)" stroke="var(--surface)" strokeWidth="4" paintOrder="stroke">
              {shortName(network.target.name, 18)}
            </text>
            <text x={HUB.x} y={HUB.y + R0 + 40} textAnchor="middle" fontSize="10.5" fill="var(--text-muted)" stroke="var(--surface)" strokeWidth="4" paintOrder="stroke">
              your school
            </text>
          </g>
        </svg>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 border-t border-[var(--border)] pt-4 md:grid-cols-2">
        <SchoolFacts school={focus} target={network.target} view="transit" />
        <div className="text-xs leading-relaxed text-[var(--text-secondary)]">
          <p>
            <strong className="text-[var(--foreground)]">Each line</strong> stops only at schools that beat yours on
            it. A school on two or three lines is an <strong className="text-[var(--foreground)]">interchange</strong>
            , its stops joined by a white connector. Schools on the gray Local line are the same as yours on
            everything.
          </p>
          <p className="mt-2 flex items-center gap-2">
            <svg width="70" height="30" aria-hidden>
              <circle cx="12" cy="15" r={R0 * Math.sqrt(0.4)} fill="none" stroke="var(--foreground)" strokeWidth="2.5" />
              <circle cx="40" cy="15" r={R0} fill="none" stroke="var(--foreground)" strokeWidth="2.5" />
            </svg>
            <span>
              <strong className="text-[var(--foreground)]">Stop size</strong> is the student body. A stop the size of
              the hub&apos;s inner dot is as big as your school.
            </span>
          </p>
          <p className="mt-2">
            <strong className="text-[var(--foreground)]">Zones</strong>: further right means a less close match in
            majors. Hover or tap a stop for details; tap a line above to ride just that one.
          </p>
        </div>
      </div>
    </div>
  );
}
