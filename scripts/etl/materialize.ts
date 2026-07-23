// Precomputes nationwide_trends and peer_network from the raw fact tables.
// Run after any ETL backfill — see .claude/skills/precompute-over-live-query.
// The app reads these two tables directly; it never aggregates/joins live.
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../src/db/schema";
import { batchedUpsert } from "./upsert";

const PEER_LIMIT = 12;
// Must match DEFAULT_YEAR in src/db/queries.ts. peer_network and
// academic_similarity are only computed for this one year, not every loaded
// year — nothing in the app queries any other year for either, and storing
// all 15 years for both previously blew Neon's free-tier 512MB project size
// limit (see .claude/skills/precompute-over-live-query). nationwide_trends
// stays full-history since /compare genuinely uses every year.
const DEFAULT_YEAR = 2023;

function stddev(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

type Candidate = { peerUnitid: number; distance: number };

/** Keeps the k smallest-distance candidates seen so far, sorted ascending. */
function insertTopK(list: Candidate[], candidate: Candidate, k: number) {
  if (list.length < k) {
    list.push(candidate);
    list.sort((a, b) => a.distance - b.distance);
  } else if (candidate.distance < list[list.length - 1].distance) {
    list[list.length - 1] = candidate;
    list.sort((a, b) => a.distance - b.distance);
  }
}

async function main() {
  const sqlClient = neon(process.env.DATABASE_URL!);
  const db = drizzle({ client: sqlClient, schema });

  const years = (
    await sqlClient`select distinct year from institution_years order by year`
  ).map((r: any) => r.year as number);

  console.log(`materializing for years: ${years.join(", ")}`);

  // --- nationwide_trends ---
  const trendRows = await sqlClient`
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
  const trendsToInsert = (trendRows as any[]).map((r) => ({
    institutionType: r.institution_type,
    year: r.year,
    institutionCount: r.institution_count,
    totalEnrollment: r.total_enrollment === null ? null : Number(r.total_enrollment),
    avgAdmitRate: r.avg_admit_rate === null ? null : Number(r.avg_admit_rate),
    avgTuition: r.avg_tuition === null ? null : Number(r.avg_tuition),
    avgGradRate: r.avg_grad_rate === null ? null : Number(r.avg_grad_rate),
    avgInstructionExpense: r.avg_instruction_expense === null ? null : Number(r.avg_instruction_expense),
  }));
  await batchedUpsert(db, schema.nationwideTrends, trendsToInsert, ["institutionType", "year"]);
  console.log(`nationwide_trends: ${trendsToInsert.length} rows`);

  // --- peer_network, computed only for DEFAULT_YEAR (see note above) ---
  let totalPeerRows = 0;
  for (const year of [DEFAULT_YEAR]) {
    const peerRows = await sqlClient`
      with base as (
        select
          iy.unitid,
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
          and iy.institution_type in ('college', 'university', 'graduate_school')
      ),
      stats as (
        select institution_type,
          stddev(enrollment_total) as e_std,
          stddev(admit_rate) as a_std,
          stddev(tuition) as t_std,
          stddev(instruction_expense) as x_std
        from base
        group by institution_type
      ),
      pairs as (
        select
          b1.unitid as unitid,
          b2.unitid as peer_unitid,
          sqrt(
            coalesce(power((b1.enrollment_total - b2.enrollment_total) / nullif(s.e_std, 0), 2), 0) +
            coalesce(power((b1.admit_rate - b2.admit_rate) / nullif(s.a_std, 0), 2), 0) +
            coalesce(power((b1.tuition - b2.tuition) / nullif(s.t_std, 0), 2), 0) +
            coalesce(power((b1.instruction_expense - b2.instruction_expense) / nullif(s.x_std, 0), 2), 0)
          ) as distance
        from base b1
        join base b2 on b2.institution_type = b1.institution_type and b2.unitid != b1.unitid
        join stats s on s.institution_type = b1.institution_type
        where b1.enrollment_total is not null and b2.enrollment_total is not null
      ),
      ranked as (
        select unitid, peer_unitid, distance,
          row_number() over (partition by unitid order by distance asc) as rank
        from pairs
      )
      select unitid, peer_unitid, distance, rank from ranked where rank <= ${PEER_LIMIT}
    `;
    const rowsToInsert = (peerRows as any[]).map((r) => ({
      unitid: r.unitid,
      year,
      rank: r.rank,
      peerUnitid: r.peer_unitid,
      distance: Number(r.distance),
    }));
    await batchedUpsert(db, schema.peerNetwork, rowsToInsert, ["unitid", "year", "rank"]);
    totalPeerRows += rowsToInsert.length;
    console.log(`  peer_network ${year}: ${rowsToInsert.length} rows`);
  }
  console.log(`peer_network total: ${totalPeerRows} rows`);

  // --- academic_similarity — see .claude/skills/academic-similarity for the
  // formula. Computed in JS rather than SQL: it needs a sparse cosine
  // similarity over each institution's subject x degree-level completion
  // mix, which isn't expressible as a plain join/aggregate the way the other
  // materialized tables are.
  let totalAcademicRows = 0;
  for (const year of [DEFAULT_YEAR]) {
    const rows = (await sqlClient`
      select cbf.unitid, iy.institution_type, cbf.cip_code, cbf.award_level, cbf.count
      from completions_by_field cbf
      join institution_years iy on iy.unitid = cbf.unitid and iy.year = cbf.year
      where cbf.year = ${year}
    `) as unknown as Array<{
      unitid: number;
      institution_type: string;
      cip_code: string;
      award_level: number;
      count: number;
    }>;

    // group into per-institution-type cohorts of sparse (cip|level -> count) vectors
    const byType = new Map<string, Map<number, Map<string, number>>>();
    const undergradTotal = new Map<number, number>();
    const gradTotal = new Map<number, number>();
    const UNDERGRAD_LEVELS = new Set([3, 5]); // Associate's, Bachelor's
    for (const r of rows) {
      if (!byType.has(r.institution_type)) byType.set(r.institution_type, new Map());
      const cohort = byType.get(r.institution_type)!;
      if (!cohort.has(r.unitid)) cohort.set(r.unitid, new Map());
      const key = `${r.cip_code}|${r.award_level}`;
      const vec = cohort.get(r.unitid)!;
      vec.set(key, (vec.get(key) ?? 0) + r.count);
      if (UNDERGRAD_LEVELS.has(r.award_level)) {
        undergradTotal.set(r.unitid, (undergradTotal.get(r.unitid) ?? 0) + r.count);
      } else {
        gradTotal.set(r.unitid, (gradTotal.get(r.unitid) ?? 0) + r.count);
      }
    }

    const rowsToInsert: { unitid: number; year: number; rank: number; peerUnitid: number; distance: number }[] = [];

    for (const [, cohortMap] of byType) {
      const unitids = [...cohortMap.keys()];
      if (unitids.length < 2) continue;

      // share vectors (proportion of an institution's own completions in
      // each subject x level) and their norms, for cosine similarity
      const shareVectors = new Map<number, Map<string, number>>();
      const norms = new Map<number, number>();
      for (const uid of unitids) {
        const counts = cohortMap.get(uid)!;
        const total = [...counts.values()].reduce((a, b) => a + b, 0);
        const shares = new Map<string, number>();
        let sumSq = 0;
        for (const [k, c] of counts) {
          const share = c / total;
          shares.set(k, share);
          sumSq += share * share;
        }
        shareVectors.set(uid, shares);
        norms.set(uid, Math.sqrt(sumSq));
      }

      const ugStd = stddev(unitids.map((u) => undergradTotal.get(u) ?? 0));
      const gStd = stddev(unitids.map((u) => gradTotal.get(u) ?? 0));

      const candidates = new Map<number, Candidate[]>();
      for (const u of unitids) candidates.set(u, []);

      for (let i = 0; i < unitids.length; i++) {
        const a = unitids[i];
        const va = shareVectors.get(a)!;
        const na = norms.get(a)!;
        const ugA = undergradTotal.get(a) ?? 0;
        const gA = gradTotal.get(a) ?? 0;
        for (let j = i + 1; j < unitids.length; j++) {
          const b = unitids[j];
          const vb = shareVectors.get(b)!;
          const nb = norms.get(b)!;

          // sparse dot product: walk the smaller of the two maps
          const [small, large] = va.size <= vb.size ? [va, vb] : [vb, va];
          let dot = 0;
          for (const [k, sv] of small) {
            const lv = large.get(k);
            if (lv !== undefined) dot += sv * lv;
          }
          const cosineSim = na > 0 && nb > 0 ? dot / (na * nb) : 0;
          // standard cosine-similarity-to-Euclidean-distance conversion for unit vectors
          const compositionDistance = Math.sqrt(Math.max(0, 2 * (1 - cosineSim)));

          const ugB = undergradTotal.get(b) ?? 0;
          const gB = gradTotal.get(b) ?? 0;
          const zUg = ugStd > 0 ? (ugA - ugB) / ugStd : 0;
          const zG = gStd > 0 ? (gA - gB) / gStd : 0;
          const sizeDistance = Math.sqrt(zUg * zUg + zG * zG);

          const distance = Math.sqrt(compositionDistance ** 2 + sizeDistance ** 2);

          insertTopK(candidates.get(a)!, { peerUnitid: b, distance }, PEER_LIMIT);
          insertTopK(candidates.get(b)!, { peerUnitid: a, distance }, PEER_LIMIT);
        }
      }

      for (const uid of unitids) {
        candidates.get(uid)!.forEach((p, idx) => {
          rowsToInsert.push({ unitid: uid, year, rank: idx + 1, peerUnitid: p.peerUnitid, distance: p.distance });
        });
      }
    }

    await batchedUpsert(db, schema.academicSimilarity, rowsToInsert, ["unitid", "year", "rank"]);
    totalAcademicRows += rowsToInsert.length;
    console.log(`  academic_similarity ${year}: ${rowsToInsert.length} rows`);
  }
  console.log(`academic_similarity total: ${totalAcademicRows} rows`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
