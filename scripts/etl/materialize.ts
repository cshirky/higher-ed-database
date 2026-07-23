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

  // --- peer_network, computed per year (each institution's peers are drawn
  // only from the same institution_type cohort in the same year) ---
  let totalPeerRows = 0;
  for (const year of years) {
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
