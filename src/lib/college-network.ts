// The college network: one target school and up to NETWORK_SIZE schools with a
// similar mix of majors that are the same or better on every axis below.
// Pure, so the five client-side views can share it; the query that fills it is
// getCollegeNetwork in src/db/queries.ts.

import { RATE_TOLERANCE } from "./rate-tolerance";

export const NETWORK_SIZE = 20;

/** A sticker price this close to the target's, as a fraction of it, counts as the same. */
export const COST_TOLERANCE = 0.1;

export type AxisKey = "yield" | "gradRate" | "cost";

export type Axis = {
  key: AxisKey;
  label: string;
  /** What "better" means on this axis, in a student's words. */
  better: string;
  help: string;
};

// Order is fixed and shared by every view, so an axis is always in the same slot.
export const AXES: Axis[] = [
  {
    key: "yield",
    label: "Yield",
    better: "more admitted students choose it",
    help: "Of the students it admits, the share who enroll. Higher means students pick it over their other offers.",
  },
  {
    key: "gradRate",
    label: "Graduation rate",
    better: "more students finish",
    help: "Share of students who finish a bachelor's degree within six years.",
  },
  {
    key: "cost",
    label: "Cost",
    better: "costs less",
    help: "Sticker price per year — tuition, fees, housing, food, and books before aid.",
  },
];

/**
 * "unknown" only when the target itself reports nothing on that axis, so no
 * school can be judged against it; a peer missing a figure the target has is
 * left out of the network instead.
 */
export type Verdict = "same" | "better" | "unknown";

export type NetworkSchool = {
  unitid: number;
  name: string;
  state: string | null;
  /** IPEDS CONTROL: 1 public, 2 private nonprofit. */
  control: number | null;
  undergrad: number | null;
  /** Undergraduates relative to the target's: 2 is twice as big. Null when either is unknown. */
  sizeRatio: number | null;
  values: Record<AxisKey, number | null>;
  verdicts: Record<AxisKey, Verdict>;
  betterCount: number;
  /** Academic-similarity rank among the target's peers, 1 nearest; 0 on the target. */
  rank: number;
  /** Largest bachelor's subject areas, most degrees first. */
  topMajors: string[];
};

/** Academic distance between two schools in the network, where either lists the other as a peer. */
export type NetworkLink = { a: number; b: number; distance: number };

export type CollegeNetwork = {
  target: NetworkSchool;
  /** In similarity order, nearest first. */
  peers: NetworkSchool[];
  links: NetworkLink[];
};

type Values = Record<AxisKey, number | null>;

/**
 * One peer's verdict on each axis against the target, or null when it is worse
 * on any axis, or silent on one the target reports.
 */
export function judge(target: Values, peer: Values): Record<AxisKey, Verdict> | null {
  const verdicts = {} as Record<AxisKey, Verdict>;
  for (const { key } of AXES) {
    const t = target[key];
    const p = peer[key];
    if (t == null) {
      verdicts[key] = "unknown";
      continue;
    }
    if (p == null) return null;
    // Positive when the peer is better: higher rates, lower prices.
    const gain = key === "cost" ? (t - p) / t : p - t;
    const tolerance = key === "cost" ? COST_TOLERANCE : RATE_TOLERANCE;
    if (gain <= -tolerance) return null;
    verdicts[key] = gain >= tolerance ? "better" : "same";
  }
  return verdicts;
}

// --- The collar: which schools a student weighing the target would also weigh.
// Academic similarity alone pairs Oberlin with Curtis (both award many music
// degrees) and with Hillsdale (same size and shape of liberal arts college),
// though almost nobody applies to both. Each rule below is checked before the
// same-or-better test, and a rule is skipped when either school's figure for
// it is missing.

/** The facts the collar reads, per school. */
export type CollarFacts = {
  /** Carnegie basic classification, 2015-or-later code list. */
  carnegieBasic: number | null;
  /** IPEDS RELAFFIL; null when the school has no religious affiliation. */
  religiousAffiliation: number | null;
  /** Share of the school's bachelor's degrees in each 2-digit CIP area, 0–1. */
  majorShares: Map<string, number>;
};

/** How many of the target's largest subject areas a peer must also teach. */
export const COLLAR_MAJORS = 3;
/** A peer "teaches" an area when at least this share of its bachelor's degrees are in it. */
export const COLLAR_MAJOR_SHARE = 0.01;

// Carnegie basic 24–32: four-year special-focus schools (seminaries, health
// sciences, engineering, business, arts/music/design, law, other). Their
// students are choosing a field first, so they compare with schools of the
// same focus, and a general college's students do not consider them.
function specialFocus(carnegie: number | null) {
  return carnegie != null && carnegie >= 24 && carnegie <= 32 ? carnegie : null;
}

// Affiliations where the tie to the church is mostly historical, so the
// college recruits like a secular one: mainline Protestant churches, Quakers,
// Unitarians, and the Catholic Church (Georgetown, Notre Dame and Boston
// College compete with secular universities for the same students). Every
// other affiliation (evangelical, Baptist, nondenominational, Latter-day Saints,
// Adventist, Jewish, and so on) marks a college whose religious mission is part
// of why students choose it, and those colleges are compared only with each other.
const HISTORIC_AFFILIATIONS = new Set([
  30, // Roman Catholic
  39, // Evangelical Lutheran Church (the ELCA, despite the name)
  44, // Moravian Church
  49, // Reformed Church in America
  52, // American Baptist
  58, // Church of Brethren
  61, // Christian Church (Disciples of Christ)
  65, // Friends
  66, // Presbyterian Church (USA)
  67, // Lutheran Church in America
  71, // United Methodist
  73, // Protestant Episcopal
  76, // United Church of Christ
  78, // Multiple Protestant Denomination
  93, // Unitarian Universalist
  103, // Presbyterian
]);

export function faithCentered(religiousAffiliation: number | null) {
  return religiousAffiliation != null && !HISTORIC_AFFILIATIONS.has(religiousAffiliation);
}

/** The target's largest subject areas, which every peer must teach. */
export function collarMajors(target: CollarFacts) {
  return [...target.majorShares.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, COLLAR_MAJORS)
    .map(([prefix]) => prefix);
}

/** Whether a student weighing the target would plausibly weigh the peer too. */
export function withinCollar(target: CollarFacts, peer: CollarFacts, majors = collarMajors(target)) {
  if (specialFocus(target.carnegieBasic) !== specialFocus(peer.carnegieBasic)) {
    if (target.carnegieBasic != null && peer.carnegieBasic != null) return false;
  }
  if (faithCentered(target.religiousAffiliation) !== faithCentered(peer.religiousAffiliation)) return false;
  return majors.every((m) => (peer.majorShares.get(m) ?? 0) >= COLLAR_MAJOR_SHARE);
}

export function formatValue(key: AxisKey, v: number | null) {
  if (v == null) return "—";
  return key === "cost" ? `$${Math.round(v).toLocaleString()}` : `${Math.round(v)}%`;
}

/** "2.1× as many undergrads", "about the same size", "40% as many". */
export function describeSize(ratio: number | null) {
  if (ratio == null) return "size unknown";
  if (ratio >= 0.9 && ratio <= 1.1) return "about the same size";
  if (ratio > 1) return `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}× as many undergrads`;
  return `${Math.round(ratio * 100)}% as many undergrads`;
}

/** Radius for a school drawn as a circle, area proportional to its undergraduates. */
export function sizeRadius(school: NetworkSchool, targetRadius: number, min = 4, max = targetRadius * 2.6) {
  const r = targetRadius * Math.sqrt(school.sizeRatio ?? 1);
  return Math.max(min, Math.min(max, r));
}

export function linkKey(a: number, b: number) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

// Identity colors for the three axes — violet, aqua, yellow, slots 7, 5 and 4
// of the categorical palette, validated as a set in both modes. Not slots 1–3,
// which mean institution type elsewhere (see .claude/skills/viz-color-conventions).
// Aqua and yellow are under 3:1 on the light surface, so a color always
// appears with its glyph, never alone.
export const AXIS_COLOR: Record<AxisKey, string> = {
  yield: "var(--series-7)",
  gradRate: "var(--series-5)",
  cost: "var(--series-4)",
};
/** The same colors as fixed hex, for views drawn on their own light or dark backdrop whatever the system theme. */
export const AXIS_COLOR_ON_LIGHT: Record<AxisKey, string> = {
  yield: "#4a3aa7",
  gradRate: "#1baf7a",
  cost: "#eda100",
};
export const AXIS_COLOR_ON_DARK: Record<AxisKey, string> = {
  yield: "#9085e9",
  gradRate: "#199e70",
  cost: "#c98500",
};
export const AXIS_GLYPH: Record<AxisKey, string> = { yield: "Y", gradRate: "G", cost: "$" };

/** The axes a school is better on, as glyphs in axis order: "", "G", "Y$", "YG$". */
export function patternKey(s: NetworkSchool) {
  return AXES.filter((a) => s.verdicts[a.key] === "better")
    .map((a) => AXIS_GLYPH[a.key])
    .join("");
}

/** Every pattern, from same-on-everything to better-on-everything. */
export const PATTERNS: readonly string[] = ["", "Y", "G", "$", "YG", "Y$", "G$", "YG$"];

/** "better on yield and cost", "the same on everything". */
export function describePattern(pattern: string) {
  const axes = AXES.filter((a) => pattern.includes(AXIS_GLYPH[a.key])).map((a) => a.label.toLowerCase());
  if (axes.length === 0) return "the same on everything";
  return `better on ${axes.length <= 2 ? axes.join(" and ") : `${axes.slice(0, -1).join(", ")}, and ${axes.at(-1)}`}`;
}
