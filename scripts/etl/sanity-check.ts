import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
const [typeCounts, harvard, publicFlagship] = await Promise.all([
  sql`select institution_type, count(*) from institution_years group by 1 order by 2 desc`,
  sql`select unitid, name, city, state, institution_type from institution_years where name ilike '%harvard%'`,
  sql`select iy.name, iy.state, a.applicants_total, a.admits_total, a.sat_math_50, e.total as enrollment_total, gr.bachelor_6yr_rate_total, f.core_revenue_total
      from institution_years iy
      left join admissions a on a.unitid = iy.unitid and a.year = iy.year
      left join enrollment e on e.unitid = iy.unitid and e.year = iy.year
      left join graduation_rates gr on gr.unitid = iy.unitid and gr.year = iy.year
      left join finance f on f.unitid = iy.unitid and f.year = iy.year
      where iy.name ilike '%university of michigan-ann arbor%'`,
]);

console.log("institution_type distribution:", typeCounts);
console.log("\nharvard rows:", harvard);
console.log("\nUMich sample:", publicFlagship);
}

main();
