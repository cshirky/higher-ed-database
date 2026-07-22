"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as d3 from "d3";
import { CHART_INK } from "@/lib/colors";

type PeerNode = {
  unitid: number;
  name: string;
  state: string | null;
  distance: number;
  isTarget?: boolean;
};

type SimNode = PeerNode & d3.SimulationNodeDatum;

export function PeerNetwork({ target, peers }: { target: { unitid: number; name: string; state: string | null }; peers: PeerNode[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const width = 640;
  const height = 420;

  const nodes: SimNode[] = [
    { ...target, distance: 0, isTarget: true },
    ...peers,
  ];
  const links = peers.map((p) => ({ source: target.unitid, target: p.unitid, distance: p.distance }));

  const [positions, setPositions] = useState<Map<number, { x: number; y: number }> | null>(null);

  useEffect(() => {
    const sim = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links as d3.SimulationLinkDatum<SimNode>[])
          .id((d) => (d as SimNode).unitid)
          .distance((d) => 40 + ((d as unknown as { distance: number }).distance ?? 1) * 60),
      )
      .force("charge", d3.forceManyBody().strength(-180))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(28))
      .stop();

    for (let i = 0; i < 300; i++) sim.tick();

    const next = new Map<number, { x: number; y: number }>();
    for (const n of nodes) next.set(n.unitid, { x: n.x ?? width / 2, y: n.y ?? height / 2 });
    setPositions(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.unitid, peers.length]);

  if (peers.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-muted)]">
        Not enough comparable institutions with complete data to build a peer network.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="text-sm font-medium">Peer network</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Institutions of the same type, positioned by similarity across enrollment, admit rate, tuition, and instructional
        spending per student. Closer = more similar.
      </p>
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" style={{ maxHeight: 420 }}>
        {positions &&
          links.map((l, i) => {
            const s = positions.get(target.unitid)!;
            const t = positions.get(peers[i].unitid)!;
            return (
              <line
                key={i}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke={CHART_INK.grid}
                strokeWidth={hovered === peers[i].unitid ? 2 : 1}
              />
            );
          })}
        {positions &&
          nodes.map((n) => {
            const p = positions.get(n.unitid)!;
            return (
              <g
                key={n.unitid}
                transform={`translate(${p.x},${p.y})`}
                onMouseEnter={() => setHovered(n.unitid)}
                onMouseLeave={() => setHovered(null)}
              >
                <circle
                  r={n.isTarget ? 10 : 7}
                  fill={n.isTarget ? "var(--series-1)" : "var(--series-5)"}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
                {(n.isTarget || hovered === n.unitid) && (
                  <text
                    x={0}
                    y={n.isTarget ? -16 : -12}
                    textAnchor="middle"
                    fontSize={11}
                    fill={CHART_INK.textSecondary}
                  >
                    {n.name.length > 28 ? n.name.slice(0, 26) + "…" : n.name}
                  </text>
                )}
              </g>
            );
          })}
      </svg>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)] sm:grid-cols-3">
        {peers.map((p) => (
          <li key={p.unitid}>
            <Link href={`/institutions/${p.unitid}`} className="hover:text-[var(--series-1)] hover:underline">
              {p.name}
            </Link>
            {p.state ? `, ${p.state}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
