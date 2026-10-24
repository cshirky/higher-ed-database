// Geometry shared by the network views. Everything here is deterministic — no
// Math.random — so the server render and the client's first render agree.
import { linkKey, type CollegeNetwork, type NetworkSchool } from "@/lib/college-network";

/** Everyone in the network, target first. */
export function allSchools(network: CollegeNetwork): NetworkSchool[] {
  return [network.target, ...network.peers];
}

/** Stored academic distance between two schools, or null when neither lists the other. */
export function distanceLookup(network: CollegeNetwork) {
  const byKey = new Map(network.links.map((l) => [linkKey(l.a, l.b), l.distance]));
  return (a: number, b: number) => (a === b ? 0 : (byKey.get(linkKey(a, b)) ?? null));
}

/**
 * Each school joined to its `k` academically nearest others in the network,
 * deduplicated. Pairs with no stored distance are never joined.
 */
export function nearestLinks(network: CollegeNetwork, k: number) {
  const schools = allSchools(network);
  const dist = distanceLookup(network);
  const out = new Map<string, { a: number; b: number; distance: number }>();
  for (const s of schools) {
    const near = schools
      .filter((o) => o.unitid !== s.unitid)
      .map((o) => ({ o, d: dist(s.unitid, o.unitid) }))
      .filter((x): x is { o: NetworkSchool; d: number } => x.d != null)
      .sort((x, y) => x.d - y.d)
      .slice(0, k);
    for (const { o, d } of near) out.set(linkKey(s.unitid, o.unitid), { a: s.unitid, b: o.unitid, distance: d });
  }
  return [...out.values()];
}

/**
 * Minimum spanning tree over `members` by academic distance (Prim's), so the
 * nearest schools in a group are joined and the group stays one piece. Pairs
 * with no stored distance count as far apart rather than unjoinable.
 */
export function spanningTree(members: NetworkSchool[], dist: (a: number, b: number) => number | null) {
  if (members.length < 2) return [];
  const far = (a: number, b: number) => dist(a, b) ?? Number.MAX_VALUE;
  const inTree = new Set([members[0].unitid]);
  const edges: [number, number][] = [];
  while (inTree.size < members.length) {
    let best: [number, number, number] | null = null;
    for (const a of members) {
      if (!inTree.has(a.unitid)) continue;
      for (const b of members) {
        if (inTree.has(b.unitid)) continue;
        const d = far(a.unitid, b.unitid);
        if (!best || d < best[2]) best = [a.unitid, b.unitid, d];
      }
    }
    edges.push([best![0], best![1]]);
    inTree.add(best![1]);
  }
  return edges;
}

/** A name short enough to sit under a node: "Univ. of Michigan-Ann Arbor". */
export function shortName(name: string, max = 26) {
  let s = name.replace(/-Main Campus$/, "").replace(/ Campus$/, "");
  if (s.length > max) s = s.replace(/University/g, "Univ.").replace(/College/g, "Coll.").replace(/Institute/g, "Inst.");
  if (s.length > max) s = `${s.slice(0, max - 1).trimEnd()}…`;
  return s;
}

/** Small deterministic pseudo-random number in [0, 1) from an integer, for organic jitter. */
export function hash01(n: number) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** True when the reader has asked the system for less motion. */
export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
