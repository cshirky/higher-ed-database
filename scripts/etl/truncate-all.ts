import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const tables = [
    "admissions",
    "enrollment",
    "completions",
    "graduation_rates",
    "finance",
    "pricing",
    "faculty",
    "financial_aid",
    "completions_by_field",
    "nationwide_trends",
    "academic_similarity",
    "institution_years",
  ];
  for (const t of tables) {
    await sql.query(`truncate table ${t}`);
    console.log(`truncated ${t}`);
  }
}

main();
