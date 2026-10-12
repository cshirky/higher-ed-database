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
  if (params.q) conditions.push(ilike(institutionYears.name, `%${params.q}%`));
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

export type SimilarityPoint = {
  unitid: number;
  name: string;
  state: string | null;
  /** Whole-number percentage (47 meaning 47%), same convention as pctAdmittedTotal. */
  yieldTotal: number | null;
  /** Whole-number percentage. */
  gradRateTotal: number | null;
  /** Whole-number percentage of applicants admitted. */
  admitRate: number | null;
  /** Test score on the SAT's 400–1600 scale — see src/lib/selectivity.ts. */
  satIndex: number | null;
  undergradTotal: number | null;
  /** Published annual cost of attendance in dollars — see `costOfAttendance` below. */
  costOfAttendance: number | null;
  /** Academic-similarity distance from the target; null on the target itself. */
  distance: number | null;
  isTarget: boolean;
};

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
 * The target institution plus its nearest academic peers, carrying the
 * measures the similarity scatter encodes. Peers come from
 * `academic_similarity` (see .claude/skills/academic-similarity), which is
 * restricted to the same institution_type — so every point on the chart is the
 * same kind of institution as the target, and colouring by type would be
 * monochrome.
 *
 * Points missing a measure are returned rather than filtered out, so the
 * caller can say how many could not be plotted instead of dropping them
 * silently.
 */
export async function getAcademicSimilarityScatter(
  unitid: number,
  year = DEFAULT_YEAR,
  limit = 12,
): Promise<SimilarityPoint[]> {
  const peers = await db
    .select({ peerUnitid: academicSimilarity.peerUnitid, distance: academicSimilarity.distance })
    .from(academicSimilarity)
    .where(and(eq(academicSimilarity.unitid, unitid), eq(academicSimilarity.year, year)))
    .orderBy(asc(academicSimilarity.rank))
    .limit(limit);

  const distanceByUnitid = new Map(peers.map((p) => [p.peerUnitid, p.distance]));
  const ids = [unitid, ...peers.map((p) => p.peerUnitid)];

  const [rows, pricingRows] = await Promise.all([
    db
      .select({
        unitid: institutionYears.unitid,
        name: institutionYears.name,
        state: institutionYears.state,
        gradRateTotal: graduationRates.gradRateTotal,
        undergradTotal: enrollment.undergradTotal,
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
  ]);

  const byUnitid = new Map(rows.map((r) => [r.unitid, r]));
  // Ascending by year, so the current year's figure overwrites last year's
  // wherever both exist.
  const costByUnitid = new Map<number, number>();
  for (const p of pricingRows) {
    const cost = costOfAttendance(p);
    if (cost != null) costByUnitid.set(p.unitid, cost);
  }

  // Emit in similarity order with the target first, so the chart's own order
  // matches the ranking rather than whatever order Postgres returned.
  return ids
    .map((id) => {
      const row = byUnitid.get(id);
      if (!row) return null;
      return {
        unitid: row.unitid,
        name: row.name,
        state: row.state,
        yieldTotal: row.admissions?.yieldTotal ?? null,
        gradRateTotal: row.gradRateTotal,
        admitRate: row.admissions?.pctAdmittedTotal ?? null,
        satIndex: row.admissions ? satIndex(row.admissions) : null,
        undergradTotal: row.undergradTotal,
        costOfAttendance: costByUnitid.get(id) ?? null,
        distance: distanceByUnitid.get(id) ?? null,
        isTarget: id === unitid,
      };
    })
    .filter((p): p is SimilarityPoint => p !== null);
}

export async function getTopDegrees(unitid: number, year = DEFAULT_YEAR, limit = 5) {
  return db
    .select({
      prefix: sql<string>`LEFT(${completionsByField.cipCode}, 2)`,
      // SUM(integer) is bigint, which the driver hands back as a string; cast
      // so the count is a real number the page can format.
      total: sql<number>`SUM(${completionsByField.count})::int`,
    })
    .from(completionsByField)
    .where(and(eq(completionsByField.unitid, unitid), eq(completionsByField.year, year)))
    .groupBy(sql`LEFT(${completionsByField.cipCode}, 2)`)
    .having(sql`SUM(${completionsByField.count}) > 0`)
    // Prefix as tiebreak so equal counts keep one order between requests.
    .orderBy(sql`SUM(${completionsByField.count}) DESC`, sql`LEFT(${completionsByField.cipCode}, 2)`)
    .limit(limit);
}
