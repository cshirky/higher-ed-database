"use client";

// Star chart: the target at the center of the sky, every other school a star
// whose distance from it grows with how different its majors are (nearest peer
// on the inner ring, farthest on the outer). Directions keep the order around
// the sky of a two-dimensional embedding (classical MDS) of the distances
// between the other schools, evenly spaced, so schools alike in majors sit
// near each other without piling up.
// Constellation lines join schools that beat the target in the same ways, by
// the shortest set of links. Star size is undergraduate count; the faint ring
// around each star is the target's size.
import { useMemo, useState } from "react";
import {
  AXES,
  AXIS_COLOR_ON_DARK,
  AXIS_GLYPH,
  PATTERNS,
  describePattern,
  patternKey,
  type CollegeNetwork,
  type NetworkSchool,
} from "@/lib/college-network";
import { SchoolFacts } from "../school-facts";
import { allSchools, distanceLookup, hash01, shortName, spanningTree } from "./geometry";

const W = 900;
const H = 720;
const C = { x: W / 2, y: H / 2 };
const SKY_R = 300;
const R0 = 9;

const CONSTELLATION: Record<string, string> = {
  "": "The Mirror",
  Y: "The Crowd",
  G: "The Scholar",
  $: "The Purse",
  YG: "The Laurel",
  Y$: "The Lantern",
  G$: "The Owl",
  YG$: "The Crown",
};

/** All-pairs distances: stored where known, shortest path through known pairs otherwise. */
function distanceMatrix(schools: NetworkSchool[], dist: (a: number, b: number) => number | null) {
  const n = schools.length;
  const d = schools.map((a) => schools.map((b) => dist(a.unitid, b.unitid) ?? Infinity));
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) d[i][j] = Math.min(d[i][j], d[i][k] + d[k][j]);
  const finite = d.flat().filter(Number.isFinite);
  const cap = Math.max(...finite, 1) * 1.2;
  return d.map((row) => row.map((v) => (Number.isFinite(v) ? v : cap)));
}

/** Classical MDS to two dimensions, by power iteration (deterministic start vectors). */
function mds2(d: number[][]) {
  const n = d.length;
  const sq = d.map((row) => row.map((v) => v * v));
  const rowMean = sq.map((row) => row.reduce((a, b) => a + b, 0) / n);
  const all = rowMean.reduce((a, b) => a + b, 0) / n;
  const B = sq.map((row, i) => row.map((v, j) => -0.5 * (v - rowMean[i] - rowMean[j] + all)));
  const vecs: { v: number[]; l: number }[] = [];
  for (let k = 0; k < 2; k++) {
    let v = Array.from({ length: n }, (_, i) => Math.sin(i * (k + 1.7) + 1));
    let l = 0;
    for (let it = 0; it < 200; it++) {
      let w = B.map((row) => row.reduce((a, b, j) => a + b * v[j], 0));
      for (const p of vecs) {
        const dot = w.reduce((a, b, i) => a + b * p.v[i], 0);
        w = w.map((x, i) => x - dot * p.v[i]);
      }
      const norm = Math.hypot(...w) || 1;
      l = norm;
      v = w.map((x) => x / norm);
    }
    vecs.push({ v, l });
  }
  return d.map((_, i) => [vecs[0].v[i] * Math.sqrt(vecs[0].l), vecs[1].v[i] * Math.sqrt(vecs[1].l)]);
}

function layoutSky(network: CollegeNetwork) {
  const schools = allSchools(network);
  const dist = distanceLookup(network);
  const d = distanceMatrix(schools, dist);
  // Directions from an embedding of the peers alone, around their center
  // (MDS centers it at the origin) — with the target included it lands at the
  // edge of the cloud and every direction from it points the same way.
  const peerD = d.slice(1).map((row) => row.slice(1));
  const xy = peerD.length > 1 ? n2(mds2(peerD)) : [[0, -1]];
  // Nearest peer on the inner ring, farthest on the outer: the rings are relative.
  const minD = Math.min(...d[0].slice(1));
  const span = Math.max(...d[0].slice(1)) - minD || 1;
  // Keep the embedding's order around the circle but space the stars evenly,
  // so a tight cluster of alike schools stays together without piling up.
  const raw = xy.map(([x, y]) => Math.atan2(y, x));
  const order = raw.map((a, i) => [a, i]).sort((p, q) => p[0] - q[0]).map(([, i]) => i);
  const even = new Map(order.map((i, k) => [i, raw[order[0]] + (k * 2 * Math.PI) / order.length]));
  const pos = schools.map((s, i) => {
    if (i === 0) return { x: C.x, y: C.y };
    const ang = even.get(i - 1)!;
    // Radius from the real academic distance to the target, rescaled.
    const rad = 70 + ((d[0][i] - minD) / span) * (SKY_R - 70);
    return { x: C.x + rad * Math.cos(ang), y: C.y + rad * Math.sin(ang), ang, rad };
  });
  // Spread stars that landed on top of each other, along their rings only.
  const radius = schools.map((s, i) => (i === 0 ? R0 + 4 : Math.max(2.5, Math.min(24, R0 * Math.sqrt(s.sizeRatio ?? 1)))));
  for (let it = 0; it < 240; it++) {
    for (let i = 1; i < pos.length; i++)
      for (let j = 1; j < pos.length; j++) {
        if (i === j) continue;
        const a = pos[i];
        const b = pos[j];
        const gap = Math.hypot(a.x - b.x, a.y - b.y) - (radius[i] + radius[j] + 34);
        if (gap < 0) a.ang! += (Math.sign(Math.sin(a.ang! - b.ang!)) || (i < j ? 1 : -1)) * (12 / a.rad!);
      }
    for (const p of pos.slice(1)) {
      p.x = C.x + p.rad! * Math.cos(p.ang!);
      p.y = C.y + p.rad! * Math.sin(p.ang!);
    }
  }

  const groups = PATTERNS.map((p) => ({ pattern: p, members: network.peers.filter((s) => patternKey(s) === p) })).filter(
    (g) => g.members.length > 0,
  );
  const index = new Map(schools.map((s, i) => [s.unitid, i]));
  const constellations = groups.map((g) => {
    const edges = spanningTree(g.members, dist);
    const pts = g.members.map((s) => pos[index.get(s.unitid)!]);
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    return { ...g, edges, label: { x: cx, y: Math.min(...pts.map((p) => p.y)) - 26 } };
  });
  return { pos, radius, index, constellations };
}

/** Keeps the embedding finite when every distance is equal. */
function n2(xy: number[][]) {
  return xy.map(([x, y], i) => [Number.isFinite(x) ? x : Math.cos(i), Number.isFinite(y) ? y : Math.sin(i)]);
}

/** A four-point sparkle, spikes `len` long around (x, y). */
function sparkle(x: number, y: number, r: number, len: number) {
  const w = r * 0.35;
  return `M${x},${y - len} L${x + w},${y - w} L${x + len},${y} L${x + w},${y + w} L${x},${y + len} L${x - w},${y + w} L${x - len},${y} L${x - w},${y - w}Z`;
}

const BACKGROUND = Array.from({ length: 160 }, (_, i) => ({
  x: hash01(i * 3 + 1) * W,
  y: hash01(i * 7 + 2) * H,
  r: hash01(i * 11 + 3) * 1.1 + 0.2,
  o: hash01(i * 13 + 4) * 0.5 + 0.15,
}));

export function StarsView({ network }: { network: CollegeNetwork }) {
  const sky = useMemo(() => layoutSky(network), [network]);
  const schools = allSchools(network);
  const [hovered, setHovered] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const focusId = hovered ?? picked;
  const focus = schools.find((s) => s.unitid === focusId) ?? network.target;
  const activeGroup = group ?? (focusId != null && focusId !== network.target.unitid ? patternKey(focus) : null);

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-[#03050f] p-3 text-[#e8ecff] sm:p-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Star chart of colleges">
          <defs>
            <radialGradient id="sky" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#14214d" />
              <stop offset="100%" stopColor="#03050f" />
            </radialGradient>
            <radialGradient id="glow">
              <stop offset="0%" stopColor="#fff8e0" stopOpacity="0.9" />
              <stop offset="40%" stopColor="#ffe6a8" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#ffe6a8" stopOpacity="0" />
            </radialGradient>
          </defs>
          <style>{`
            .twinkle { animation: twinkle 3.2s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }
            @keyframes twinkle { from { opacity: 1; transform: scale(1); } to { opacity: 0.55; transform: scale(0.82); } }
            @media (prefers-reduced-motion: reduce) { .twinkle { animation: none; } }
          `}</style>
          <rect width={W} height={H} fill="url(#sky)" />
          {BACKGROUND.map((b, i) => (
            <circle key={i} cx={b.x} cy={b.y} r={b.r} fill="#ffffff" opacity={b.o} />
          ))}

          {/* Distance rings: how different the majors are. */}
          {[0.33, 0.66, 1].map((f, i) => (
            <g key={f}>
              <circle cx={C.x} cy={C.y} r={70 + f * (SKY_R - 70)} fill="none" stroke="#8fa6ff" strokeOpacity="0.16" strokeDasharray="2 6" />
              <text x={C.x + 4} y={C.y - (70 + f * (SKY_R - 70)) - 4} fontSize="10" fill="#8fa6ff" opacity="0.6">
                {["very close majors", "close", "less close"][i]}
              </text>
            </g>
          ))}

          {sky.constellations.map((g) => {
            const on = activeGroup == null || activeGroup === g.pattern;
            return (
              <g key={g.pattern} opacity={on ? 1 : 0.15}>
                {g.edges.map(([a, b]) => {
                  const p = sky.pos[sky.index.get(a)!];
                  const q = sky.pos[sky.index.get(b)!];
                  return <line key={`${a}-${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#9fc0ff" strokeOpacity={activeGroup === g.pattern ? 0.85 : 0.4} strokeWidth="1.3" />;
                })}
                {(g.members.length > 1 || activeGroup === g.pattern) && (
                  <text x={g.label.x} y={g.label.y} textAnchor="middle" fontSize="13" fontStyle="italic" letterSpacing="2" fill="#b9ccff" opacity="0.9">
                    {CONSTELLATION[g.pattern].toUpperCase()}
                  </text>
                )}
              </g>
            );
          })}

          {schools.map((s, i) => {
            const p = sky.pos[i];
            const r = sky.radius[i];
            const isTarget = i === 0;
            const lit = focusId === s.unitid;
            const on = isTarget || activeGroup == null || activeGroup === patternKey(s) || lit;
            return (
              <g
                key={s.unitid}
                className="cursor-pointer"
                opacity={on ? 1 : 0.3}
                onMouseEnter={() => setHovered(s.unitid)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setPicked(s.unitid)}
              >
                <title>{s.name}</title>
                <circle cx={p.x} cy={p.y} r={Math.max(r * 3, 14)} fill="url(#glow)" />
                <g className="twinkle" style={{ animationDelay: `${-hash01(s.unitid) * 3}s` }}>
                  <path d={sparkle(p.x, p.y, r, r * 2.1)} fill={isTarget ? "#ffffff" : "#fff3cf"} />
                </g>
                <circle cx={p.x} cy={p.y} r={r * 0.75} fill="#ffffff" />
                {!isTarget && <circle cx={p.x} cy={p.y} r={R0 + 4} fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeDasharray="2 3" />}
                {isTarget && <circle cx={p.x} cy={p.y} r={r + 12} fill="none" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="1.5" />}
                {lit && <circle cx={p.x} cy={p.y} r={Math.max(r, R0) + 10} fill="none" stroke="#ffd36b" strokeWidth="1.5" />}
                <text x={p.x} y={p.y + Math.max(r, R0 + 4) + 15} textAnchor="middle" fontSize={isTarget ? 13 : 10.5} fontWeight={isTarget || lit ? 700 : 400} fill="#e8ecff">
                  {isTarget ? s.name : shortName(s.name, 24)}
                </text>
                {!isTarget && (
                  <text x={p.x} y={p.y + Math.max(r, R0 + 4) + 28} textAnchor="middle" fontSize="9.5" fontWeight="700" letterSpacing="2">
                    {AXES.map((a) => (
                      <tspan key={a.key} fill={s.verdicts[a.key] === "better" ? AXIS_COLOR_ON_DARK[a.key] : "#5a648f"}>
                        {AXIS_GLYPH[a.key]}
                      </tspan>
                    ))}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <aside className="w-full shrink-0 space-y-3 lg:w-72">
        <div className="rounded-lg border border-[#26305e] bg-[#0a0f27] p-4">
          <SchoolFacts school={focus} target={network.target} view="stars" onDark />
        </div>
        <div className="rounded-lg border border-[#26305e] bg-[#0a0f27] p-4 text-xs leading-relaxed text-[#c3cbef]">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#8fa6ff]">Constellations</p>
          <ul className="space-y-1">
            {sky.constellations.map((g) => (
              <li key={g.pattern}>
                <button
                  type="button"
                  onClick={() => setGroup((cur) => (cur === g.pattern ? null : g.pattern))}
                  aria-pressed={group === g.pattern}
                  className={`w-full rounded px-2 py-1 text-left hover:bg-[#151c40] ${group === g.pattern ? "bg-[#1b2452]" : ""}`}
                >
                  <span className="font-semibold text-[#e8ecff]">{CONSTELLATION[g.pattern]}</span>{" "}
                  <span className="opacity-70">({g.members.length})</span>
                  <span className="block opacity-80">{describePattern(g.pattern)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3">
            <strong className="text-white">Distance from the center</strong> is how different a school&apos;s majors are
            from yours. <strong className="text-white">Star size</strong> is the student body; the dotted ring is your
            school&apos;s size. Under each name, lit letters ({AXES.map((a) => AXIS_GLYPH[a.key]).join(" ")}) are what it
            does better.
          </p>
        </div>
      </aside>
    </div>
  );
}
