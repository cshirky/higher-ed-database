// The triangle comparison: three institutions, and every "thing" about them —
// a trait such as "Public" or "In a small town", or a major — sorted into the
// seven regions of a three-set Venn diagram by which of the three have it.
//
// Pure functions over already-fetched profiles (see getTriangleProfiles in
// src/db/queries.ts), so the sorting can be reasoned about apart from the data.
// Numbers are banded into traits on purpose: "admits 15%" and "admits 20%" are
// the same thing to a student choosing where to apply, and a shared band is
// what lets two schools land in the same region. The page shows the actual
// figures alongside, so a pair that straddles a band edge is visible as such.
import { CIP_PREFIX_LABELS } from "./cip-labels";
import { CIP_SERIES_LABELS } from "./cip-series-labels";
import { CENSUS_REGION, STATE_NAMES } from "./us-states";
import { LETTERS, type Letter } from "./triangle-letters";
export { LETTERS, LETTER_COLORS, type Letter } from "./triangle-letters";

/** Every non-empty subset of {A, B, C}, in display order: all three first, then pairs, then each alone. */
export const REGIONS = ["ABC", "AB", "BC", "AC", "A", "B", "C"] as const;
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
    name: "State",
    value: (p) => (p.state ? { key: `state-${p.state}`, label: `In ${STATE_NAMES[p.state] ?? p.state}` } : null),
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
    name: "Selectivity",
    value: (p) =>
      band(p.admitRate, [
        { min: 75, key: "admit-75", label: "Admits 75% or more of applicants" },
        { min: 50, key: "admit-50", label: "Admits 50–75% of applicants" },
        { min: 25, key: "admit-25", label: "Admits 25–50% of applicants" },
        { min: 0, key: "admit-0", label: "Admits fewer than 25% of applicants" },
      ]),
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
    name: "Graduation rate",
    value: (p) =>
      band(p.gradRate, [
        { min: 80, key: "grad-80", label: "80%+ of students graduate" },
        { min: 60, key: "grad-60", label: "60–80% of students graduate" },
        { min: 40, key: "grad-40", label: "40–60% of students graduate" },
        { min: 0, key: "grad-0", label: "Under 40% of students graduate" },
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

/** Things grouped by region; majors within a region ordered by degrees conferred across its members, most first. */
export function thingsByRegion(things: Thing[]): Record<Region, Thing[]> {
  const out = Object.fromEntries(REGIONS.map((r) => [r, [] as Thing[]])) as Record<Region, Thing[]>;
  for (const t of things) out[regionOf(t.members)].push(t);
  const total = (t: Thing) => Object.values(t.degrees ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  for (const r of REGIONS) {
    out[r].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "trait" ? -1 : 1;
      if (a.kind === "major") return total(b) - total(a) || a.label.localeCompare(b.label);
      return 0; // traits keep facet order
    });
  }
  return out;
}
