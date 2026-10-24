"use client";

// Campus city: an isometric city-builder map. Each school is a building whose
// height is its undergraduate count against the target's — the target's tower
// stands in the central plaza, and every shorter building carries a dashed
// ghost of the target's height (taller ones a dashed line at it). Districts
// gather schools that beat the target in the same ways; rooftop lights show
// which. Cables join each school to its nearest in majors. Numbers are
// similarity rank, listed in the directory.
import { useMemo, useState } from "react";
import {
  AXES,
  AXIS_COLOR_ON_LIGHT,
  AXIS_GLYPH,
  describePattern,
  patternKey,
  type CollegeNetwork,
  type NetworkSchool,
} from "@/lib/college-network";
import { SchoolFacts } from "../school-facts";
import { allSchools, nearestLinks, shortName } from "./geometry";

const TW = 60; // tile diamond width
const TH = 30; // tile diamond height
const H0 = 54; // the target's height in px
const MAX_H = 260;

// Macro blocks of the city, 3×3 with the plaza in the middle. Districts take
// the four sides of the plaza first, then the corners, so a small network
// still surrounds it; whatever is left over is park.
const MACRO: [number, number][] = [
  [1, 0],
  [0, 1],
  [2, 1],
  [1, 2],
  [0, 0],
  [2, 0],
  [0, 2],
  [2, 2],
];
const DISTRICT_ORDER = ["YG$", "YG", "G$", "Y$", "G", "Y", "$", ""];

const DISTRICT_NAME: Record<string, string> = {
  "": "Old Town",
  Y: "Crowd Square",
  G: "Scholars' Row",
  $: "Thrift Market",
  YG: "Laurel Heights",
  Y$: "Lantern Quarter",
  G$: "Owl Hollow",
  YG$: "Crown Hill",
};

type Building = { s: NetworkSchool; gx: number; gy: number; h: number; clipped: boolean; number: number };

function layoutCity(network: CollegeNetwork) {
  const groups = DISTRICT_ORDER.map((p) => ({ pattern: p, members: network.peers.filter((s) => patternKey(s) === p) }))
    .filter((g) => g.members.length > 0);
  const cols = (n: number) => Math.ceil(Math.sqrt(n));
  const M = Math.max(3, ...groups.map((g) => cols(g.members.length))) + 1; // +1 for the street
  const number = new Map(network.peers.map((s, i) => [s.unitid, i + 1]));
  const height = (s: NetworkSchool) => H0 * (s.sizeRatio ?? 1);

  const buildings: Building[] = [];
  const districts = groups.map((g, i) => {
    const [mx, my] = MACRO[i];
    const c = cols(g.members.length);
    const ox = mx * M + Math.floor((M - 1 - c) / 2);
    const oy = my * M + Math.floor((M - 1 - Math.ceil(g.members.length / c)) / 2);
    g.members.forEach((s, k) => {
      const h = height(s);
      buildings.push({ s, gx: ox + (k % c), gy: oy + Math.floor(k / c), h: Math.max(5, Math.min(MAX_H, h)), clipped: h > MAX_H, number: number.get(s.unitid)! });
    });
    const tallest = Math.max(...g.members.map((s) => Math.min(MAX_H, height(s))));
    return { ...g, x0: mx * M, y0: my * M, size: M - 1, tallest };
  });
  const parks = MACRO.slice(groups.length).map(([mx, my]) => ({ x0: mx * M, y0: my * M, size: M - 1 }));
  const mid = M + Math.floor((M - 1) / 2);
  const target: Building = { s: network.target, gx: mid, gy: mid, h: H0, clipped: false, number: 0 };
  buildings.push(target);
  buildings.sort((a, b) => a.gx + a.gy - (b.gx + b.gy) || a.gx - b.gx);

  const N = 3 * M - 1;
  const ox = (N * TW) / 2 + 20;
  const oy = Math.max(...buildings.map((b) => b.h)) + 90;
  const iso = (gx: number, gy: number) => ({ x: ox + ((gx - gy) * TW) / 2, y: oy + ((gx + gy) * TH) / 2 });
  return {
    buildings,
    districts,
    parks,
    plaza: { x0: M, y0: M, size: M - 1 },
    N,
    iso,
    width: N * TW + 40,
    height: oy + N * TH + 30,
    byId: new Map(buildings.map((b) => [b.s.unitid, b])),
  };
}

/** The ground quad covering cells [x0, x0+w) × [y0, y0+h). */
function quad(iso: (x: number, y: number) => { x: number; y: number }, x0: number, y0: number, w: number, h: number) {
  const p = [iso(x0, y0), iso(x0 + w, y0), iso(x0 + w, y0 + h), iso(x0, y0 + h)];
  return p.map((q) => `${q.x},${q.y}`).join(" ");
}

export function CityView({ network }: { network: CollegeNetwork }) {
  const city = useMemo(() => layoutCity(network), [network]);
  const cables = useMemo(() => nearestLinks(network, 1), [network]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const focusId = hovered ?? picked;
  const focus = allSchools(network).find((s) => s.unitid === focusId) ?? network.target;
  const focusPattern = focusId != null && focusId !== network.target.unitid ? patternKey(focus) : null;
  const { iso } = city;
  const inset = 0.14;

  const roof = (b: Building) => {
    const c = iso(b.gx + 0.5, b.gy + 0.5);
    return { x: c.x, y: c.y - b.h };
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-b from-[#bfe0ff] to-[#eef7ff] p-3 text-[#1f2933] sm:p-4 lg:flex-row">
      <div className="min-w-0 flex-1 overflow-x-auto">
        <svg viewBox={`0 0 ${city.width} ${city.height}`} className="block h-auto w-full min-w-[600px]" role="img" aria-label="Isometric city of colleges">
          <style>{`
            .cable { stroke-dasharray: 4 5; animation: cable 1.6s linear infinite; }
            @keyframes cable { to { stroke-dashoffset: -18; } }
            @media (prefers-reduced-motion: reduce) { .cable { animation: none; } }
          `}</style>

          {/* Ground: streets everywhere, then blocks, parks, and the plaza. */}
          <polygon points={quad(iso, -0.5, -0.5, city.N + 1, city.N + 1)} fill="#9aa3ad" stroke="#7d8690" />
          {city.parks.map((p, i) => (
            <polygon key={i} points={quad(iso, p.x0, p.y0, p.size, p.size)} fill="#9fd07f" stroke="#7fb661" />
          ))}
          {city.districts.map((d) => (
            <polygon key={d.pattern} points={quad(iso, d.x0, d.y0, d.size, d.size)} fill="#e4ded0" stroke="#c9c1ae" />
          ))}
          <polygon points={quad(iso, city.plaza.x0, city.plaza.y0, city.plaza.size, city.plaza.size)} fill="#cfe3f7" stroke="#9cbfe0" />

          {city.buildings.map((b) => {
            const s = b.s;
            const isTarget = b.number === 0;
            const lit = focusId === s.unitid;
            const dim = focusPattern != null && !lit && !isTarget && patternKey(s) !== focusPattern;
            const g0 = iso(b.gx + inset, b.gy + inset);
            const g1 = iso(b.gx + 1 - inset, b.gy + inset);
            const g2 = iso(b.gx + 1 - inset, b.gy + 1 - inset);
            const g3 = iso(b.gx + inset, b.gy + 1 - inset);
            const up = (p: { x: number; y: number }, h: number) => `${p.x},${p.y - h}`;
            const box = (h: number) => ({
              top: [up(g0, h), up(g1, h), up(g2, h), up(g3, h)].join(" "),
              left: [up(g3, 0), up(g2, 0), up(g2, h), up(g3, h)].join(" "),
              right: [up(g1, 0), up(g2, 0), up(g2, h), up(g1, h)].join(" "),
            });
            const solid = box(b.h);
            const faces = isTarget
              ? { top: "#bcd9f5", left: "#5b93c9", right: "#3f78ae" }
              : lit
                ? { top: "#fff1c4", left: "#e9c46a", right: "#c9a24a" }
                : { top: "#f4f0e6", left: "#d6cfbf", right: "#b4ac99" };
            const rc = roof(b);
            const betterAxes = AXES.filter((a) => s.verdicts[a.key] === "better");
            return (
              <g
                key={s.unitid}
                className="cursor-pointer"
                opacity={dim ? 0.55 : 1}
                onMouseEnter={() => setHovered(s.unitid)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setPicked(s.unitid)}
              >
                <title>{s.name}</title>
                <polygon points={solid.left} fill={faces.left} stroke="#6b6455" strokeWidth="0.8" />
                <polygon points={solid.right} fill={faces.right} stroke="#6b6455" strokeWidth="0.8" />
                <polygon points={solid.top} fill={faces.top} stroke="#6b6455" strokeWidth="0.8" />
                {/* Window rows, one per 12px of height. */}
                {Array.from({ length: Math.floor(b.h / 12) }, (_, i) => {
                  const y = (i + 0.6) * 12;
                  return (
                    <g key={i} stroke={isTarget ? "#e7f1fb" : "#8a826f"} strokeOpacity="0.55" strokeWidth="1.5">
                      <line x1={g3.x + 3} y1={g3.y - y + 1.5} x2={g2.x - 3} y2={g2.y - y - 1.5} />
                      <line x1={g2.x + 3} y1={g2.y - y - 1.5} x2={g1.x - 3} y2={g1.y - y + 1.5} />
                    </g>
                  );
                })}
                {/* The target's height: a ghost above a shorter building, a line across a taller one. */}
                {!isTarget && b.h < H0 && (
                  <g fill="none" stroke="#2f5d8a" strokeOpacity="0.7" strokeDasharray="3 3">
                    <polygon points={box(H0).top} />
                    <line x1={g3.x} y1={g3.y - b.h} x2={g3.x} y2={g3.y - H0} />
                    <line x1={g2.x} y1={g2.y - b.h} x2={g2.x} y2={g2.y - H0} />
                    <line x1={g1.x} y1={g1.y - b.h} x2={g1.x} y2={g1.y - H0} />
                  </g>
                )}
                {!isTarget && b.h > H0 && (
                  <polyline points={[up(g3, H0), up(g2, H0), up(g1, H0)].join(" ")} fill="none" stroke="#2f5d8a" strokeWidth="1.5" strokeDasharray="4 3" />
                )}
                {b.clipped && (
                  <text x={rc.x} y={rc.y - 10} textAnchor="middle" fontSize="10" fontWeight="700" fill="#1f2933">
                    ▲ taller
                  </text>
                )}
                {/* Rooftop lights, one per axis it beats the target on. */}
                {betterAxes.map((a, i) => {
                  const x = rc.x + (i - (betterAxes.length - 1) / 2) * 11;
                  return (
                    <g key={a.key}>
                      <line x1={x} y1={rc.y} x2={x} y2={rc.y - 11} stroke="#4a4a4a" strokeWidth="1.2" />
                      <circle cx={x} cy={rc.y - 14} r="4.5" fill={AXIS_COLOR_ON_LIGHT[a.key]} stroke="#1f2933" strokeWidth="0.8" />
                    </g>
                  );
                })}
                {lit && !isTarget && (
                  <text x={rc.x} y={rc.y - (betterAxes.length > 0 ? 24 : 8) - (b.clipped ? 12 : 0)} textAnchor="middle" fontSize="12" fontWeight="700" fill="#1f2933" stroke="#eef7ff" strokeWidth="3.5" paintOrder="stroke">
                    {shortName(s.name, 30)}
                  </text>
                )}
                {!isTarget && !lit && (
                  <g transform={`translate(${g2.x}, ${g2.y + 9})`}>
                    <circle r="8" fill="#1f2933" />
                    <text y="3.5" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#ffffff">
                      {b.number}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {city.districts.map((d) => {
            // A sign floating over the district's middle, clear of its tallest roof.
            const c = iso(d.x0 + d.size / 2, d.y0 + d.size / 2);
            const p = { x: c.x, y: c.y - d.tallest - 64 };
            const on = focusPattern == null || focusPattern === d.pattern;
            return (
              <g key={d.pattern} opacity={on ? 1 : 0.5} className="pointer-events-none">
                <text x={p.x} y={p.y + 16} textAnchor="middle" fontSize="12" fontWeight="700" fill="#1f2933" stroke="#eef7ff" strokeWidth="3" paintOrder="stroke">
                  {DISTRICT_NAME[d.pattern]}
                </text>
                <text x={p.x} y={p.y + 29} textAnchor="middle" fontSize="10" fill="#3e4c59" stroke="#eef7ff" strokeWidth="3" paintOrder="stroke">
                  {describePattern(d.pattern)}
                </text>
              </g>
            );
          })}

          {/* Your tower's name, over everything but the cables. */}
          {(() => {
            const rc = roof(city.byId.get(network.target.unitid)!);
            return (
              <text x={rc.x} y={rc.y - 10} textAnchor="middle" fontSize="13" fontWeight="700" fill="#1f2933" stroke="#eef7ff" strokeWidth="4" paintOrder="stroke" className="pointer-events-none">
                {shortName(network.target.name, 30)} (yours)
              </text>
            );
          })()}

          {/* Cables to each school's nearest neighbor in majors, drawn over the skyline. */}
          {cables.map((l) => {
            const a = roof(city.byId.get(l.a)!);
            const b = roof(city.byId.get(l.b)!);
            const lift = 30 + Math.hypot(a.x - b.x, a.y - b.y) * 0.15;
            const lit = focusId != null && (l.a === focusId || l.b === focusId);
            return (
              <path
                key={`${l.a}-${l.b}`}
                d={`M${a.x},${a.y} Q${(a.x + b.x) / 2},${Math.min(a.y, b.y) - lift} ${b.x},${b.y}`}
                fill="none"
                stroke={lit ? "#d6336c" : "#2f5d8a"}
                strokeOpacity={lit ? 0.95 : 0.35}
                strokeWidth={lit ? 2.2 : 1.2}
                className="cable pointer-events-none"
              />
            );
          })}
        </svg>
      </div>

      <aside className="w-full shrink-0 space-y-3 lg:w-72">
        <div className="rounded-lg bg-white/85 p-4 shadow-sm">
          <SchoolFacts school={focus} target={network.target} view="city" />
        </div>
        <div className="rounded-lg bg-white/70 p-4 text-xs leading-relaxed">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#3e4c59]">City directory</p>
          <ol className="space-y-0.5">
            {network.peers.map((s, i) => (
              <li key={s.unitid}>
                <button
                  type="button"
                  className={`flex w-full gap-2 rounded px-1 text-left hover:bg-[#fff1c4] ${focusId === s.unitid ? "bg-[#fff1c4]" : ""}`}
                  onMouseEnter={() => setHovered(s.unitid)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setPicked(s.unitid)}
                >
                  <span className="w-5 shrink-0 text-right font-semibold tabular-nums">{i + 1}</span>
                  <span>{s.name}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-3">
            <strong>Height</strong> is the student body; the blue tower in the plaza is yours, and the dashed outline
            on each building is its height. <strong>Rooftop lights</strong>:{" "}
            {AXES.map((a, i) => (
              <span key={a.key}>
                <span className="inline-block h-2.5 w-2.5 translate-y-[1px] rounded-full" style={{ background: AXIS_COLOR_ON_LIGHT[a.key] }} />{" "}
                {a.label.toLowerCase()} ({AXIS_GLYPH[a.key]}){i < AXES.length - 1 ? ", " : ""}
              </span>
            ))}
            . Numbers count from the closest match in majors.
          </p>
        </div>
      </aside>
    </div>
  );
}
