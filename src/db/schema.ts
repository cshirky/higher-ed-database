import {
  pgTable,
  integer,
  smallint,
  bigint,
  text,
  doublePrecision,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

// One row per institution per academic year, sourced from IPEDS HD{year}.
// institutionType is OUR project-specific classification (see project memory):
//   'college'         = grants Associate's/Bachelor's only (ugOffer=1, grOffer=2)
//   'graduate_school'  = grants Master's/Doctoral only (ugOffer=2, grOffer=1)
//   'university'       = grants both (ugOffer=1, grOffer=1)
export const institutionYears = pgTable(
  "institution_years",
  {
    unitid: integer("unitid").notNull(),
    year: smallint("year").notNull(), // fall year of the collection cycle, e.g. 2023 for AY2023-24
    name: text("name").notNull(),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    sector: smallint("sector"), // IPEDS SECTOR code
    control: smallint("control"), // 1 public, 2 private nonprofit, 3 private for-profit
    iclevel: smallint("iclevel"), // 1 four-or-more years, 2 two-but-less-than-four, 3 less-than-two
    locale: smallint("locale"),
    instSize: smallint("inst_size"),
    hbcu: smallint("hbcu"),
    tribal: smallint("tribal"),
    ugOffer: smallint("ug_offer"), // 1 yes, 2 no
    grOffer: smallint("gr_offer"), // 1 yes, 2 no
    highestOffering: smallint("highest_offering"), // HLOFFER code 1-9
    institutionType: text("institution_type").notNull(), // college | graduate_school | university | other
    carnegieClassification: integer("carnegie_classification"),
    longitude: doublePrecision("longitude"),
    latitude: doublePrecision("latitude"),
  },
  (t) => [
    primaryKey({ columns: [t.unitid, t.year] }),
    index("institution_years_year_idx").on(t.year),
    index("institution_years_state_idx").on(t.state),
    index("institution_years_type_idx").on(t.institutionType),
  ],
);

export const admissions = pgTable(
  "admissions",
  {
    unitid: integer("unitid").notNull(),
    year: smallint("year").notNull(),
    applicantsTotal: bigint("applicants_total", { mode: "number" }),
    applicantsMen: bigint("applicants_men", { mode: "number" }),
    applicantsWomen: bigint("applicants_women", { mode: "number" }),
    admitsTotal: bigint("admits_total", { mode: "number" }),
    admitsMen: bigint("admits_men", { mode: "number" }),
    admitsWomen: bigint("admits_women", { mode: "number" }),
    enrolledTotal: bigint("enrolled_total", { mode: "number" }),
    enrolledFullTime: bigint("enrolled_full_time", { mode: "number" }),
    enrolledPartTime: bigint("enrolled_part_time", { mode: "number" }),
    pctAdmittedTotal: doublePrecision("pct_admitted_total"),
    yieldTotal: doublePrecision("yield_total"),
    satReading25: smallint("sat_reading_25"),
    satReading50: smallint("sat_reading_50"),
    satReading75: smallint("sat_reading_75"),
    satMath25: smallint("sat_math_25"),
    satMath50: smallint("sat_math_50"),
    satMath75: smallint("sat_math_75"),
    actComposite25: smallint("act_composite_25"),
    actComposite50: smallint("act_composite_50"),
    actComposite75: smallint("act_composite_75"),
  },
  (t) => [
    primaryKey({ columns: [t.unitid, t.year] }),
    index("admissions_year_idx").on(t.year),
  ],
);

export const enrollment = pgTable(
  "enrollment",
  {
    unitid: integer("unitid").notNull(),
    year: smallint("year").notNull(),
    total: bigint("total", { mode: "number" }),
    fte: bigint("fte", { mode: "number" }),
    fullTime: bigint("full_time", { mode: "number" }),
    partTime: bigint("part_time", { mode: "number" }),
    undergradTotal: bigint("undergrad_total", { mode: "number" }),
    gradTotal: bigint("grad_total", { mode: "number" }),
    pctWomen: doublePrecision("pct_women"),
    pctWhite: doublePrecision("pct_white"),
    pctBlack: doublePrecision("pct_black"),
    pctHispanic: doublePrecision("pct_hispanic"),
    pctAsian: doublePrecision("pct_asian"),
    pctAmIndianAkNative: doublePrecision("pct_am_indian_ak_native"),
    pctNativeHawaiianPacific: doublePrecision("pct_native_hawaiian_pacific"),
    pctTwoOrMoreRaces: doublePrecision("pct_two_or_more_races"),
    pctRaceUnknown: doublePrecision("pct_race_unknown"),
    pctNonresident: doublePrecision("pct_nonresident"),
    pctExclusivelyDistanceEd: doublePrecision("pct_exclusively_distance_ed"),
  },
  (t) => [
    primaryKey({ columns: [t.unitid, t.year] }),
    index("enrollment_year_idx").on(t.year),
  ],
);

export const completions = pgTable(
  "completions",
  {
    unitid: integer("unitid").notNull(),
    year: smallint("year").notNull(),
    certificatesLtOneYear: bigint("certificates_lt_one_year", { mode: "number" }),
    certificatesOneToTwoYear: bigint("certificates_one_to_two_year", { mode: "number" }),
    certificatesTwoToFourYear: bigint("certificates_two_to_four_year", { mode: "number" }),
    associates: bigint("associates", { mode: "number" }),
    bachelors: bigint("bachelors", { mode: "number" }),
    postbacCertificates: bigint("postbac_certificates", { mode: "number" }),
    masters: bigint("masters", { mode: "number" }),
    postmastersCertificates: bigint("postmasters_certificates", { mode: "number" }),
    doctorsResearch: bigint("doctors_research", { mode: "number" }),
    doctorsProfessional: bigint("doctors_professional", { mode: "number" }),
    doctorsOther: bigint("doctors_other", { mode: "number" }),
  },
  (t) => [
    primaryKey({ columns: [t.unitid, t.year] }),
    index("completions_year_idx").on(t.year),
  ],
);

export const graduationRates = pgTable(
  "graduation_rates",
  {
    unitid: integer("unitid").notNull(),
    year: smallint("year").notNull(),
    gradRateTotal: doublePrecision("grad_rate_total"),
    gradRateMen: doublePrecision("grad_rate_men"),
    gradRateWomen: doublePrecision("grad_rate_women"),
    gradRateWhite: doublePrecision("grad_rate_white"),
    gradRateBlack: doublePrecision("grad_rate_black"),
    gradRateHispanic: doublePrecision("grad_rate_hispanic"),
    gradRateAsian: doublePrecision("grad_rate_asian"),
    transferOutRateTotal: doublePrecision("transfer_out_rate_total"),
    bachelor4yrRateTotal: doublePrecision("bachelor_4yr_rate_total"),
    bachelor5yrRateTotal: doublePrecision("bachelor_5yr_rate_total"),
    bachelor6yrRateTotal: doublePrecision("bachelor_6yr_rate_total"),
    pellGradRateTotal: doublePrecision("pell_grad_rate_total"),
    pellBachelor6yrRate: doublePrecision("pell_bachelor_6yr_rate"),
  },
  (t) => [
    primaryKey({ columns: [t.unitid, t.year] }),
    index("graduation_rates_year_idx").on(t.year),
  ],
);

// Accounting standard varies by control type (GASB=public, FASB=private nonprofit, FASB_FP=for-profit);
// loader picks the matching F1/F2/F3-prefixed source columns and normalizes them into this one shape.
export const finance = pgTable(
  "finance",
  {
    unitid: integer("unitid").notNull(),
    year: smallint("year").notNull(),
    accountingStandard: text("accounting_standard"), // gasb | fasb | fasb_forprofit
    coreRevenueTotal: bigint("core_revenue_total", { mode: "number" }),
    coreExpenseTotal: bigint("core_expense_total", { mode: "number" }),
    tuitionRevenuePerFte: doublePrecision("tuition_revenue_per_fte"),
    instructionExpensePerFte: doublePrecision("instruction_expense_per_fte"),
    instructionExpensePct: doublePrecision("instruction_expense_pct"),
    researchExpensePct: doublePrecision("research_expense_pct"),
    studentServiceExpensePct: doublePrecision("student_service_expense_pct"),
    institutionalSupportExpensePct: doublePrecision("institutional_support_expense_pct"),
    endowmentPerFte: doublePrecision("endowment_per_fte"),
    equityRatio: doublePrecision("equity_ratio"),
  },
  (t) => [
    primaryKey({ columns: [t.unitid, t.year] }),
    index("finance_year_idx").on(t.year),
  ],
);

export const pricing = pgTable(
  "pricing",
  {
    unitid: integer("unitid").notNull(),
    year: smallint("year").notNull(),
    tuitionFeesInState: bigint("tuition_fees_in_state", { mode: "number" }),
    inStateTotalOnCampus: bigint("in_state_total_on_campus", { mode: "number" }),
    outStateTotalOnCampus: bigint("out_state_total_on_campus", { mode: "number" }),
    inDistrictTotalOnCampus: bigint("in_district_total_on_campus", { mode: "number" }),
    inStateTotalOffCampus: bigint("in_state_total_off_campus", { mode: "number" }),
    outStateTotalOffCampus: bigint("out_state_total_off_campus", { mode: "number" }),
  },
  (t) => [
    primaryKey({ columns: [t.unitid, t.year] }),
    index("pricing_year_idx").on(t.year),
  ],
);

export const faculty = pgTable(
  "faculty",
  {
    unitid: integer("unitid").notNull(),
    year: smallint("year").notNull(),
    avgSalaryAllRanks: bigint("avg_salary_all_ranks", { mode: "number" }),
    avgSalaryProfessor: bigint("avg_salary_professor", { mode: "number" }),
    avgSalaryAssocProfessor: bigint("avg_salary_assoc_professor", { mode: "number" }),
    avgSalaryAsstProfessor: bigint("avg_salary_asst_professor", { mode: "number" }),
    fteInstructional: doublePrecision("fte_instructional"),
    fteResearch: doublePrecision("fte_research"),
    ftePublicService: doublePrecision("fte_public_service"),
    fteTotalStaff: doublePrecision("fte_total_staff"),
  },
  (t) => [
    primaryKey({ columns: [t.unitid, t.year] }),
    index("faculty_year_idx").on(t.year),
  ],
);

export const financialAid = pgTable(
  "financial_aid",
  {
    unitid: integer("unitid").notNull(),
    year: smallint("year").notNull(),
    numAwardedAnyGrant: bigint("num_awarded_any_grant", { mode: "number" }),
    numTotalStudents: bigint("num_total_students", { mode: "number" }),
    pctAwardedAnyGrant: doublePrecision("pct_awarded_any_grant"),
    avgGrantAidAmount: bigint("avg_grant_aid_amount", { mode: "number" }),
  },
  (t) => [
    primaryKey({ columns: [t.unitid, t.year] }),
    index("financial_aid_year_idx").on(t.year),
  ],
);

// Precomputed by scripts/etl/materialize.ts, not queried live — see
// .claude/skills/precompute-over-live-query. IPEDS data only changes when the
// ETL backfill reruns, so there's no benefit to recalculating these on every
// page view.
export const nationwideTrends = pgTable(
  "nationwide_trends",
  {
    institutionType: text("institution_type").notNull(),
    year: smallint("year").notNull(),
    institutionCount: integer("institution_count").notNull(),
    totalEnrollment: bigint("total_enrollment", { mode: "number" }),
    avgAdmitRate: doublePrecision("avg_admit_rate"),
    avgTuition: doublePrecision("avg_tuition"),
    avgGradRate: doublePrecision("avg_grad_rate"),
    avgInstructionExpense: doublePrecision("avg_instruction_expense"),
  },
  (t) => [primaryKey({ columns: [t.institutionType, t.year] })],
);

export const peerNetwork = pgTable(
  "peer_network",
  {
    unitid: integer("unitid").notNull(),
    year: smallint("year").notNull(),
    rank: smallint("rank").notNull(),
    peerUnitid: integer("peer_unitid").notNull(),
    distance: doublePrecision("distance").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.unitid, t.year, t.rank] }),
    index("peer_network_unitid_year_idx").on(t.unitid, t.year),
  ],
);

// Degrees conferred by 6-digit CIP code (subject) and award level, first
// major only (MAJORNUM=1, avoids double-counting double majors). Source for
// academic-similarity — see .claude/skills/academic-similarity.
export const completionsByField = pgTable(
  "completions_by_field",
  {
    unitid: integer("unitid").notNull(),
    year: smallint("year").notNull(),
    cipCode: text("cip_code").notNull(),
    awardLevel: smallint("award_level").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.unitid, t.year, t.cipCode, t.awardLevel] }),
    index("completions_by_field_year_idx").on(t.year),
  ],
);

export const academicSimilarity = pgTable(
  "academic_similarity",
  {
    unitid: integer("unitid").notNull(),
    year: smallint("year").notNull(),
    rank: smallint("rank").notNull(),
    peerUnitid: integer("peer_unitid").notNull(),
    distance: doublePrecision("distance").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.unitid, t.year, t.rank] }),
    index("academic_similarity_unitid_year_idx").on(t.unitid, t.year),
  ],
);
