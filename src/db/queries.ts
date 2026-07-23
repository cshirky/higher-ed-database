import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "./index";
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
export const DEFAULT_YEAR = 2023;

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

export async function getTopAndBottomDegrees(unitid: number, year = DEFAULT_YEAR) {
  const rows = await db
    .select({
      prefix: sql<string>`LEFT(${completionsByField.cipCode}, 2)`,
      total: sql<number>`SUM(${completionsByField.count})`,
    })
    .from(completionsByField)
    .where(and(eq(completionsByField.unitid, unitid), eq(completionsByField.year, year)))
    .groupBy(sql`LEFT(${completionsByField.cipCode}, 2)`)
    .having(sql`SUM(${completionsByField.count}) > 0`)
    .orderBy(sql`SUM(${completionsByField.count}) DESC`);

  return {
    top5: rows.slice(0, 5),
    bottom5: [...rows].slice(-5).reverse(),
  };
}
