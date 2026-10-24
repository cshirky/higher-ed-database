"use client";

// Quest tree: a video-game skill tree growing up from the target. Each level
// is one more axis a school beats the target on, with a game's rarity colors
// (common, rare, epic, legendary). A school hangs from the nearest school in
// majors on the level below whose upgrades it already has, so each branch
// reads as "unlock one more thing". Tile area is undergraduate count; the
// dashed square on each tile is the target's size.
import { useMemo, useState } from "react";
import {
  AXES,
  AXIS_COLOR_ON_DARK,
  AXIS_GLYPH,
  patternKey,
  type CollegeNetwork,
  type NetworkSchool,
} from "@/lib/college-network";
import { SchoolFacts } from "../school-facts";
import { pixelFont } from "./fonts";
import { allSchools, distanceLookup, shortName } from "./geometry";

const W = 960;
const PER_ROW = 7;
const T0 = 44; // the target's tile side
const LEVELS = [
  { name: "EVEN MATCH", color: "#a3a9b5" },
  { name: "RARE", color: "#4fa3ff" },
  { name: "EPIC", color: "#d27bff" },
  { name: "LEGENDARY", color: "#ffbf3c" },
];

type Tile = { s: NetworkSchool; level: number; side: number; x: number; y: number; parent: number | null; unlocked: string };

function layoutTree(network: CollegeNetwork) {
  const dist = distanceLookup(network);
  const side = (s: NetworkSchool) => Math.max(16, Math.min(100, T0 * Math.sqrt(s.sizeRatio ?? 1)));
  const target: Tile = { s: network.target, level: -1, side: T0, x: W / 2, y: 0, parent: null, unlocked: "" };
  const placed: Tile[] = [target];

  const levels = [0, 1, 2, 3].map((lvl) => network.peers.filter((s) => s.betterCount === lvl));
  const rows: { level: number; tiles: Tile[] }[] = [];

  for (const [lvl, members] of levels.entries()) {
    if (members.length === 0) continue;
    // Parent: the nearest already-placed school whose upgrades this one has
    // all of — the target always qualifies.
    const tiles = members.map((s): Tile => {
      const p = patternKey(s);
      const candidates = placed.filter((t) => [...patternKey(t.s)].every((g) => t === target || p.includes(g)));
      const below = candidates.filter((t) => t.level === Math.max(...candidates.map((c) => c.level)));
      let parent = target;
      let best = Infinity;
      for (const c of below) {
        const d = dist(s.unitid, c.s.unitid);
        if (d != null && d < best) [parent, best] = [c, d];
      }
      const have = parent === target ? "" : patternKey(parent.s);
      return { s, level: lvl, side: side(s), x: 0, y: 0, parent: parent.s.unitid, unlocked: [...p].filter((g) => !have.includes(g)).join("") };
    });
    // Order under parents, so branches cross as little as they can.
    const xOf = new Map(placed.map((t) => [t.s.unitid, t.x]));
    tiles.sort((a, b) => xOf.get(a.parent!)! - xOf.get(b.parent!)! || a.s.rank - b.s.rank);
    for (let i = 0; i < tiles.length; i += PER_ROW) {
      const row = tiles.slice(i, i + PER_ROW);
      const gap = (W - 150) / row.length;
      row.forEach((t, j) => (t.x = 150 + gap * (j + 0.5)));
      rows.push({ level: lvl, tiles: row });
    }
    placed.push(...tiles);
  }

  // Rows stack upward from the target, highest level on top.
  const rowHeight = (tiles: Tile[]) => Math.max(...tiles.map((t) => t.side)) + 78;
  let y = 40;
  const bands: { level: number; top: number; bottom: number }[] = [];
  for (const row of [...rows].reverse()) {
    const h = rowHeight(row.tiles);
    for (const t of row.tiles) t.y = y + h / 2 - 18;
    const band = bands.at(-1);
    if (band && band.level === row.level) band.bottom = y + h;
    else bands.push({ level: row.level, top: y, bottom: y + h });
    y += h;
  }
  target.y = y + T0 / 2 + 10;
  const height = target.y + T0 / 2 + 70;
  return { tiles: placed, bands, height, byId: new Map(placed.map((t) => [t.s.unitid, t])) };
}

export function QuestView({ network }: { network: CollegeNetwork }) {
  const layout = useMemo(() => layoutTree(network), [network]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const focusId = hovered ?? picked;
  const focus = allSchools(network).find((s) => s.unitid === focusId) ?? network.target;

  // The path from the focused tile down to the start, so its whole branch lights up.
  const trail = new Set<number>();
  for (let id = focusId; id != null; id = layout.byId.get(id)?.parent ?? null) trail.add(id);

  const focusTile = layout.byId.get(focus.unitid)!;
  const level = focusTile.level;

  return (
    <div
      className="flex flex-col gap-4 rounded-xl border-4 border-[#2b2f55] bg-[#0d0f24] p-3 text-[#e9ecff] sm:p-4 lg:flex-row"
      style={{
        backgroundImage:
          "linear-gradient(#ffffff08 1px, transparent 1px), linear-gradient(90deg, #ffffff08 1px, transparent 1px)",
        backgroundSize: "16px 16px",
      }}
    >
      <div className="min-w-0 flex-1 overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${layout.height}`}
          className="block h-auto w-full min-w-[640px]"
          role="img"
          aria-label="Skill tree of colleges"
          shapeRendering="crispEdges"
        >
          <style>{`
            .quest-flow { stroke-dasharray: 6 6; animation: quest-flow 0.9s linear infinite; }
            @keyframes quest-flow { to { stroke-dashoffset: 12; } }
            @media (prefers-reduced-motion: reduce) { .quest-flow { animation: none; } }
          `}</style>

          {layout.bands.map((b) => (
            <g key={b.level}>
              <rect x="0" y={b.top + 4} width={W} height={b.bottom - b.top - 8} fill={LEVELS[b.level].color} opacity="0.05" />
              <text x="12" y={b.top + 26} className={pixelFont.className} fontSize="11" fill={LEVELS[b.level].color}>
                LVL {b.level}
              </text>
              <text x="12" y={b.top + 44} className={pixelFont.className} fontSize="8" fill={LEVELS[b.level].color} opacity="0.85">
                {LEVELS[b.level].name}
              </text>
              <text x="12" y={b.top + 60} fontSize="10" fill="#aab0d6">
                better on {b.level === 0 ? "nothing — but no worse" : `${b.level} of 3`}
              </text>
            </g>
          ))}
          <text x="12" y={layout.tiles[0].y + 4} className={pixelFont.className} fontSize="11" fill="#ffffff">
            START
          </text>

          {/* Branches: up out of the parent, across, up into the child. */}
          {layout.tiles.map((t) => {
            if (t.parent == null) return null;
            const p = layout.byId.get(t.parent)!;
            const y1 = p.y - p.side / 2;
            const y2 = t.y + t.side / 2 + 40; // below the gems and the name
            const mid = y2 + (y1 - y2) * 0.5;
            const lit = trail.has(t.s.unitid);
            const d = `M${p.x},${y1} V${mid} H${t.x} V${y2}`;
            return (
              <g key={t.s.unitid}>
                <path d={d} fill="none" stroke={lit ? LEVELS[t.level].color : "#3a4170"} strokeWidth={lit ? 4 : 2} />
                {lit && <path d={d} fill="none" stroke="#ffffff" strokeWidth="2" className="quest-flow" opacity="0.8" />}
                {t.unlocked && (
                  <g transform={`translate(${t.x}, ${(mid + y2) / 2})`}>
                    {[...t.unlocked].map((g, i) => {
                      const key = AXES.find((a) => AXIS_GLYPH[a.key] === g)!.key;
                      const x = (i - (t.unlocked.length - 1) / 2) * 22;
                      return (
                        <g key={g} transform={`translate(${x},0)`}>
                          <rect x="-10" y="-8" width="20" height="16" fill="#0d0f24" stroke={AXIS_COLOR_ON_DARK[key]} strokeWidth="1.5" />
                          <text y="4" textAnchor="middle" fontSize="9" fontWeight="700" fill={AXIS_COLOR_ON_DARK[key]}>
                            +{g}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                )}
              </g>
            );
          })}

          {layout.tiles.map((t) => {
            const s = t.s;
            const isTarget = t.parent == null;
            const color = isTarget ? "#ffffff" : LEVELS[t.level].color;
            const lit = focusId === s.unitid;
            const h = t.side / 2;
            return (
              <g
                key={s.unitid}
                className="cursor-pointer"
                onMouseEnter={() => setHovered(s.unitid)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setPicked(s.unitid)}
              >
                <title>{s.name}</title>
                {lit && <rect x={t.x - h - 6} y={t.y - h - 6} width={t.side + 12} height={t.side + 12} fill="none" stroke={color} strokeWidth="2" />}
                <rect x={t.x - h} y={t.y - h} width={t.side} height={t.side} fill="#1a1e44" stroke={color} strokeWidth="3" />
                <rect x={t.x - h + 4} y={t.y - h + 4} width={t.side - 8} height={t.side - 8} fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="1" />
                {t.side >= 26 && (
                  <text x={t.x} y={t.y + Math.min(10, t.side / 5)} textAnchor="middle" className={pixelFont.className} fontSize={Math.min(24, t.side * 0.42)} fill={color}>
                    {s.name.replace(/^(The )?(University of )?/, "")[0]}
                  </text>
                )}
                {/* The target's size, on every other tile. */}
                {!isTarget && (
                  <rect x={t.x - T0 / 2} y={t.y - T0 / 2} width={T0} height={T0} fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeDasharray="3 3" />
                )}
                {AXES.map((a, i) => {
                  const v = s.verdicts[a.key];
                  const gx = t.x + (i - 1) * 16;
                  const gy = t.y + h + 12;
                  const c = AXIS_COLOR_ON_DARK[a.key];
                  return (
                    <g key={a.key}>
                      <rect
                        x={gx - 7}
                        y={gy - 7}
                        width="14"
                        height="14"
                        fill={v === "better" ? c : "#0d0f24"}
                        stroke={v === "unknown" ? "#5b6190" : c}
                        strokeDasharray={v === "unknown" ? "2 2" : undefined}
                        strokeWidth="1.5"
                      />
                      <text x={gx} y={gy + 3.5} textAnchor="middle" fontSize="9" fontWeight="700" fill={v === "better" ? "#0d0f24" : v === "unknown" ? "#5b6190" : c}>
                        {AXIS_GLYPH[a.key]}
                      </text>
                    </g>
                  );
                })}
                <text x={t.x} y={t.y + h + 34} textAnchor="middle" fontSize={isTarget ? 13 : 11} fontWeight={isTarget || lit ? 700 : 500} fill="#e9ecff">
                  {isTarget ? s.name : shortName(s.name, 22)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <aside className="w-full shrink-0 space-y-3 lg:w-72">
        <div className="border-4 border-double p-4" style={{ borderColor: level < 0 ? "#ffffff" : LEVELS[level].color, background: "#14183a" }}>
          <p className={`${pixelFont.className} mb-3 text-[9px] leading-relaxed`} style={{ color: level < 0 ? "#ffffff" : LEVELS[level].color }}>
            {level < 0 ? "YOUR START" : `LVL ${level} · ${LEVELS[level].name}`}
          </p>
          <SchoolFacts school={focus} target={network.target} view="quest" onDark />
        </div>
        <div className="border-2 border-[#2b2f55] bg-[#14183a] p-4 text-xs leading-relaxed text-[#c9cdf0]">
          <p className={`${pixelFont.className} mb-3 text-[9px] text-white`}>HOW TO PLAY</p>
          <p>Each level up the tree is one more thing a school does better than yours. Nothing here is worse.</p>
          <ul className="mt-2 space-y-1">
            {AXES.map((a) => (
              <li key={a.key} className="flex items-center gap-2">
                <span className="inline-flex h-4 w-4 items-center justify-center text-[9px] font-bold text-[#0d0f24]" style={{ background: AXIS_COLOR_ON_DARK[a.key] }}>
                  {AXIS_GLYPH[a.key]}
                </span>
                <span>
                  {a.label}: lit means {a.better}.
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2">
            <strong className="text-white">Tile size</strong> is the student body. The dashed square is your
            school&apos;s size. <strong className="text-white">+ badges</strong> on a branch show what that school
            unlocks over the one below it, its closest match in majors.
          </p>
        </div>
      </aside>
    </div>
  );
}
