import Link from "next/link";
import { notFound } from "next/navigation";
import { getInstitution, getInstitutionTimeSeries, getAcademicPeerComparison, getTopDegrees, DEFAULT_YEAR } from "@/db/queries";
import { INSTITUTION_TYPE_LABELS, CONTROL_LABELS, LOCALE_LABELS } from "@/lib/institution-types";
import { CIP_PREFIX_LABELS } from "@/lib/cip-labels";
import { TimeSeriesChart } from "@/components/time-series-chart";
import { PeerTable } from "@/components/peer-table";

function byYear<T extends { year: number }>(rows: T[]): Record<string, unknown>[] {
  return rows;
}

export default async function InstitutionPage({ params }: { params: Promise<{ unitid: string }> }) {
  const { unitid: unitidParam } = await params;
  // Digits only, and few enough to fit a Postgres integer: anything else is not
  // an id, and would otherwise reach the database and come back as a 500.
  if (!/^\d{1,9}$/.test(unitidParam)) notFound();
  const unitid = Number(unitidParam);
  const institution = await getInstitution(unitid);
  if (!institution) notFound();

  const [series, peers, topDegrees] = await Promise.all([
    getInstitutionTimeSeries(unitid),
    // The 12 nearest academic peers that are not well below this institution
    // on yield or graduation rate.
    getAcademicPeerComparison(unitid, DEFAULT_YEAR, 12),
    getTopDegrees(unitid, DEFAULT_YEAR),
  ]);

  const typeLabel = INSTITUTION_TYPE_LABELS[institution.institutionType as keyof typeof INSTITUTION_TYPE_LABELS] ?? institution.institutionType;
  const controlLabel = institution.control ? CONTROL_LABELS[institution.control] ?? "—" : "—";
  const localeLabel = institution.locale ? (LOCALE_LABELS[institution.locale] ?? "—") : "—";
  const yieldRow = [...series.admissions].reverse().find((r) => r.yieldTotal != null);
  // yieldTotal is already stored as a whole-number percentage (47 meaning 47%),
  // same convention as pct_admitted_total — do not multiply by 100 again.
  const yieldPct = yieldRow?.yieldTotal != null ? `${Math.round(yieldRow.yieldTotal)}%` : "—";

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <Link href="/institutions" className="text-sm text-[var(--series-1)] hover:underline">
        ← All institutions
      </Link>

      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{institution.name}</h1>
      <p className="mt-1 text-[var(--text-secondary)]">
        {institution.city}, {institution.state} · {typeLabel} · {controlLabel}
      </p>

      <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Locale</p>
            <p className="mt-1 text-sm font-medium">{localeLabel}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Yield</p>
            <p className="mt-1 text-sm font-medium">{yieldPct}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Most Popular Majors</p>
            <ol className="mt-1 space-y-0.5">
              {topDegrees.map((d, i) => (
                <li key={d.prefix} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-[var(--text-secondary)]">
                    {i + 1}. {CIP_PREFIX_LABELS[d.prefix] ?? `CIP ${d.prefix}`}
                  </span>
                  <span className="shrink-0 tabular-nums text-[var(--text-muted)]">{d.total.toLocaleString()}</span>
                </li>
              ))}
              {topDegrees.length === 0 && <li className="text-sm text-[var(--text-muted)]">—</li>}
            </ol>
          </div>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TimeSeriesChart
          title="Enrollment"
          data={byYear(series.enrollment)}
          series={[
            { key: "total", label: "Total" },
            { key: "undergradTotal", label: "Undergraduate" },
            { key: "gradTotal", label: "Graduate" },
          ]}
          format="number"
        />
        <TimeSeriesChart
          title="Admissions"
          data={byYear(series.admissions)}
          series={[{ key: "pctAdmittedTotal", label: "% admitted" }]}
          format="percent"
        />
        <TimeSeriesChart
          title="SAT scores (50th percentile)"
          data={byYear(series.admissions)}
          series={[
            { key: "satMath50", label: "SAT Math" },
            { key: "satReading50", label: "SAT Reading" },
          ]}
        />
        <TimeSeriesChart
          title="ACT Composite (50th percentile)"
          data={byYear(series.admissions)}
          series={[{ key: "actComposite50", label: "ACT Composite" }]}
        />
        <TimeSeriesChart
          title="Tuition & fees (in-state)"
          data={byYear(series.pricing)}
          series={[{ key: "tuitionFeesInState", label: "Tuition & fees" }]}
          format="currency"
        />
        <TimeSeriesChart
          title="Graduation rate"
          data={byYear(series.graduationRates)}
          series={[
            { key: "gradRateTotal", label: "Overall" },
            { key: "bachelor6yrRateTotal", label: "Bachelor's, 6-yr" },
          ]}
          format="percent"
        />
        <TimeSeriesChart
          title="Degrees conferred"
          data={byYear(series.completions)}
          series={[
            { key: "associates", label: "Associate's" },
            { key: "bachelors", label: "Bachelor's" },
            { key: "masters", label: "Master's" },
          ]}
          format="number"
        />
        <TimeSeriesChart
          title="Finance: core revenue & expense"
          data={byYear(series.finance)}
          series={[
            { key: "coreRevenueTotal", label: "Core revenue" },
            { key: "coreExpenseTotal", label: "Core expense" },
          ]}
          format="currencyM"
        />
        <TimeSeriesChart
          title="Financial aid: % receiving any aid"
          data={byYear(series.financialAid)}
          series={[{ key: "pctAwardedAnyAid", label: "% receiving any aid" }]}
          format="percent"
        />
      </div>

      <div className="mt-6">
        <PeerTable rows={peers} />
      </div>
    </div>
  );
}
