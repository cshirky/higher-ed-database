import { getNationwideTrends, type NationwideTrendRow } from "@/db/queries";
import { INSTITUTION_TYPE_LABELS, INSTITUTION_TYPE_COLORS, type InstitutionType } from "@/lib/institution-types";
import { TimeSeriesChart } from "@/components/time-series-chart";

const TYPES: Exclude<InstitutionType, "other">[] = ["college", "university", "graduate_school"];

function pivot(rows: NationwideTrendRow[], valueKey: keyof NationwideTrendRow) {
  const byYear = new Map<number, Record<string, unknown>>();
  for (const r of rows) {
    if (!byYear.has(r.year)) byYear.set(r.year, { year: r.year });
    byYear.get(r.year)![r.institutionType] = r[valueKey];
  }
  return [...byYear.values()].sort((a, b) => (a.year as number) - (b.year as number));
}

function seriesFor(label: (t: string) => string) {
  return TYPES.map((t) => ({
    key: t,
    label: label(t),
    color: INSTITUTION_TYPE_COLORS[t],
  }));
}

export default async function ComparePage() {
  const trends = await getNationwideTrends();
  const typeLabel = (t: string) => INSTITUTION_TYPE_LABELS[t as InstitutionType] ?? t;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Nationwide comparison</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Colleges, universities, and graduate schools, aggregated across every U.S. institution reporting to IPEDS,
        2010–2024.
      </p>

      <div className="mt-4 flex gap-4 text-sm">
        {TYPES.map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: INSTITUTION_TYPE_COLORS[t] }}
            />
            {INSTITUTION_TYPE_LABELS[t]}
          </span>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TimeSeriesChart
          title="Number of institutions"
          subtitle="Count of institutions reporting each year"
          data={pivot(trends, "institutionCount")}
          series={seriesFor(typeLabel)}
          format="compact"
        />
        <TimeSeriesChart
          title="Total enrollment"
          subtitle="Sum of fall headcount across all institutions of each type"
          data={pivot(trends, "totalEnrollment")}
          series={seriesFor(typeLabel)}
          format="compact"
        />
        <TimeSeriesChart
          title="Average tuition & fees (in-state)"
          data={pivot(trends, "avgTuition")}
          series={seriesFor(typeLabel)}
          format="currency"
        />
        <TimeSeriesChart
          title="Average admit rate"
          subtitle="Among institutions reporting admissions data"
          data={pivot(trends, "avgAdmitRate")}
          series={seriesFor(typeLabel)}
          format="percent"
        />
        <TimeSeriesChart
          title="Average graduation rate"
          data={pivot(trends, "avgGradRate")}
          series={seriesFor(typeLabel)}
          format="percent"
        />
        <TimeSeriesChart
          title="Average instructional spending per FTE"
          data={pivot(trends, "avgInstructionExpense")}
          series={seriesFor(typeLabel)}
          format="currency"
        />
      </div>
    </div>
  );
}
