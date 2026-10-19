import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "./index";
import { satIndex } from "@/lib/selectivity";
import type { TriangleProfile } from "@/lib/triangle";
import {
  institutionYears,
  admissions,
  enrollment,
  completions,
  graduationRates,
  finance,
  pricing,
  financialAid,
  nationwideTrends,
  academicSimilarity,
  institutionDepartures,
  completionsByField,
} from "./schema";

// The most recent year we treat as "current" for browse/comparison views.
// Time-series pages pull every year present regardless of this constant.
//
// 2024 is IPEDS's provisional 2024-25 release, which does not yet include the
// IC (pricing) or SFA (financial aid) components — so there are no 2024 rows in
// those two tables. Everything else has full 2024 coverage. Bumping this constant requires
// re-running scripts/etl/materialize.ts, which must use the same value.
export const DEFAULT_YEAR = 2024;

/** "2024-25" for 2024: `year` is the fall year of the collection cycle. */
export function academicYearLabel(year: number) {
  return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
}

export type InstitutionSearchParams = {
  q?: string;
  state?: string;
  institutionType?: string;
  page?: number;
  pageSize?: number;
};

export async function searchInstitutions(params: InstitutionSearchParams) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 25;

  const conditions = [eq(institutionYears.year, DEFAULT_YEAR)];
  // % and _ are LIKE wildcards; escape them (backslash is Postgres's default
  // escape character) so a search for "a_m" does not match every "ama".
  const q = params.q?.trim();
  if (q) conditions.push(ilike(institutionYears.name, `%${q.replace(/[\\%_]/g, "\\$&")}%`));
  if (params.state) conditions.push(eq(institutionYears.state, params.state));
  if (params.institutionType) conditions.push(eq(institutionYears.institutionType, params.institutionType));

  const where = and(...conditions);

  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(institutionYears)
      .where(where)
      .orderBy(asc(institutionYears.name))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(institutionYears).where(where),
  ]);

  return { rows, total: count, page, pageSize };
}

export async function getStateList() {
  const rows = await db
    .selectDistinct({ state: institutionYears.state })
    .from(institutionYears)
    .where(eq(institutionYears.year, DEFAULT_YEAR))
    .orderBy(asc(institutionYears.state));
  return rows.map((r) => r.state).filter((s): s is string => !!s);
}

export async function getInstitution(unitid: number) {
  const rows = await db
    .select()
    .from(institutionYears)
    .where(eq(institutionYears.unitid, unitid))
    .orderBy(desc(institutionYears.year))
    .limit(1);
  return rows[0] ?? null;
}

export type Departure =
  | { kind: "left_scope"; reason: "for_profit" | "not_degree_granting"; year: number }
  | { kind: "merged"; year: number; intoUnitid: number; intoName: string | null; intoIsCurrent: boolean }
  | { kind: "closed"; year: number; closedOn: string }
  | { kind: "stopped_reporting"; year: number };

/**
 * Why an institution has no row in the current year, from what the loader
 * recorded. A merger or closure recorded on its last row comes first — it is
 * the more specific account, and an institution wound down by a merger can
 * also stop granting degrees on the way out (Wesley College, 2021). Then a
 * departure from scope (institution_departures), and otherwise only that it
 * stopped reporting. Null for an institution in the current year's data.
 */
export async function getDeparture(
  institution: typeof institutionYears.$inferSelect,
  year = DEFAULT_YEAR,
): Promise<Departure | null> {
  if (institution.year >= year) return null;
  const endYear = institution.endYear ?? institution.year;
  if (institution.mergedInto) {
    const [current] = await db
      .select({ name: institutionYears.name })
      .from(institutionYears)
      .where(and(eq(institutionYears.unitid, institution.mergedInto), eq(institutionYears.year, year)));
    return {
      kind: "merged",
      year: endYear,
      intoUnitid: institution.mergedInto,
      intoName: current?.name ?? institution.mergedIntoName,
      intoIsCurrent: current != null,
    };
  }
  if (institution.closedOn) return { kind: "closed", year: endYear, closedOn: institution.closedOn };
  const [left] = await db
    .select()
    .from(institutionDepartures)
    .where(eq(institutionDepartures.unitid, institution.unitid))
    .orderBy(desc(institutionDepartures.year))
    .limit(1);
  if (left && left.year > institution.year) {
    return { kind: "left_scope", reason: left.reason as "for_profit" | "not_degree_granting", year: left.year };
  }
  return { kind: "stopped_reporting", year: institution.year };
}

export async function getInstitutionTimeSeries(unitid: number) {
  const [
    admissionsRows,
    enrollmentRows,
    completionsRows,
    graduationRows,
    financeRows,
    pricingRows,
    financialAidRows,
  ] = await Promise.all([
    db.select().from(admissions).where(eq(admissions.unitid, unitid)).orderBy(asc(admissions.year)),
    db.select().from(enrollment).where(eq(enrollment.unitid, unitid)).orderBy(asc(enrollment.year)),
    db.select().from(completions).where(eq(completions.unitid, unitid)).orderBy(asc(completions.year)),
    db.select().from(graduationRates).where(eq(graduationRates.unitid, unitid)).orderBy(asc(graduationRates.year)),
    db.select().from(finance).where(eq(finance.unitid, unitid)).orderBy(asc(finance.year)),
    db.select().from(pricing).where(eq(pricing.unitid, unitid)).orderBy(asc(pricing.year)),
    db.select().from(financialAid).where(eq(financialAid.unitid, unitid)).orderBy(asc(financialAid.year)),
  ]);

  return {
    admissions: admissionsRows,
    enrollment: enrollmentRows,
    completions: completionsRows,
    graduationRates: graduationRows,
    finance: financeRows,
    pricing: pricingRows,
    financialAid: financialAidRows,
  };
}

export type NationwideTrendRow = {
  year: number;
  institutionType: "college" | "university" | "graduate_school";
  institutionCount: number;
  totalEnrollment: number | null;
  avgAdmitRate: number | null;
  avgTuition: number | null;
  avgGradRate: number | null;
  avgInstructionExpense: number | null;
};

export async function getNationwideTrends(): Promise<NationwideTrendRow[]> {
  // Precomputed by scripts/etl/materialize.ts — see .claude/skills/precompute-over-live-query.
  const rows = await db
    .select()
    .from(nationwideTrends)
    .orderBy(asc(nationwideTrends.year), asc(nationwideTrends.institutionType));
  return rows.map((r) => ({
    year: r.year,
    institutionType: r.institutionType as NationwideTrendRow["institutionType"],
    institutionCount: r.institutionCount,
    totalEnrollment: r.totalEnrollment,
    avgAdmitRate: r.avgAdmitRate,
    avgTuition: r.avgTuition,
    avgGradRate: r.avgGradRate,
    avgInstructionExpense: r.avgInstructionExpense,
  }));
}

export type AcademicPeer = {
  unitid: number;
  name: string;
  state: string | null;
  /** IPEDS CONTROL: 1 public, 2 private nonprofit. */
  control: number | null;
  /** Whole-number percentage (47 meaning 47%), same convention as pctAdmittedTotal. */
  yieldTotal: number | null;
  /** Whole-number percentage. */
  gradRateTotal: number | null;
  /** Whole-number percentage of applicants admitted. */
  admitRate: number | null;
  /** Test score on the SAT's 400–1600 scale — see src/lib/selectivity.ts. */
  satIndex: number | null;
  undergradTotal: number | null;
  totalEnrollment: number | null;
  /** Published annual cost of attendance in dollars — see `costOfAttendance` below. */
  costOfAttendance: number | null;
  /** Largest subject areas by bachelor's degrees conferred, most first: 2-digit CIP prefix and count. */
  topMajors: { prefix: string; total: number }[];
  /** Academic-similarity rank among all stored peers; null on the target itself. */
  rank: number | null;
  isTarget: boolean;
};

/** A peer this many points or more below the target on yield or graduation rate is not selected. */
export const PEER_FLOOR_POINTS = 10;

const mean = (values: (number | null)[]) => {
  const present = values.filter((v): v is number => v != null);
  return present.length > 0 ? present.reduce((a, b) => a + b, 0) / present.length : null;
};

/**
 * One cost-of-attendance figure per institution: the average of the in-state
 * and out-of-state totals (tuition, fees, books, room and board, other
 * expenses), since nothing here knows where the reader lives. Private
 * institutions charge both the same, so for them it is simply the price.
 * On-campus totals where published, off-campus otherwise — many commuter
 * institutions report only the latter.
 */
export function costOfAttendance(p: typeof pricing.$inferSelect): number | null {
  return (
    mean([p.inStateTotalOnCampus, p.outStateTotalOnCampus]) ??
    mean([p.inStateTotalOffCampus, p.outStateTotalOffCampus])
  );
}

/**
 * The target institution plus the `limit` nearest academic peers worth
 * comparing it against, carrying the measures the peer table shows.
 * Peers come from `academic_similarity` (see .claude/skills/academic-similarity),
 * which is restricted to the same institution_type.
 *
 * The selection is deliberately one-sided: the comparison exists to surface
 * comparable-or-better institutions, so a peer PEER_FLOOR_POINTS or more below
 * the target on yield or on graduation rate is passed over, as is one that
 * reports neither and so could not be placed. The table stores more peers per
 * institution than `limit` for exactly this reason (ACADEMIC_PEER_LIMIT in
 * scripts/etl/materialize.ts); the result can still fall short when a target
 * outperforms most of its stored peers.
 *
 * When the target itself reports no yield or graduation rate there is nothing
 * to compare against, and the nearest `limit` peers are returned unfiltered
 * for the caller's table.
 */
export async function getAcademicPeerComparison(
  unitid: number,
  year = DEFAULT_YEAR,
  limit = 12,
  majorsPerInstitution = 5,
): Promise<AcademicPeer[]> {
  const peers = await db
    .select({ peerUnitid: academicSimilarity.peerUnitid, rank: academicSimilarity.rank })
    .from(academicSimilarity)
    .where(and(eq(academicSimilarity.unitid, unitid), eq(academicSimilarity.year, year)))
    .orderBy(asc(academicSimilarity.rank));

  const rankByUnitid = new Map(peers.map((p) => [p.peerUnitid, p.rank]));
  const ids = [unitid, ...peers.map((p) => p.peerUnitid)];

  const majorPrefix = sql<string>`LEFT(${completionsByField.cipCode}, 2)`;
  const [rows, pricingRows, majorRows] = await Promise.all([
    db
      .select({
        unitid: institutionYears.unitid,
        name: institutionYears.name,
        state: institutionYears.state,
        control: institutionYears.control,
        gradRateTotal: graduationRates.gradRateTotal,
        undergradTotal: enrollment.undergradTotal,
        totalEnrollment: enrollment.total,
        admissions,
      })
      .from(institutionYears)
      .leftJoin(admissions, and(eq(admissions.unitid, institutionYears.unitid), eq(admissions.year, institutionYears.year)))
      .leftJoin(
        graduationRates,
        and(eq(graduationRates.unitid, institutionYears.unitid), eq(graduationRates.year, institutionYears.year)),
      )
      .leftJoin(enrollment, and(eq(enrollment.unitid, institutionYears.unitid), eq(enrollment.year, institutionYears.year)))
      .where(and(eq(institutionYears.year, year), inArray(institutionYears.unitid, ids))),
    // Pricing falls back one year: a provisional release ships without the IC
    // component, so the newest year has no pricing rows at all (see
    // DEFAULT_YEAR above). One year only — a figure two years stale misleads
    // more than a missing one.
    db
      .select()
      .from(pricing)
      .where(and(inArray(pricing.unitid, ids), inArray(pricing.year, [year, year - 1])))
      .orderBy(asc(pricing.year)),
    // Every subject area for every candidate, largest first; trimmed to the top
    // few per institution below. A few dozen rows each, so no window function.
    db
      .select({
        unitid: completionsByField.unitid,
        prefix: majorPrefix,
        total: sql<number>`SUM(${completionsByField.count})::int`,
      })
      .from(completionsByField)
      .where(
        and(
          inArray(completionsByField.unitid, ids),
          eq(completionsByField.year, year),
          eq(completionsByField.awardLevel, BACHELORS_AWARD_LEVEL),
        ),
      )
      .groupBy(completionsByField.unitid, majorPrefix)
      .orderBy(sql`SUM(${completionsByField.count}) DESC`, majorPrefix),
  ]);

  const byUnitid = new Map(rows.map((r) => [r.unitid, r]));
  // Ascending by year, so the current year's figure overwrites last year's
  // wherever both exist.
  const costByUnitid = new Map<number, number>();
  for (const p of pricingRows) {
    const cost = costOfAttendance(p);
    if (cost != null) costByUnitid.set(p.unitid, cost);
  }

  const majorsByUnitid = new Map<number, { prefix: string; total: number }[]>();
  for (const m of majorRows) {
    const list = majorsByUnitid.get(m.unitid) ?? [];
    if (list.length < majorsPerInstitution) list.push({ prefix: m.prefix, total: m.total });
    majorsByUnitid.set(m.unitid, list);
  }

  // In similarity order with the target first, so the table's default order
  // matches the ranking rather than whatever order Postgres returned.
  const points = ids
    .map((id) => {
      const row = byUnitid.get(id);
      if (!row) return null;
      return {
        unitid: row.unitid,
        name: row.name,
        state: row.state,
        control: row.control,
        yieldTotal: row.admissions?.yieldTotal ?? null,
        gradRateTotal: row.gradRateTotal,
        admitRate: row.admissions?.pctAdmittedTotal ?? null,
        satIndex: row.admissions ? satIndex(row.admissions) : null,
        undergradTotal: row.undergradTotal,
        totalEnrollment: row.totalEnrollment,
        costOfAttendance: costByUnitid.get(id) ?? null,
        topMajors: majorsByUnitid.get(id) ?? [],
        rank: rankByUnitid.get(id) ?? null,
        isTarget: id === unitid,
      };
    })
    .filter((p): p is AcademicPeer => p !== null);

  const target = points.find((p) => p.isTarget);
  if (!target) return [];
  const others = points.filter((p) => !p.isTarget);
  const { yieldTotal: targetYield, gradRateTotal: targetGradRate } = target;
  if (targetYield == null || targetGradRate == null) return [target, ...others.slice(0, limit)];

  const selected = others.filter(
    (p) =>
      p.yieldTotal != null &&
      p.gradRateTotal != null &&
      p.yieldTotal > targetYield - PEER_FLOOR_POINTS &&
      p.gradRateTotal > targetGradRate - PEER_FLOOR_POINTS,
  );
  return [target, ...selected.slice(0, limit)];
}

// IPEDS AWLEVEL 5. Everything this app shows is for students pursuing a
// bachelor's degree, so "majors" means bachelor's degrees conferred — not the
// MBAs, JDs and associate's degrees an all-levels total would fold in. Other
// award levels still count toward academic similarity, where the presence and
// scale of graduate programmes is part of what makes two schools alike.
const BACHELORS_AWARD_LEVEL = 5;

export async function getTopDegrees(unitid: number, year = DEFAULT_YEAR, limit = 5) {
  return db
    .select({
      prefix: sql<string>`LEFT(${completionsByField.cipCode}, 2)`,
      // SUM(integer) is bigint, which the driver hands back as a string; cast
      // so the count is a real number the page can format.
      total: sql<number>`SUM(${completionsByField.count})::int`,
    })
    .from(completionsByField)
    .where(
      and(
        eq(completionsByField.unitid, unitid),
        eq(completionsByField.year, year),
        eq(completionsByField.awardLevel, BACHELORS_AWARD_LEVEL),
      ),
    )
    .groupBy(sql`LEFT(${completionsByField.cipCode}, 2)`)
    .having(sql`SUM(${completionsByField.count}) > 0`)
    // Prefix as tiebreak so equal counts keep one order between requests.
    .orderBy(sql`SUM(${completionsByField.count}) DESC`, sql`LEFT(${completionsByField.cipCode}, 2)`)
    .limit(limit);
}

/**
 * Institutions a high-school student could apply to as a first-year student:
 * four-year (ICLEVEL 1) and offering undergraduate study. The triangle
 * comparison picks from these.
 */
const undergradFourYear = and(eq(institutionYears.iclevel, 1), eq(institutionYears.ugOffer, 1));

/**
 * Name matches for the triangle picker: names starting with the query first,
 * then larger undergraduate enrollment, so "michigan" puts the University of
 * Michigan ahead of every small college with Michigan somewhere in its name.
 */
export async function searchUndergradInstitutions(q: string, limit = 8, year = DEFAULT_YEAR) {
  const escaped = q.trim().replace(/[\\%_]/g, "\\$&");
  if (!escaped) return [];
  return db
    .select({
      unitid: institutionYears.unitid,
      name: institutionYears.name,
      city: institutionYears.city,
      state: institutionYears.state,
    })
    .from(institutionYears)
    .leftJoin(enrollment, and(eq(enrollment.unitid, institutionYears.unitid), eq(enrollment.year, institutionYears.year)))
    .where(and(eq(institutionYears.year, year), undergradFourYear, ilike(institutionYears.name, `%${escaped}%`)))
    .orderBy(
      sql`${institutionYears.name} ILIKE ${`${escaped}%`} DESC`,
      sql`${enrollment.undergradTotal} DESC NULLS LAST`,
      asc(institutionYears.name),
    )
    .limit(limit);
}

/** Everything the triangle comparison sorts, for the given institutions; missing or out-of-scope ids are left out. */
export async function getTriangleProfiles(unitids: number[], year = DEFAULT_YEAR): Promise<TriangleProfile[]> {
  const seriesPrefix = sql<string>`LEFT(${completionsByField.cipCode}, 5)`;
  const [rows, pricingRows, majorRows] = await Promise.all([
    db
      .select({
        institution: institutionYears,
        admissions,
        gradRateTotal: graduationRates.gradRateTotal,
        undergradTotal: enrollment.undergradTotal,
        pctNonresident: enrollment.pctNonresident,
        pctExclusivelyDistanceEd: enrollment.pctExclusivelyDistanceEd,
      })
      .from(institutionYears)
      .leftJoin(admissions, and(eq(admissions.unitid, institutionYears.unitid), eq(admissions.year, institutionYears.year)))
      .leftJoin(
        graduationRates,
        and(eq(graduationRates.unitid, institutionYears.unitid), eq(graduationRates.year, institutionYears.year)),
      )
      .leftJoin(enrollment, and(eq(enrollment.unitid, institutionYears.unitid), eq(enrollment.year, institutionYears.year)))
      .where(and(eq(institutionYears.year, year), undergradFourYear, inArray(institutionYears.unitid, unitids))),
    // One year's fallback, as in getAcademicPeerComparison.
    db
      .select()
      .from(pricing)
      .where(and(inArray(pricing.unitid, unitids), inArray(pricing.year, [year, year - 1])))
      .orderBy(asc(pricing.year)),
    db
      .select({
        unitid: completionsByField.unitid,
        series: seriesPrefix,
        total: sql<number>`SUM(${completionsByField.count})::int`,
      })
      .from(completionsByField)
      .where(
        and(
          inArray(completionsByField.unitid, unitids),
          eq(completionsByField.year, year),
          eq(completionsByField.awardLevel, BACHELORS_AWARD_LEVEL),
        ),
      )
      .groupBy(completionsByField.unitid, seriesPrefix)
      .having(sql`SUM(${completionsByField.count}) > 0`),
  ]);

  const costByUnitid = new Map<number, number>();
  for (const p of pricingRows) {
    const cost = costOfAttendance(p);
    if (cost != null) costByUnitid.set(p.unitid, cost);
  }
  const majorsByUnitid = new Map<number, Map<string, number>>();
  for (const m of majorRows) {
    const majors = majorsByUnitid.get(m.unitid) ?? new Map<string, number>();
    majors.set(m.series, m.total);
    majorsByUnitid.set(m.unitid, majors);
  }

  return rows.map(({ institution: i, ...r }) => ({
    unitid: i.unitid,
    name: i.name,
    city: i.city,
    state: i.state,
    control: i.control,
    locale: i.locale,
    highestOffering: i.highestOffering,
    hbcu: i.hbcu === 1,
    tribal: i.tribal === 1,
    undergradTotal: r.undergradTotal,
    admitRate: r.admissions?.pctAdmittedTotal ?? null,
    gradRate: r.gradRateTotal,
    pctNonresident: r.pctNonresident,
    pctExclusivelyDistanceEd: r.pctExclusivelyDistanceEd,
    satIndex: r.admissions ? satIndex(r.admissions) : null,
    costOfAttendance: costByUnitid.get(i.unitid) ?? null,
    majors: majorsByUnitid.get(i.unitid) ?? new Map(),
  }));
}
