import Link from "next/link";
import { notFound } from "next/navigation";
import { getInstitution, getInstitutionTimeSeries, getPeers, DEFAULT_YEAR } from "@/db/queries";
import { INSTITUTION_TYPE_LABELS, CONTROL_LABELS } from "@/lib/institution-types";
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

  const [series, peers] = await Promise.all([
    getInstitutionTimeSeries(unitid),
    getPeers(unitid, DEFAULT_YEAR),
  ]);

  const typeLabel = INSTITUTION_TYPE_LABELS[institution.institutionType as keyof typeof INSTITUTION_TYPE_LABELS] ?? institution.institutionType;
  const controlLabel = institution.control ? CONTROL_LABELS[institution.control] ?? "—" : "—";

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <Link href="/institutions" className="text-sm text-[var(--series-1)] hover:underline">
        ← All institutions
      </Link>

      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{institution.name}</h1>
      <p className="mt-1 text-[var(--text-secondary)]">
        {institution.city}, {institution.state} · {typeLabel} · {controlLabel}
      </p>

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
          peers={peers.map((p) => ({ unitid: p.unitid, name: p.name, state: p.state, distance: p.distance }))}
        />
      </div>
    </div>
  );
}
