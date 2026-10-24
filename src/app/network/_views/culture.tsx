"use client";

// Petri dish: every school is a cell on agar. Cell area is undergraduate
// count; the dashed ring inside (or around) each cell is the target's size, so
// bigger and smaller read at a glance. Three organelles carry the axes — solid
// when the school is better, hollow when the same. Cells that are better in the
// same ways are pulled into one colony and given a species name, and thin
// hyphae join each school to its two academically nearest.
import { useMemo, useState } from "react";
import { forceCollide, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3";
import {
  AXES,
  AXIS_COLOR_ON_LIGHT,
  AXIS_GLYPH,
  PATTERNS,
  describePattern,
  patternKey,
  type AxisKey,
  type CollegeNetwork,
  type NetworkSchool,
} from "@/lib/college-network";
import { SchoolFacts } from "../school-facts";
import { allSchools, hash01, nearestLinks, shortName } from "./geometry";
import { useClock } from "./use-clock";

const W = 1060;
const H = 800;
const DISH = { x: W / 2, y: H / 2, r: 300 };

// Organelle placement inside a cell, as an angle in degrees: one per axis.
const ORGANELLE_ANGLE: Record<AxisKey, number> = { yield: -90, gradRate: 150, cost: 30 };

const GENUS: Record<string, string> = { Y: "Popularis", G: "Graduens", $: "Frugalis" };

/** A Latin-ish species name for a colony: "Graduens frugalis" is better on graduation and cost. */
function speciesName(pattern: string) {
  if (pattern === "") return "Aequalis vulgaris";
  const words = pattern.split("").map((g) => GENUS[g]);
  if (words.length === 1) words.push("communis");
  return words.map((w, i) => (i === 0 ? w : w.toLowerCase())).join(" ");
}

type Cell = SimulationNodeDatum & { s: NetworkSchool; r: number; pattern: string; home: { x: number; y: number } };

function layoutDish(network: CollegeNetwork) {
  const ratio = (s: NetworkSchool) => Math.min(7, Math.max(0.03, s.sizeRatio ?? 1));
  // Shrink everything together so a network of giants still fits the dish.
  const totalArea = 1 + network.peers.reduce((sum, s) => sum + ratio(s), 0);
  const r0 = Math.min(38, Math.sqrt((0.3 * DISH.r * DISH.r) / totalArea));

  const patterns = PATTERNS.filter((p) => network.peers.some((s) => patternKey(s) === p));
  const angle = new Map(patterns.map((p, i) => [p, -Math.PI / 2 + (i * 2 * Math.PI) / patterns.length]));
  const colonyCenter = new Map(
    patterns.map((p) => {
      const d = patterns.length === 1 ? 140 : 200;
      return [p, { x: DISH.x + d * Math.cos(angle.get(p)!), y: DISH.y + d * Math.sin(angle.get(p)!) }];
    }),
  );

  const target: Cell = { s: network.target, r: r0, pattern: "*", home: DISH, x: DISH.x, y: DISH.y, fx: DISH.x, fy: DISH.y };
  const cells: Cell[] = network.peers.map((s, i) => {
    const home = colonyCenter.get(patternKey(s))!;
    return {
      s,
      r: Math.max(7, r0 * Math.sqrt(ratio(s))),
      pattern: patternKey(s),
      home,
      x: home.x + 24 * Math.cos(i * 2.39),
      y: home.y + 24 * Math.sin(i * 2.39),
    };
  });
  const nodes = [target, ...cells];
  const sim = forceSimulation(nodes)
    .force("collide", forceCollide<Cell>((d) => d.r + 14).strength(1).iterations(3))
    .force("x", forceX<Cell>((d) => d.home.x).strength(0.1))
    .force("y", forceY<Cell>((d) => d.home.y).strength(0.1))
    .stop();
  // Tick by hand so every step also keeps the cells on the agar, letting
  // collisions settle against the rim rather than being undone by a final clamp.
  for (let i = 0; i < 360; i++) {
    sim.tick();
    for (const c of cells) {
      const dx = c.x! - DISH.x;
      const dy = c.y! - DISH.y;
      const d = Math.hypot(dx, dy);
      const limit = DISH.r - c.r - 18;
      if (d > limit) {
        c.x = DISH.x + (dx / d) * limit;
        c.y = DISH.y + (dy / d) * limit;
      }
    }
  }

  // Each colony's label sits on the bench just outside the rim, in line with the colony.
  const colonies = patterns.map((p) => {
    const members = cells.filter((c) => c.pattern === p);
    const cx = members.reduce((a, c) => a + c.x!, 0) / members.length;
    const cy = members.reduce((a, c) => a + c.y!, 0) / members.length;
    const a = Math.atan2(cy - DISH.y, cx - DISH.x);
    const rim = { x: DISH.x + (DISH.r + 6) * Math.cos(a), y: DISH.y + (DISH.r + 6) * Math.sin(a) };
    const out = { x: DISH.x + (DISH.r + 26) * Math.cos(a), y: DISH.y + (DISH.r + 26) * Math.sin(a) };
    const cos = Math.cos(a);
    const anchor: "start" | "end" | "middle" = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
    return { pattern: p, count: members.length, from: { x: cx, y: cy }, rim, x: out.x, y: out.y + (Math.sin(a) > 0.3 ? 12 : 0), anchor };
  });

  return { r0, cells: nodes, colonies, byId: new Map(nodes.map((c) => [c.s.unitid, c])) };
}

/** A wobbling membrane: a closed curve around (x, y), never more than ~6% off radius r. */
function membrane(x: number, y: number, r: number, seed: number, t: number) {
  const n = 28;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.035 * Math.sin(3 * a + seed * 6 + t * 1.1) + 0.025 * Math.sin(5 * a - seed * 4 - t * 1.7);
    pts.push([x + r * k * Math.cos(a), y + r * k * Math.sin(a)]);
  }
  // Closed Catmull-Rom through the points, as cubic Béziers.
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return `${d}Z`;
}

export function CultureView({ network }: { network: CollegeNetwork }) {
  const layout = useMemo(() => layoutDish(network), [network]);
  const hyphae = useMemo(() => nearestLinks(network, 2), [network]);
  const t = useClock(24);
  const [hovered, setHovered] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const focusId = hovered ?? picked;
  const focus = allSchools(network).find((s) => s.unitid === focusId) ?? network.target;
  const focusPattern = focusId != null && focusId !== network.target.unitid ? patternKey(focus) : null;

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-[#1f2a27] p-3 text-[#2b211b] sm:p-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Petri dish of colleges">
          <defs>
            <radialGradient id="agar" cx="45%" cy="40%" r="65%">
              <stop offset="0%" stopColor="#fbf1cf" />
              <stop offset="100%" stopColor="#ecd393" />
            </radialGradient>
            <radialGradient id="cytoplasm" cx="40%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#f9d3df" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#e597b3" stopOpacity="0.7" />
            </radialGradient>
            <radialGradient id="cytoplasm-target" cx="40%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#d9c9f5" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#9b83d6" stopOpacity="0.85" />
            </radialGradient>
          </defs>

          <circle cx={DISH.x} cy={DISH.y} r={DISH.r + 10} fill="#cfd8d3" opacity="0.35" />
          <circle cx={DISH.x} cy={DISH.y} r={DISH.r} fill="url(#agar)" stroke="#f4fbf7" strokeOpacity="0.7" strokeWidth="5" />

          {/* Hyphae between each school and its two nearest in majors. */}
          {hyphae.map((l) => {
            const a = layout.byId.get(l.a)!;
            const b = layout.byId.get(l.b)!;
            const mx = (a.x! + b.x!) / 2;
            const my = (a.y! + b.y!) / 2;
            const len = Math.hypot(b.x! - a.x!, b.y! - a.y!) || 1;
            const bend = (hash01(l.a + l.b) - 0.5) * 0.5 * len + Math.sin(t * 0.8 + l.a) * 3;
            const cx = mx + (-(b.y! - a.y!) / len) * bend;
            const cy = my + ((b.x! - a.x!) / len) * bend;
            const lit = focusId != null && (l.a === focusId || l.b === focusId);
            return (
              <path
                key={`${l.a}-${l.b}`}
                d={`M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`}
                fill="none"
                stroke={lit ? "#7a3350" : "#a8794f"}
                strokeOpacity={lit ? 0.9 : 0.45}
                strokeWidth={lit ? 2 : 1.2}
                strokeDasharray={lit ? undefined : "1 3"}
                strokeLinecap="round"
              />
            );
          })}

          {layout.cells.map((c) => {
            const s = c.s;
            const isTarget = s.unitid === network.target.unitid;
            const seed = hash01(s.unitid);
            const lit = focusId === s.unitid;
            const dim = focusPattern != null && !isTarget && c.pattern !== focusPattern && !lit;
            const oR = Math.max(2.5, Math.min(8, c.r * 0.24));
            return (
              <g
                key={s.unitid}
                opacity={dim ? 0.45 : 1}
                className="cursor-pointer"
                onMouseEnter={() => setHovered(s.unitid)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setPicked(s.unitid)}
              >
                <title>{s.name}</title>
                <path
                  d={membrane(c.x!, c.y!, c.r, seed, t)}
                  fill={isTarget ? "url(#cytoplasm-target)" : "url(#cytoplasm)"}
                  stroke={isTarget ? "#4a3aa7" : lit ? "#7a3350" : "#b0476f"}
                  strokeWidth={lit || isTarget ? 2.5 : 1.4}
                />
                {/* The target's size, drawn on every other cell. */}
                {!isTarget && (
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={layout.r0}
                    fill="none"
                    stroke="#3d1f2c"
                    strokeOpacity="0.5"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                )}
                {AXES.map((a) => {
                  const v = s.verdicts[a.key];
                  const ang = (ORGANELLE_ANGLE[a.key] * Math.PI) / 180 + Math.sin(t * 0.6 + seed * 9) * 0.08;
                  const ox = c.x! + Math.cos(ang) * c.r * 0.5;
                  const oy = c.y! + Math.sin(ang) * c.r * 0.5;
                  const color = AXIS_COLOR_ON_LIGHT[a.key];
                  return (
                    <g key={a.key}>
                      <circle
                        cx={ox}
                        cy={oy}
                        r={oR}
                        fill={v === "better" ? color : "#fff7f9"}
                        fillOpacity={v === "better" ? 1 : 0.6}
                        stroke={v === "unknown" ? "#8a7d78" : color}
                        strokeWidth={v === "better" ? 1 : 1.6}
                        strokeDasharray={v === "unknown" ? "1.5 1.5" : undefined}
                      />
                      {oR >= 6.5 && (
                        <text
                          x={ox}
                          y={oy + 3.4}
                          textAnchor="middle"
                          fontSize="9"
                          fontWeight="700"
                          fill={v === "better" ? "#0b0b0b" : color}
                          className="pointer-events-none select-none"
                        >
                          {AXIS_GLYPH[a.key]}
                        </text>
                      )}
                    </g>
                  );
                })}
                <text
                  x={c.x}
                  y={c.y! + c.r + 13}
                  textAnchor="middle"
                  fontSize={isTarget ? 13 : 10.5}
                  fontWeight={isTarget || lit ? 700 : 500}
                  fill="#2b211b"
                  stroke="#f6e6b4"
                  strokeWidth="3"
                  paintOrder="stroke"
                  className="pointer-events-none select-none"
                >
                  {isTarget ? s.name : shortName(s.name, 24)}
                </text>
              </g>
            );
          })}
          {layout.colonies.map((c) => {
            const on = focusPattern == null || focusPattern === c.pattern;
            return (
              <g key={c.pattern} opacity={on ? 1 : 0.35} className="pointer-events-none select-none">
                <line x1={c.rim.x} y1={c.rim.y} x2={(c.rim.x + c.x) / 2} y2={(c.rim.y + c.y) / 2} stroke="#d8c48f" strokeWidth="1.5" />
                <text x={c.x} y={c.y} textAnchor={c.anchor} fontSize="14" fontStyle="italic" fill="#f3dfa6">
                  {speciesName(c.pattern)}
                  <tspan x={c.x} dy="15" fontSize="11" fontStyle="normal" fill="#c9d4cf">
                    {describePattern(c.pattern)} · {c.count}
                  </tspan>
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <aside className="w-full shrink-0 space-y-3 lg:w-72">
        <div className="rounded-lg bg-[#fdf8ec] p-4 shadow-inner">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#8a6a48]">Under the microscope</p>
          <SchoolFacts school={focus} target={network.target} view="culture" />
        </div>
        <div className="rounded-lg bg-[#fdf8ec]/90 p-4 text-xs leading-relaxed">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#8a6a48]">Field guide</p>
          <p>
            <strong>Cell size</strong> is the number of undergrads. The dashed ring in each cell is your school&apos;s
            size: a ring inside means bigger, a ring outside means smaller.
          </p>
          <ul className="mt-2 space-y-1">
            {AXES.map((a) => (
              <li key={a.key} className="flex items-center gap-2">
                <svg width="18" height="18" aria-hidden className="shrink-0">
                  <circle cx="9" cy="9" r="8" fill={AXIS_COLOR_ON_LIGHT[a.key]} />
                  <text x="9" y="12.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0b0b0b">
                    {AXIS_GLYPH[a.key]}
                  </text>
                </svg>
                <span>
                  {a.label} ({["top", "lower left", "lower right"][AXES.indexOf(a)]}) — solid means {a.better}; hollow means the same.
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2">
            <strong>Colonies</strong> group schools that beat yours the same way. <strong>Threads</strong> join each
            school to the two with the closest mix of majors. Tap a cell to look closer.
          </p>
        </div>
      </aside>
    </div>
  );
}
