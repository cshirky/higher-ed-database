import Link from "next/link";
import { notFound } from "next/navigation";
import { getInstitution, getInstitutionTimeSeries, getPeers, getAcademicPeers, getTopAndBottomDegrees, DEFAULT_YEAR } from "@/db/queries";
import { INSTITUTION_TYPE_LABELS, CONTROL_LABELS, LOCALE_LABELS } from "@/lib/institution-types";
import { CIP_PREFIX_LABELS } from "@/lib/cip-labels";
import { TimeSeriesChart } from "@/components/time-series-chart";
import { PeerNetwork } from "./peer-network";

function byYear<T extends { year: number }>(rows: T[]): Record<string, unknown>[] {
  return rows;
}

export default async function InstitutionPage({ params }: { params: Promise<{ unitid: string }> }) {
  const { unitid: unitidParam } = await params;
  const unitid = parseInt(unitidParam, 10);
  const institution = await getInstitution(unitid);
  if (!institution) notFound();

  const [series, overallPeers, academicPeers, degrees] = await Promise.all([
    getInstitutionTimeSeries(unitid),
    getPeers(unitid, DEFAULT_YEAR),
    getAcademicPeers(unitid, DEFAULT_YEAR),
    getTopAndBottomDegrees(unitid, DEFAULT_YEAR),
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
          <div className="col-span-2 sm:col-span-1">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Most Popular Degrees</p>
            <ol className="mt-1 space-y-0.5">
              {degrees.top5.map((d, i) => (
                <li key={d.prefix} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-[var(--text-secondary)]">
                    {i + 1}. {CIP_PREFIX_LABELS[d.prefix] ?? `CIP ${d.prefix}`}
                  </span>
                  <span className="shrink-0 tabular-nums text-[var(--text-muted)]">{d.total.toLocaleString()}</span>
                </li>
              ))}
              {degrees.top5.length === 0 && <li className="text-sm text-[var(--text-muted)]">—</li>}
            </ol>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Least Common Degrees</p>
            <ol className="mt-1 space-y-0.5">
              {degrees.bottom5.map((d) => (
                <li key={d.prefix} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-[var(--text-secondary)]">
                    {CIP_PREFIX_LABELS[d.prefix] ?? `CIP ${d.prefix}`}
                  </span>
                  <span className="shrink-0 tabular-nums text-[var(--text-muted)]">{d.total.toLocaleString()}</span>
                </li>
              ))}
              {degrees.bottom5.length === 0 && <li className="text-sm text-[var(--text-muted)]">—</li>}
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
          title="Financial aid: % receiving any grant"
          data={byYear(series.financialAid)}
          series={[{ key: "pctAwardedAnyGrant", label: "% receiving grant aid" }]}
          format="percent"
        />
      </div>

      <div className="mt-6">
        <PeerNetwork
          target={{ unitid: institution.unitid, name: institution.name, state: institution.state }}
          modes={[
            {
              key: "overall",
              label: "Overall profile",
              description:
                "Institutions of the same type, positioned by similarity across enrollment, admit rate, tuition, and instructional spending per student. Closer = more similar.",
              peers: overallPeers.map((p) => ({ unitid: p.unitid, name: p.name, state: p.state, distance: p.distance })),
            },
            {
              key: "academic",
              label: "Academic programs",
              description:
                "Institutions of the same type, positioned by overlap in subjects and degree levels offered and by how many students earn those degrees. Closer = more similar academic offerings.",
              peers: academicPeers.map((p) => ({ unitid: p.unitid, name: p.name, state: p.state, distance: p.distance })),
            },
          ]}
        />
      </div>
    </div>
  );
}
