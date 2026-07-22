import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { db, sql as rawSql } from "./index";
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
  const rows = await rawSql`
    select
      iy.year,
      iy.institution_type,
      count(*)::int as institution_count,
      sum(e.total)::bigint as total_enrollment,
      avg(a.pct_admitted_total) as avg_admit_rate,
      avg(p.tuition_fees_in_state) as avg_tuition,
      avg(gr.grad_rate_total) as avg_grad_rate,
      avg(f.instruction_expense_per_fte) as avg_instruction_expense
    from institution_years iy
    left join enrollment e on e.unitid = iy.unitid and e.year = iy.year
    left join admissions a on a.unitid = iy.unitid and a.year = iy.year
    left join pricing p on p.unitid = iy.unitid and p.year = iy.year
    left join graduation_rates gr on gr.unitid = iy.unitid and gr.year = iy.year
    left join finance f on f.unitid = iy.unitid and f.year = iy.year
    where iy.institution_type in ('college', 'university', 'graduate_school')
    group by iy.year, iy.institution_type
    order by iy.year, iy.institution_type
  `;
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    year: r.year as number,
    institutionType: r.institution_type as NationwideTrendRow["institutionType"],
    institutionCount: r.institution_count as number,
    totalEnrollment: r.total_enrollment === null ? null : Number(r.total_enrollment),
    avgAdmitRate: r.avg_admit_rate === null ? null : Number(r.avg_admit_rate),
    avgTuition: r.avg_tuition === null ? null : Number(r.avg_tuition),
    avgGradRate: r.avg_grad_rate === null ? null : Number(r.avg_grad_rate),
    avgInstructionExpense: r.avg_instruction_expense === null ? null : Number(r.avg_instruction_expense),
  }));
}

export type PeerMetricKey = "enrollment" | "admitRate" | "tuition" | "instructionExpense";

export async function getPeers(unitid: number, year = DEFAULT_YEAR, limit = 12) {
  // Peer/similarity network: IPEDS has no institution-to-institution relationship
  // data, so this is a derived nearest-neighbor graph over a handful of
  // z-normalized metrics, restricted to the same institution_type so a
  // community college is never compared against a research university.
  const rows = await rawSql`
    with base as (
      select
        iy.unitid,
        iy.name,
        iy.state,
        iy.institution_type,
        e.total as enrollment_total,
        a.pct_admitted_total as admit_rate,
        p.tuition_fees_in_state as tuition,
        f.instruction_expense_per_fte as instruction_expense
      from institution_years iy
      left join enrollment e on e.unitid = iy.unitid and e.year = iy.year
      left join admissions a on a.unitid = iy.unitid and a.year = iy.year
      left join pricing p on p.unitid = iy.unitid and p.year = iy.year
      left join finance f on f.unitid = iy.unitid and f.year = iy.year
      where iy.year = ${year}
        and iy.institution_type = (select institution_type from institution_years where unitid = ${unitid} and year = ${year})
    ),
    stats as (
      select
        avg(enrollment_total) as e_mean, stddev(enrollment_total) as e_std,
        avg(admit_rate) as a_mean, stddev(admit_rate) as a_std,
        avg(tuition) as t_mean, stddev(tuition) as t_std,
        avg(instruction_expense) as x_mean, stddev(instruction_expense) as x_std
      from base
    ),
    target as (
      select * from base where unitid = ${unitid}
    )
    select
      b.unitid, b.name, b.state, b.institution_type,
      b.enrollment_total, b.admit_rate, b.tuition, b.instruction_expense,
      sqrt(
        coalesce(power((b.enrollment_total - t.enrollment_total) / nullif(s.e_std, 0), 2), 0) +
        coalesce(power((b.admit_rate - t.admit_rate) / nullif(s.a_std, 0), 2), 0) +
        coalesce(power((b.tuition - t.tuition) / nullif(s.t_std, 0), 2), 0) +
        coalesce(power((b.instruction_expense - t.instruction_expense) / nullif(s.x_std, 0), 2), 0)
      ) as distance
    from base b, stats s, target t
    where b.unitid != ${unitid}
      and b.enrollment_total is not null
    order by distance asc
    limit ${limit}
  `;
  return rows as unknown as Array<{
    unitid: number;
    name: string;
    state: string | null;
    institution_type: string;
    enrollment_total: number | null;
    admit_rate: number | null;
    tuition: number | null;
    instruction_expense: number | null;
    distance: number;
  }>;
}
