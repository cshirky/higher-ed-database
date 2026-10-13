import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "fs";
import { readdir, writeFile } from "fs/promises";
import path from "path";
import AdmZip from "adm-zip";
import MDBReader from "mdb-reader";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../src/db/schema";
import { batchedUpsert, cleanInt, cleanNum } from "./upsert";

const CACHE_DIR = path.resolve("ipeds_data/ipeds-cache");

function pad2(n: number) {
  return String(n % 100).padStart(2, "0");
}

type Release = "Final" | "Provisional";

function releaseInfo(year: number, release: Release) {
  const label = `${year}-${pad2(year + 1)}`;
  return {
    url: `https://nces.ed.gov/ipeds/tablefiles/zipfiles/IPEDS_${label}_${release}.zip`,
    zipPath: path.join(CACHE_DIR, `IPEDS_${label}_${release}.zip`),
    // The release is part of the directory name as it is of the zip's, so a
    // year's Final never reuses a Provisional extraction made earlier.
    extractDir: path.join(CACHE_DIR, `${year}-${release}`),
  };
}

function isCached(year: number, release: Release) {
  const { zipPath, extractDir } = releaseInfo(year, release);
  return existsSync(extractDir) || existsSync(zipPath);
}

/**
 * Which release of a year to load. NCES publishes a year as Provisional and
 * replaces it with Final about a year later — and keeps serving the
 * Provisional file afterwards, so Final has to be preferred explicitly rather
 * than taking whichever exists. A cached Final settles it without a request;
 * otherwise the server is asked (it answers a clean 404 for a release that is
 * not out yet).
 */
async function resolveRelease(year: number): Promise<Release> {
  if (isCached(year, "Final")) return "Final";

  let finalStatus: number | null = null;
  try {
    finalStatus = (await fetch(releaseInfo(year, "Final").url, { method: "HEAD" })).status;
  } catch {
    // Offline or NCES unreachable: handled below with whatever is cached.
  }
  if (finalStatus === 200) return "Final";

  if (finalStatus !== 404) {
    // Could not tell whether a Final exists. Carry on with a cached
    // Provisional rather than fail a run that needs no download.
    if (!isCached(year, "Provisional")) {
      throw new Error(`could not reach NCES to find the ${year} release (status ${finalStatus ?? "none"})`);
    }
    console.warn(`  !! ${year}: could not check NCES for a Final release; using the cached PROVISIONAL one`);
    return "Provisional";
  }
  console.log(`  ${year}: using PROVISIONAL release (no Final published yet)`);
  return "Provisional";
}

async function ensureAccdb(year: number): Promise<string> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const { url, zipPath, extractDir } = releaseInfo(year, await resolveRelease(year));

  if (!existsSync(extractDir)) {
    // Download and extract under temporary names and rename on success, so an
    // interrupted run leaves nothing that the checks above mistake for a
    // finished file.
    if (!existsSync(zipPath)) {
      console.log(`  downloading ${url}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
      await writeFile(`${zipPath}.part`, Buffer.from(await res.arrayBuffer()));
      renameSync(`${zipPath}.part`, zipPath);
    }
    console.log(`  extracting ${zipPath}`);
    const partial = `${extractDir}.tmp`;
    rmSync(partial, { recursive: true, force: true });
    new AdmZip(zipPath).extractAllTo(partial, true);
    renameSync(partial, extractDir);
  }

  const accdb = await findAccdb(extractDir);
  if (!accdb) throw new Error(`no .accdb found in ${extractDir}`);
  return accdb;
}

async function findAccdb(dir: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".accdb")) return full;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = await findAccdb(path.join(dir, entry.name));
      if (found) return found;
    }
  }
  return null;
}

function tableOrNull(reader: MDBReader, name: string, columns?: string[]) {
  const actualName = reader.getTableNames().find((n) => n.toLowerCase() === name.toLowerCase());
  if (!actualName) return null;
  const table = reader.getTable(actualName);
  // Project to only the needed columns where given — some raw survey tables
  // (e.g. C{year}_A) have ~30 demographic-breakdown columns per row across
  // 1M+ rows; materializing all of them blows the Node heap for no benefit.
  // Column casing (esp. UNITID vs unitid) is inconsistent across tables/years,
  // so resolve each requested name against the table's actual columns first.
  let rows;
  if (columns) {
    const actualColumnNames = table.getColumnNames();
    const resolvedColumns = columns.map((c) => {
      const match = actualColumnNames.find((a) => a.toLowerCase() === c.toLowerCase());
      if (!match) throw new Error(`column ${c} not found in table ${actualName}`);
      return match;
    });
    rows = table.getData({ columns: resolvedColumns as any });
  } else {
    rows = table.getData();
  }
  // IPEDS column casing (esp. UNITID vs unitid) is inconsistent across tables/years; normalize to uppercase.
  return rows.map((row: any) =>
    strictRow(Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toUpperCase(), v])), actualName),
  );
}

// Reading a column the table does not have throws instead of yielding
// undefined. A misspelt or wrongly-cased name (r.EnrFt against the upper-cased
// key ENRFT) otherwise loads as NULL in every row and nothing complains.
// Columns that genuinely come and go between years are read with opt().
function strictRow(row: Record<string, unknown>, tableName: string) {
  return new Proxy(row, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && !(prop in target)) {
        throw new Error(`column ${prop} not found in table ${tableName}`);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/** Reads a column that only exists in some years' releases; null where it is absent. */
function opt(row: any, column: string) {
  return column in row ? row[column] : null;
}

function institutionType(ugOffer: number | null, grOffer: number | null): string {
  const ug = ugOffer === 1;
  const gr = grOffer === 1;
  if (ug && gr) return "university";
  if (ug) return "college";
  if (gr) return "graduate_school";
  return "other";
}

async function loadYear(year: number) {
  console.log(`\n=== Loading ${year} ===`);
  const accdbPath = await ensureAccdb(year);
  console.log(`  reading ${accdbPath}`);
  const reader = new MDBReader(readFileSync(accdbPath));

  const sqlClient = neon(process.env.DATABASE_URL!);
  const db = drizzle({ client: sqlClient, schema });

  // --- institution_years (HD) ---
  // Scope (see .claude/skills/institution-scope): this project only covers
  // degree-granting institutions (Associate's/Bachelor's/Master's/Doctoral).
  // DEGGRANT=1 is the correct gate — UGOFFER/GROFFER alone are too broad and
  // include certificate-only schools that grant no degree at all.
  // For-profit institutions (CONTROL=3) are out of scope as well: none may
  // appear in anything the app shows, so they are dropped here, once, rather
  // than filtered in every query. The test is per year, so an institution
  // that changed control is kept only for its years as public or nonprofit.
  const hd = tableOrNull(reader, `HD${year}`);
  if (!hd) throw new Error(`HD${year} not found`);
  const controlByUnitid = new Map<number, number | null>();
  const inScopeUnitids = new Set<number>(
    hd
      .filter((r: any) => cleanInt(r.DEGGRANT) === 1 && cleanInt(r.CONTROL) !== 3)
      .map((r: any) => r.UNITID),
  );
  const institutionRows = hd
    .filter((r: any) => inScopeUnitids.has(r.UNITID))
    .map((r: any) => {
      const ugOffer = cleanInt(r.UGOFFER);
      const grOffer = cleanInt(r.GROFFER);
      controlByUnitid.set(r.UNITID, cleanInt(r.CONTROL));
      return {
        unitid: r.UNITID,
        year,
        name: r.INSTNM,
        city: r.CITY ?? null,
        state: r.STABBR ?? null,
        zip: r.ZIP ?? null,
        sector: cleanInt(r.SECTOR),
        control: cleanInt(r.CONTROL),
        iclevel: cleanInt(r.ICLEVEL),
        locale: cleanInt(r.LOCALE),
        instSize: cleanInt(r.INSTSIZE),
        hbcu: cleanInt(r.HBCU),
        tribal: cleanInt(r.TRIBAL),
        ugOffer,
        grOffer,
        highestOffering: cleanInt(r.HLOFFER),
        institutionType: institutionType(ugOffer, grOffer),
        carnegieClassification: cleanInt(opt(r, "CARNEGIE")),
        longitude: r.LONGITUD ?? null,
        latitude: r.LATITUDE ?? null,
      };
    });
  await batchedUpsert(db, schema.institutionYears, institutionRows, ["unitid", "year"]);
  console.log(`  institution_years: ${institutionRows.length} (${hd.length - institutionRows.length} out of scope excluded)`);

  // --- admissions (ADM, falling back to IC for pre-2014 years) ---
  const adm = tableOrNull(reader, `ADM${year}`) ?? tableOrNull(reader, `IC${year}`);
  const drvadm = tableOrNull(reader, `DRVADM${year}`);
  const drvadmByUnitid = new Map<number, any>((drvadm ?? []).map((r: any) => [r.UNITID, r]));
  if (adm) {
    const admissionsRows = adm
      .filter((r: any) => "APPLCN" in r && inScopeUnitids.has(r.UNITID))
      .map((r: any) => {
        const derived = drvadmByUnitid.get(r.UNITID);
        return {
          unitid: r.UNITID,
          year,
          applicantsTotal: cleanInt(r.APPLCN),
          applicantsMen: cleanInt(r.APPLCNM),
          applicantsWomen: cleanInt(r.APPLCNW),
          admitsTotal: cleanInt(r.ADMSSN),
          admitsMen: cleanInt(r.ADMSSNM),
          admitsWomen: cleanInt(r.ADMSSNW),
          enrolledTotal: cleanInt(r.ENRLT),
          enrolledFullTime: cleanInt(r.ENRLFT),
          enrolledPartTime: cleanInt(r.ENRLPT),
          pctAdmittedTotal: derived ? cleanNum(derived.DVADM01) : null,
          yieldTotal: derived ? cleanNum(derived.DVADM04) : null,
          satReading25: cleanInt(r.SATVR25),
          satReading50: cleanInt(opt(r, "SATVR50")),
          satReading75: cleanInt(r.SATVR75),
          satMath25: cleanInt(r.SATMT25),
          satMath50: cleanInt(opt(r, "SATMT50")),
          satMath75: cleanInt(r.SATMT75),
          actComposite25: cleanInt(r.ACTCM25),
          actComposite50: cleanInt(opt(r, "ACTCM50")),
          actComposite75: cleanInt(r.ACTCM75),
        };
      });
    await batchedUpsert(db, schema.admissions, admissionsRows, ["unitid", "year"]);
    console.log(`  admissions: ${admissionsRows.length}`);
  } else {
    console.log(`  admissions: skipped (no ADM/IC table for ${year})`);
  }

  // --- enrollment (DRVEF) ---
  const drvef = tableOrNull(reader, `DRVEF${year}`);
  if (drvef) {
    const enrollmentRows = drvef
      .filter((r: any) => inScopeUnitids.has(r.UNITID))
      .map((r: any) => ({
      unitid: r.UNITID,
      year,
      total: cleanInt(r.ENRTOT),
      fte: cleanInt(r.FTE),
      fullTime: cleanInt(r.ENRFT),
      partTime: cleanInt(r.ENRPT),
      undergradTotal: cleanInt(r.EFUG),
      gradTotal: cleanInt(r.EFGRAD),
      pctWomen: cleanNum(r.PCTENRW),
      pctWhite: cleanNum(r.PCTENRWH),
      pctBlack: cleanNum(r.PCTENRBK),
      pctHispanic: cleanNum(r.PCTENRHS),
      pctAsian: cleanNum(r.PCTENRAS),
      pctAmIndianAkNative: cleanNum(r.PCTENRAN),
      pctNativeHawaiianPacific: cleanNum(r.PCTENRNH),
      pctTwoOrMoreRaces: cleanNum(r.PCTENR2M),
      pctRaceUnknown: cleanNum(r.PCTENRUN),
      pctNonresident: cleanNum(r.PCTENRNR),
      pctExclusivelyDistanceEd: cleanNum(opt(r, "PCTDEEXC")),
    }));
    await batchedUpsert(db, schema.enrollment, enrollmentRows, ["unitid", "year"]);
    console.log(`  enrollment: ${enrollmentRows.length}`);
  } else {
    console.log(`  enrollment: skipped (no DRVEF${year})`);
  }

  // --- completions (DRVC) ---
  const drvc = tableOrNull(reader, `DRVC${year}`);
  if (drvc) {
    const completionsRows = drvc
      .filter((r: any) => inScopeUnitids.has(r.UNITID))
      .map((r: any) => ({
      unitid: r.UNITID,
      year,
      certificatesLtOneYear: cleanInt(r.CERT1),
      certificatesOneToTwoYear: cleanInt(r.CERT2),
      certificatesTwoToFourYear: cleanInt(r.CERT4),
      associates: cleanInt(r.ASCDEG),
      bachelors: cleanInt(r.BASDEG),
      postbacCertificates: cleanInt(r.PBACERT),
      masters: cleanInt(r.MASDEG),
      postmastersCertificates: cleanInt(r.PMACERT),
      doctorsResearch: cleanInt(r.DOCDEGRS),
      doctorsProfessional: cleanInt(r.DOCDEGPP),
      doctorsOther: cleanInt(r.DOCDEGOT),
    }));
    await batchedUpsert(db, schema.completions, completionsRows, ["unitid", "year"]);
    console.log(`  completions: ${completionsRows.length}`);
  } else {
    console.log(`  completions: skipped (no DRVC${year})`);
  }

  // --- graduation_rates (DRVGR) ---
  const drvgr = tableOrNull(reader, `DRVGR${year}`);
  if (drvgr) {
    const gradRows = drvgr
      .filter((r: any) => inScopeUnitids.has(r.UNITID))
      .map((r: any) => ({
      unitid: r.UNITID,
      year,
      gradRateTotal: cleanNum(r.GRRTTOT),
      gradRateMen: cleanNum(r.GRRTM),
      gradRateWomen: cleanNum(r.GRRTW),
      gradRateWhite: cleanNum(r.GRRTWH),
      gradRateBlack: cleanNum(r.GRRTBK),
      gradRateHispanic: cleanNum(r.GRRTHS),
      gradRateAsian: cleanNum(opt(r, "GRRTAS")),
      transferOutRateTotal: cleanNum(r.TRRTTOT),
      bachelor4yrRateTotal: cleanNum(r.GBA4RTT),
      bachelor5yrRateTotal: cleanNum(r.GBA5RTT),
      bachelor6yrRateTotal: cleanNum(r.GBA6RTT),
      pellGradRateTotal: cleanNum(opt(r, "PGGRRTT")),
      pellBachelor6yrRate: cleanNum(opt(r, "PGBA6RT")),
    }));
    await batchedUpsert(db, schema.graduationRates, gradRows, ["unitid", "year"]);
    console.log(`  graduation_rates: ${gradRows.length}`);
  } else {
    console.log(`  graduation_rates: skipped (no DRVGR${year})`);
  }

  // --- finance (DRVF) — pick F1 (GASB/public) or F2 (FASB/private nonprofit) by control ---
  // DRVF also carries F3 (for-profit) columns; for-profits are out of scope, so they are never read.
  const drvf = tableOrNull(reader, `DRVF${year}`);
  if (drvf) {
    const financeRows = drvf
      .filter((r: any) => inScopeUnitids.has(r.UNITID))
      .map((r: any) => {
      const control = controlByUnitid.get(r.UNITID);
      const prefix = control === 1 ? "F1" : "F2";
      const standard = control === 1 ? "gasb" : "fasb";
      return {
        unitid: r.UNITID,
        year,
        accountingStandard: standard,
        coreRevenueTotal: cleanInt(r[`${prefix}CORREV`]),
        coreExpenseTotal: cleanInt(r[`${prefix}COREXP`]),
        tuitionRevenuePerFte: cleanNum(r[`${prefix}TUFEFT`]),
        instructionExpensePerFte: cleanNum(r[`${prefix}INSTFT`]),
        instructionExpensePct: cleanNum(r[`${prefix}INSTPC`]),
        researchExpensePct: cleanNum(r[`${prefix}RSRCPC`]),
        studentServiceExpensePct: cleanNum(r[`${prefix}STSVPC`]),
        institutionalSupportExpensePct: cleanNum(r[`${prefix}INSUPC`]),
        endowmentPerFte: cleanNum(r[`${prefix}ENDMFT`]),
        equityRatio: cleanNum(r[`${prefix}EQUITR`]),
      };
    });
    await batchedUpsert(db, schema.finance, financeRows, ["unitid", "year"]);
    console.log(`  finance: ${financeRows.length}`);
  } else {
    console.log(`  finance: skipped (no DRVF${year})`);
  }

  // --- pricing (DRVIC) ---
  const drvic = tableOrNull(reader, `DRVIC${year}`);
  if (drvic) {
    const pricingRows = drvic
      .filter((r: any) => inScopeUnitids.has(r.UNITID))
      .map((r: any) => ({
      unitid: r.UNITID,
      year,
      tuitionFeesInState: cleanInt(r.TUFEYR3),
      inStateTotalOnCampus: cleanInt(r.CINSON),
      outStateTotalOnCampus: cleanInt(r.COTSON),
      inDistrictTotalOnCampus: cleanInt(r.CINDON),
      inStateTotalOffCampus: cleanInt(r.CINSOFF),
      outStateTotalOffCampus: cleanInt(r.COTSOFF),
    }));
    await batchedUpsert(db, schema.pricing, pricingRows, ["unitid", "year"]);
    console.log(`  pricing: ${pricingRows.length}`);
  } else {
    console.log(`  pricing: skipped (no DRVIC${year})`);
  }

  // --- faculty (DRVHR) ---
  const drvhr = tableOrNull(reader, `DRVHR${year}`);
  if (drvhr) {
    const facultyRows = drvhr
      .filter((r: any) => inScopeUnitids.has(r.UNITID))
      .map((r: any) => ({
      unitid: r.UNITID,
      year,
      avgSalaryAllRanks: cleanInt(r.SALTOTL),
      avgSalaryProfessor: cleanInt(r.SALPROF),
      avgSalaryAssocProfessor: cleanInt(r.SALASSC),
      avgSalaryAsstProfessor: cleanInt(r.SALASST),
      fteInstructional: cleanNum(opt(r, "SFTEINST")),
      fteResearch: cleanNum(opt(r, "SFTERSRC")),
      ftePublicService: cleanNum(opt(r, "SFTEPBSV")),
      fteTotalStaff: cleanNum(opt(r, "SFTETOTL")),
    }));
    await batchedUpsert(db, schema.faculty, facultyRows, ["unitid", "year"]);
    console.log(`  faculty: ${facultyRows.length}`);
  } else {
    console.log(`  faculty: skipped (no DRVHR${year})`);
  }

  // --- financial_aid (SFA{fiscal pair}_P1, e.g. 2223 for year 2023) ---
  const fiscalSuffix = `${pad2(year - 1)}${pad2(year)}`;
  const sfa = tableOrNull(reader, `SFA${fiscalSuffix}_P1`);
  if (sfa) {
    const aidRows = sfa
      .filter((r: any) => r.UNITID !== undefined && inScopeUnitids.has(r.UNITID))
      .map((r: any) => ({
        unitid: r.UNITID,
        year,
        numTotalStudents: cleanInt(r.SCUGRAD),
        numAwardedAnyAid: cleanInt(r.ANYAIDN),
        pctAwardedAnyAid: cleanNum(r.ANYAIDP),
        avgGrantAidAmount: cleanInt(r.AGRNT_A),
      }));
    await batchedUpsert(db, schema.financialAid, aidRows, ["unitid", "year"]);
    console.log(`  financial_aid: ${aidRows.length}`);
  } else {
    console.log(`  financial_aid: skipped (no SFA${fiscalSuffix}_P1)`);
  }

  // --- completions_by_field (C{year}_A) — degrees by 6-digit CIP code and
  // award level, first major only. Feeds academic-similarity; see
  // .claude/skills/academic-similarity. Raw table also contains CIP-family
  // (2-digit) and CIP-subfamily (4-digit) rollup rows and non-degree award
  // levels (certificates, "total" pseudo-levels) — filter to real 6-digit
  // codes and real degree levels only, or per-institution totals would be
  // multiply counted.
  const LEAF_AWARD_LEVELS = new Set([3, 5, 7, 17, 18, 19]); // Assoc, Bach, Mast, Doc-research/professional/other
  const isSixDigitCip = (cip: unknown) => typeof cip === "string" && /^\d{2}\.\d{4}$/.test(cip);
  const c = tableOrNull(reader, `C${year}_A`, ["UNITID", "CIPCODE", "MAJORNUM", "AWLEVEL", "CTOTALT"]);
  if (c) {
    const completionsByFieldRows = c
      .filter(
        (r: any) =>
          r.MAJORNUM === 1 &&
          LEAF_AWARD_LEVELS.has(r.AWLEVEL) &&
          isSixDigitCip(r.CIPCODE) &&
          r.CTOTALT > 0 &&
          inScopeUnitids.has(r.UNITID),
      )
      .map((r: any) => ({
        unitid: r.UNITID,
        year,
        cipCode: r.CIPCODE,
        awardLevel: r.AWLEVEL,
        count: r.CTOTALT,
      }));
    await batchedUpsert(db, schema.completionsByField, completionsByFieldRows, [
      "unitid",
      "year",
      "cipCode",
      "awardLevel",
    ]);
    console.log(`  completions_by_field: ${completionsByFieldRows.length}`);
  } else {
    console.log(`  completions_by_field: skipped (no C${year}_A)`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("usage: tsx scripts/etl/load-year.ts <year> [year2 year3 ...]");
    process.exit(1);
  }
  const invalid = args.filter((arg) => !/^\d{4}$/.test(arg));
  if (invalid.length > 0) {
    console.error(`not a four-digit year: ${invalid.join(", ")}`);
    process.exit(1);
  }
  const failed: number[] = [];
  for (const arg of args) {
    const year = Number(arg);
    try {
      await loadYear(year);
    } catch (err) {
      console.error(`  !! year ${year} failed:`, err);
      failed.push(year);
    }
  }
  if (failed.length > 0) {
    console.log(`\nCompleted with failures for years: ${failed.join(", ")}`);
    // Non-zero so a chained materialize.ts does not run over a partial load.
    process.exitCode = 1;
  } else {
    console.log(`\nAll years completed successfully.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
