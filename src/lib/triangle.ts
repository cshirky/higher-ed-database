// The triangle comparison: three institutions, and every "thing" about them —
// a trait such as "Public" or "In a small town", or a major — sorted into the
// seven regions of a three-set Venn diagram by which of the three have it.
//
// Pure functions over already-fetched profiles (see getTriangleProfiles in
// src/db/queries.ts), so the sorting can be reasoned about apart from the data.
// Most numbers are banded into traits ("Medium (5,000–15,000 undergrads)"), so
// two schools in one band share a trait. Admit, yield, and graduation rates are
// instead compared directly: two schools are alike on one when their rates are
// less than RATE_TOLERANCE points apart. The page shows the actual figures
// alongside, so a pair that straddles a band edge is visible as such.
import { CIP_PREFIX_LABELS } from "./cip-labels";
import { CIP_SERIES_LABELS } from "./cip-series-labels";
import { CENSUS_REGION } from "./us-states";
import { LETTERS, type Letter } from "./triangle-letters";
import { RATE_TOLERANCE } from "./rate-tolerance";
export { LETTERS, LETTER_COLORS, type Letter } from "./triangle-letters";

/** Every non-empty subset of {A, B, C}, in display order: all three first, then pairs, then each alone. */
export const REGIONS = ["ABC", "AB", "AC", "BC", "A", "B", "C"] as const;
export type Region = (typeof REGIONS)[number];

export type TriangleProfile = {
  unitid: number;
  name: string;
  city: string | null;
  state: string | null;
  /** IPEDS CONTROL: 1 public, 2 private nonprofit. */
  control: number | null;
  /** IPEDS urban-centric locale, 11–43. */
  locale: number | null;
  /** IPEDS HLOFFER, 1–9. */
  highestOffering: number | null;
  hbcu: boolean;
  tribal: boolean;
  undergradTotal: number | null;
  /** Whole-number percentages, as stored. */
  admitRate: number | null;
  /** Share of admitted students who enrolled. */
  yieldRate: number | null;
  gradRate: number | null;
  pctNonresident: number | null;
  pctExclusivelyDistanceEd: number | null;
  /** SAT-scale test score — see src/lib/selectivity.ts. */
  satIndex: number | null;
  /** Published annual cost of attendance, dollars — see costOfAttendance in src/db/queries.ts. */
  costOfAttendance: number | null;
  /** Bachelor's degrees conferred by 4-digit CIP series ("11.07"); empty when none were reported. */
  majors: Map<string, number>;
};

export type ThingKind = "trait" | "major";

export type Thing = {
  key: string;
  kind: ThingKind;
  label: string;
  /** For a trait, what it is a value of ("Setting", "Size"). */
  facet?: string;
  /** Which of the three have it. */
  members: Letter[];
  /** Which of the three report nothing to judge it by — so its absence there is not a real difference. */
  unknownFor: Letter[];
  /** For a compared rate, each member's figure. */
  rates?: Partial<Record<Letter, number>>;
  /** For a major, its 4-digit CIP series ("11.07"). */
  series?: string;
  /** For a major, bachelor's degrees conferred at each member. */
  degrees?: Partial<Record<Letter, number>>;
  /**
   * For a major, the non-members that offer a near-twin of it: a major none
   * of the members has, in the same 2-digit CIP family, where one of the two
   * is that family's catch-all ("…, General" or "…, Other"). CIP divides some
   * subjects in ways a student would not — Psychology, General at one school,
   * Research and Experimental Psychology at another — so a major "only" one
   * school has may be the same subject under another code. Two specific
   * majors in one family are not twins (Economics and Sociology are both
   * Social Sciences), and neither is a major the members also offer
   * (Mathematics everywhere does not match Statistics at one school).
   */
  relatedAt?: { letter: Letter; majors: string[] }[];
};

// A facet maps one institution to a trait: a value it has, `false` when it is
// known not to have this kind of trait at all (not an HBCU), or `null` when
// the data to tell is missing.
type FacetValue = { key: string; label: string } | false | null;
type Facet = { name: string; value: (p: TriangleProfile) => FacetValue };

function band(
  v: number | null,
  bands: { min: number; key: string; label: string }[],
): FacetValue {
  if (v == null) return null;
  // Highest threshold first, so the first band v clears is its band.
  const b = bands.find((b) => v >= b.min);
  return b ? { key: b.key, label: b.label } : null;
}

const flag = (key: string, label: string, test: (p: TriangleProfile) => boolean | null): Facet => ({
  name: label,
  value: (p) => {
    const t = test(p);
    return t == null ? null : t ? { key, label } : false;
  },
});

const usd = (n: number) => `$${n / 1000}k`;

const FACETS: Facet[] = [
  {
    name: "Type",
    value: (p) =>
      p.control === 1
        ? { key: "public", label: "Public" }
        : p.control === 2
          ? { key: "private", label: "Private nonprofit" }
          : null,
  },
  {
    name: "Setting",
    value: (p) => {
      if (p.locale == null) return null;
      const kind = Math.floor(p.locale / 10);
      const setting = { 1: "In a city", 2: "In a suburb", 3: "In a town", 4: "In a rural area" }[kind];
      return setting ? { key: `setting-${kind}`, label: setting } : null;
    },
  },
  {
    name: "Region",
    value: (p) => {
      const region = p.state ? CENSUS_REGION[p.state] : undefined;
      return region ? { key: `region-${region}`, label: `In the ${region}` } : null;
    },
  },
  {
    name: "Size",
    value: (p) =>
      band(p.undergradTotal, [
        { min: 15000, key: "size-large", label: "Large (15,000+ undergrads)" },
        { min: 5000, key: "size-medium", label: "Medium (5,000–15,000 undergrads)" },
        { min: 0, key: "size-small", label: "Small (under 5,000 undergrads)" },
      ]),
  },
  {
    name: "Highest degree",
    value: (p) => {
      const h = p.highestOffering;
      if (h == null) return null;
      if (h >= 9) return { key: "degree-doctoral", label: "Grants doctorates" };
      if (h >= 7) return { key: "degree-masters", label: "Grants master's, but not doctorates" };
      return { key: "degree-undergrad", label: "Undergraduate degrees only" };
    },
  },
  {
    name: "Test scores",
    value: (p) =>
      band(p.satIndex, [
        { min: 1400, key: "sat-1400", label: "Typical SAT 1400+ (or ACT equivalent)" },
        { min: 1200, key: "sat-1200", label: "Typical SAT 1200–1400 (or ACT equivalent)" },
        { min: 1000, key: "sat-1000", label: "Typical SAT 1000–1200 (or ACT equivalent)" },
        { min: 0, key: "sat-0", label: "Typical SAT under 1000 (or ACT equivalent)" },
      ]),
  },
  {
    name: "Cost",
    value: (p) =>
      band(p.costOfAttendance, [
        { min: 70000, key: "cost-70", label: `Sticker price ${usd(70000)}+ a year` },
        { min: 50000, key: "cost-50", label: `Sticker price ${usd(50000)}–${usd(70000)} a year` },
        { min: 30000, key: "cost-30", label: `Sticker price ${usd(30000)}–${usd(50000)} a year` },
        { min: 0, key: "cost-0", label: `Sticker price under ${usd(30000)} a year` },
      ]),
  },
  flag("hbcu", "Historically Black college or university", (p) => p.hbcu),
  flag("tribal", "Tribal college", (p) => p.tribal),
  flag("international", "10%+ of students are international", (p) =>
    p.pctNonresident == null ? null : p.pctNonresident >= 10,
  ),
  flag("online", "Most students study fully online", (p) =>
    p.pctExclusivelyDistanceEd == null ? null : p.pctExclusivelyDistanceEd >= 50,
  ),
];

export { RATE_TOLERANCE };

type RateFacet = {
  name: string;
  key: string;
  value: (p: TriangleProfile) => number | null;
  /** `range` is "15%" for one school, or "15–18%" for a group. */
  label: (range: string) => string;
};

const RATE_FACETS: RateFacet[] = [
  { name: "Selectivity", key: "admit", value: (p) => p.admitRate, label: (r) => `Admits ${r} of applicants` },
  { name: "Yield", key: "yield", value: (p) => p.yieldRate, label: (r) => `${r} of admitted students enroll` },
  { name: "Graduation rate", key: "grad", value: (p) => p.gradRate, label: (r) => `${r} of students graduate` },
];

/**
 * Splits the schools that report a rate into groups that count as the same:
 * all of them if every pair is within tolerance, otherwise the closest pair
 * that is (if any), and everyone else alone. "Within tolerance" is not
 * transitive — 50%, 53%, 56% — so in that case the middle school goes with
 * whichever neighbour is nearer (the first pair on a tie) and the far one
 * stands apart.
 */
export function groupRates(values: [Letter, number][]): Letter[][] {
  const close = (a: number, b: number) => Math.abs(a - b) < RATE_TOLERANCE;
  const nums = values.map(([, v]) => v);
  if (values.length >= 2 && Math.max(...nums) - Math.min(...nums) < RATE_TOLERANCE) {
    return [values.map(([l]) => l)];
  }
  let best: [number, number] | null = null;
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const d = Math.abs(values[i][1] - values[j][1]);
      if (close(values[i][1], values[j][1]) && (!best || d < Math.abs(values[best[0]][1] - values[best[1]][1]))) {
        best = [i, j];
      }
    }
  }
  return best
    ? [[values[best[0]][0], values[best[1]][0]], ...values.filter((_, k) => !best.includes(k)).map(([l]) => [l])]
    : values.map(([l]) => [l]);
}

/** A family's general or leftover series — "Biology, General", "Engineering, Other". */
function isCatchAll(series: string) {
  return /, (General|Other)$/.test(CIP_SERIES_LABELS[series] ?? "");
}

export function majorLabel(series: string) {
  return CIP_SERIES_LABELS[series] ?? CIP_PREFIX_LABELS[series.slice(0, 2)] ?? `CIP ${series}`;
}

export function regionOf(members: Letter[]): Region {
  return members.join("") as Region;
}

/** Every trait and major any of the three has, each tagged with who has it. */
export function triangleThings(profiles: Record<Letter, TriangleProfile>): Thing[] {
  const things: Thing[] = [];

  for (const facet of FACETS) {
    const values = LETTERS.map((l) => [l, facet.value(profiles[l])] as const);
    const unknownFor = values.filter(([, v]) => v === null).map(([l]) => l);
    const byKey = new Map<string, Thing>();
    for (const [letter, v] of values) {
      if (!v) continue;
      const thing = byKey.get(v.key) ?? {
        key: v.key,
        kind: "trait" as const,
        label: v.label,
        facet: facet.name,
        members: [],
        unknownFor,
      };
      thing.members.push(letter);
      byKey.set(v.key, thing);
    }
    things.push(...byKey.values());
  }

  for (const facet of RATE_FACETS) {
    const values = LETTERS.map((l) => [l, facet.value(profiles[l])] as const);
    const unknownFor = values.filter(([, v]) => v == null).map(([l]) => l);
    const known = values.filter((e): e is [Letter, number] => e[1] != null).map(([l, v]) => [l, Math.round(v)] as [Letter, number]);
    for (const members of groupRates(known)) {
      const rates = Object.fromEntries(known.filter(([l]) => members.includes(l)));
      const lo = Math.min(...Object.values(rates));
      const hi = Math.max(...Object.values(rates));
      things.push({
        key: `${facet.key}-${members.join("")}`,
        kind: "trait",
        label: facet.label(lo === hi ? `${lo}%` : `${lo}–${hi}%`),
        facet: facet.name,
        members,
        unknownFor,
        rates,
      });
    }
  }

  // An institution that reported no bachelor's degrees at all is unknown on
  // every major, not lacking all of them.
  const noMajors = LETTERS.filter((l) => profiles[l].majors.size === 0);
  const series = new Set(LETTERS.flatMap((l) => [...profiles[l].majors.keys()]));
  for (const s of series) {
    const members = LETTERS.filter((l) => profiles[l].majors.has(s));
    things.push({
      key: `major-${s}`,
      kind: "major",
      series: s,
      label: majorLabel(s),
      members,
      unknownFor: noMajors,
      degrees: Object.fromEntries(members.map((l) => [l, profiles[l].majors.get(s)!])),
      relatedAt: LETTERS.filter((l) => !members.includes(l) && !noMajors.includes(l))
        .map((l) => ({
          letter: l,
          majors: [...profiles[l].majors.keys()]
            .filter(
              (other) =>
                other.slice(0, 2) === s.slice(0, 2) &&
                (isCatchAll(s) || isCatchAll(other)) &&
                !members.some((m) => profiles[m].majors.has(other)),
            )
            .map(majorLabel),
        }))
        .filter((r) => r.majors.length > 0),
    });
  }

  return things;
}

// Traits within a region read in this order; flags (HBCU, international, …) follow.
const TRAIT_ORDER = [
  "Type", "Setting", "Region", "Size", "Highest degree",
  "Selectivity", "Test scores", "Yield", "Graduation rate", "Cost",
];
const traitRank = (t: Thing) => {
  const i = TRAIT_ORDER.indexOf(t.facet ?? "");
  return i === -1 ? TRAIT_ORDER.length : i;
};

/** Things grouped by region; majors within a region ordered by degrees conferred across its members, most first. */
export function thingsByRegion(things: Thing[]): Record<Region, Thing[]> {
  const out = Object.fromEntries(REGIONS.map((r) => [r, [] as Thing[]])) as Record<Region, Thing[]>;
  for (const t of things) out[regionOf(t.members)].push(t);
  const total = (t: Thing) => Object.values(t.degrees ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  for (const r of REGIONS) {
    out[r].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "trait" ? -1 : 1;
      if (a.kind === "major") return total(b) - total(a) || a.label.localeCompare(b.label);
      return traitRank(a) - traitRank(b); // stable, so flags keep their order
    });
  }
  return out;
}
