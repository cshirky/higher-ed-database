import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "./index";
import { satIndex } from "@/lib/selectivity";
import {
  institutionYears,
  admissions,
  enrollment,
  completions,
  graduationRates,
  finance,
  pricing,
  faculty,
  financialAid,
  nationwideTrends,
  peerNetwork,
  academicSimilarity,
  completionsByField,
} from "./schema";

// The most recent year we treat as "current" for browse/comparison views.
// Time-series pages pull every year present regardless of this constant.
//
// 2024 is IPEDS's provisional 2024-25 release, which does not yet include the
// IC (pricing) or SFA (financial aid) components — so there are no 2024 rows in
// those two tables, and peer_network's tuition dimension drops out for this
// year. Everything else has full 2024 coverage. Bumping this constant requires
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
    .orderBy(desc(institutionYears.year));
  return rows[0] ?? null;
}

export async function getInstitutionTimeSeries(unitid: number) {
  const [
    institutionRows,
    admissionsRows,
    enrollmentRows,
    completionsRows,
    graduationRows,
    financeRows,
    pricingRows,
    facultyRows,
    financialAidRows,
  ] = await Promise.all([
    db.select().from(institutionYears).where(eq(institutionYears.unitid, unitid)).orderBy(asc(institutionYears.year)),
    db.select().from(admissions).where(eq(admissions.unitid, unitid)).orderBy(asc(admissions.year)),
    db.select().from(enrollment).where(eq(enrollment.unitid, unitid)).orderBy(asc(enrollment.year)),
    db.select().from(completions).where(eq(completions.unitid, unitid)).orderBy(asc(completions.year)),
    db.select().from(graduationRates).where(eq(graduationRates.unitid, unitid)).orderBy(asc(graduationRates.year)),
    db.select().from(finance).where(eq(finance.unitid, unitid)).orderBy(asc(finance.year)),
    db.select().from(pricing).where(eq(pricing.unitid, unitid)).orderBy(asc(pricing.year)),
    db.select().from(faculty).where(eq(faculty.unitid, unitid)).orderBy(asc(faculty.year)),
    db.select().from(financialAid).where(eq(financialAid.unitid, unitid)).orderBy(asc(financialAid.year)),
  ]);

  return {
    institution: institutionRows,
    admissions: admissionsRows,
    enrollment: enrollmentRows,
    completions: completionsRows,
    graduationRates: graduationRows,
    finance: financeRows,
    pricing: pricingRows,
    faculty: facultyRows,
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

// peer_network and academic_similarity are both (unitid, year, rank, peer_unitid,
// distance) — shared shape, so one helper reads either.
function peersFromTable(
  table: typeof peerNetwork | typeof academicSimilarity,
  unitid: number,
  year: number,
  limit: number,
) {
  return db
    .select({
      unitid: table.peerUnitid,
      distance: table.distance,
      name: institutionYears.name,
      state: institutionYears.state,
      institutionType: institutionYears.institutionType,
    })
    .from(table)
    .innerJoin(institutionYears, and(eq(institutionYears.unitid, table.peerUnitid), eq(institutionYears.year, table.year)))
    .where(and(eq(table.unitid, unitid), eq(table.year, year)))
    .orderBy(asc(table.rank))
    .limit(limit);
}

export async function getPeers(unitid: number, year = DEFAULT_YEAR, limit = 12) {
  // Precomputed by scripts/etl/materialize.ts — see .claude/skills/precompute-over-live-query.
  // Overall-profile similarity: IPEDS has no institution-to-institution relationship
  // data, so this is a derived nearest-neighbor graph over a handful of
  // z-normalized metrics (enrollment, admit rate, tuition, instructional spending),
  // restricted to the same institution_type.
  return peersFromTable(peerNetwork, unitid, year, limit);
}

export async function getAcademicPeers(unitid: number, year = DEFAULT_YEAR, limit = 12) {
  // Academic-program similarity — see .claude/skills/academic-similarity.
  return peersFromTable(academicSimilarity, unitid, year, limit);
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
function costOfAttendance(p: typeof pricing.$inferSelect): number | null {
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
    // Pricing falls back one year, as peer_network's inputs do in
    // materialize.ts: a provisional release ships without the IC component, so
    // the newest year has no pricing rows at all (see DEFAULT_YEAR above).
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
